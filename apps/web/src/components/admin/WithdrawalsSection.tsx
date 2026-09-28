import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, X, Eye, Check, AlertCircle,
  Loader2, RefreshCw, Clock, History, ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';

interface WithdrawalRow {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  accountHolder?: string | null;
  status: 'PENDING' | 'HELD' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  rejectionReason?: string | null;
  processedBy?: string | null;
  processedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
    memberSince?: string;
  };
  wallet?: { balance: number; reserved: number } | null;
  balanceInfo: {
    balanceBefore: number | null;
    balanceAfter: number | null;
    currentBalance: number | null;
    currentReserved: number | null;
  };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    status: string;
    description: string;
    createdAt: string;
  }>;
  releaseTx?: { amount: number; balanceBefore: number; balanceAfter: number; createdAt: string } | null;
  history?: Array<{
    id: string;
    amount: number;
    status: string;
    createdAt: string;
    processedAt?: string | null;
    rejectionReason?: string | null;
  }>;
}

type StatusFilter = 'PENDING' | 'HELD' | 'APPROVED' | 'COMPLETED' | 'REJECTED' | 'ALL';
type SortKey = 'newest' | 'oldest' | 'amount';

const PAGE_SIZE = 20;

/**
 * Professional Admin Withdrawals section.
 * Status tabs, search, date filters, sorting, pagination, detailed review
 * modal (user, balances, ledger trail, full withdrawal history), and guarded
 * approve/reject with confirmation dialogs. Real-time via `refreshTick`.
 */
export default function WithdrawalsSection({
  initialStatus = 'PENDING',
  refreshTick,
  onStatsChanged,
}: {
  initialStatus?: StatusFilter;
  refreshTick?: number;
  onStatsChanged?: () => void;
}) {
  const { token } = useAuth();

  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review/action modal state
  const [selected, setSelected] = useState<WithdrawalRow | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchWithdrawals = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sort,
      });
      if (status !== 'ALL') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(apiUrl(`/api/admin/withdrawals?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load withdrawals');
      setWithdrawals(data.data.withdrawals || []);
      setTotal(data.data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, status, search, sort, dateFrom, dateTo]);

  useEffect(() => { fetchWithdrawals(); }, [fetchWithdrawals, refreshTick]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openAction = (w: WithdrawalRow, kind: 'approve' | 'reject') => {
    setSelected(w);
    setReason('');
    setAction(kind);
    setConfirming(false);
    setActionError(null);
  };

  const submitAction = async () => {
    if (!selected || !action || !token) return;
    if (action === 'reject' && !reason.trim()) {
      setActionError('A rejection reason is required');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const endpoint =
        action === 'approve'
          ? apiUrl(`/api/admin/withdrawals/${selected.id}/approve`)
          : apiUrl(`/api/admin/withdrawals/${selected.id}/reject`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(action === 'approve' ? {} : { reason: reason.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || `Failed to ${action} withdrawal`);

      setConfirming(false);
      setAction(null);
      setSelected(null);
      await fetchWithdrawals();
      onStatsChanged?.();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      PENDING: 'bg-sky-orange/20 text-sky-orange border-sky-orange/40',
      HELD: 'bg-sky-red/20 text-sky-red border-sky-red/40',
      APPROVED: 'bg-sky-green/20 text-sky-green border-sky-green/40',
      COMPLETED: 'bg-sky-green/20 text-sky-green border-sky-green/40',
      REJECTED: 'bg-sky-red/20 text-sky-red border-sky-red/40',
    };
    return (
      <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-bold border ${map[s] || 'bg-sky-card text-sky-text-secondary border-sky-border'}`}>
        {s}
      </span>
    );
  };

  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined ? '—' : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tabs: { key: StatusFilter; label: string }[] = useMemo(() => [
    { key: 'PENDING', label: 'Pending' },
    { key: 'HELD', label: 'Held (risk)' },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'ALL', label: 'All' },
  ], []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ArrowUpRight size={18} className="text-sky-orange" /> Withdrawals
          <span className="text-sm font-normal text-sky-text-muted">({total})</span>
        </h2>
        <button onClick={fetchWithdrawals} className="p-2 rounded-lg hover:bg-sky-card-hover text-sky-text-secondary hover:text-white transition-colors" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-sky-card border border-sky-border rounded-xl p-1 w-fit overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              status === t.key ? 'bg-sky-dark text-white' : 'text-sky-text-secondary hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-sky-card border border-sky-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-text-muted" />
          <input
            type="text"
            placeholder="Search name, email, account..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as SortKey); setPage(0); }}
          className="px-3 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="amount">Highest amount</option>
        </select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-sky-text-muted whitespace-nowrap">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
            className="flex-1 min-w-0 px-2 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-sky-text-muted whitespace-nowrap">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
            className="flex-1 min-w-0 px-2 py-2 bg-sky-dark border border-sky-border rounded-lg text-white text-sm focus:outline-none focus:border-sky-green [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12"><Loader2 className="animate-spin h-8 w-8 text-sky-green mx-auto" /></div>
      ) : error ? (
        <div className="bg-sky-red/10 border border-sky-red/30 rounded-xl p-4 text-sky-red text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
          <button onClick={fetchWithdrawals} className="ml-auto px-3 py-1.5 bg-sky-red/20 hover:bg-sky-red/30 rounded-lg text-xs font-medium">Retry</button>
        </div>
      ) : withdrawals.length === 0 ? (
        <div className="bg-sky-card border border-sky-border rounded-xl p-10 text-center">
          <Clock size={28} className="text-sky-text-muted mx-auto mb-3" />
          <p className="text-sky-text-secondary">No {status === 'ALL' ? '' : status.toLowerCase() + ' '}withdrawals found</p>
          {(search || dateFrom || dateTo) && (
            <p className="text-sky-text-muted text-xs mt-1">Try clearing search or date filters</p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-sky-card border border-sky-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Method / Account</th>
                  <th className="px-4 py-3 text-left">Balance</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {withdrawals.map((w) => (
                  <tr key={w.id} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{w.user.name}</div>
                      <div className="text-sky-text-muted text-xs">{w.user.email}</div>
                      {w.user.phone && <div className="text-sky-text-muted text-xs">{w.user.phone}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono text-white font-semibold">{fmt(w.amount)} ETB</td>
                    <td className="px-4 py-3">
                      <div className="text-sky-text-secondary">{w.paymentMethod}</div>
                      <div className="font-mono text-sky-text-muted text-xs">{w.accountNumber}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="text-sky-green">{fmt(w.balanceInfo.currentBalance)}</div>
                      {(w.balanceInfo.currentReserved ?? 0) > 0 && (
                        <div className="text-sky-orange">{fmt(w.balanceInfo.currentReserved)} res</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(w.status)}</td>
                    <td className="px-4 py-3 text-sky-text-muted text-xs">{new Date(w.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setSelected(w); setAction(null); setShowHistory(false); }}
                          className="p-2 hover:bg-sky-dark rounded-lg text-sky-blue hover:text-sky-green transition-colors"
                          title="View details"
                        >
                          <Eye size={15} />
                        </button>
                        {(w.status === 'PENDING' || w.status === 'HELD') && (
                          <>
                            <button
                              onClick={() => openAction(w, 'approve')}
                              className="p-2 hover:bg-sky-dark rounded-lg text-sky-green transition-colors"
                              title="Approve"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => openAction(w, 'reject')}
                              className="p-2 hover:bg-sky-dark rounded-lg text-sky-red transition-colors"
                              title="Reject"
                            >
                              <X size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="bg-sky-card border border-sky-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-white font-medium text-sm">{w.user.name}</div>
                    <div className="text-sky-text-muted text-xs">{w.user.email}</div>
                  </div>
                  {statusBadge(w.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono text-white font-semibold">{fmt(w.amount)} ETB</span>
                  <span className="text-sky-text-muted text-xs">{w.paymentMethod} · {w.accountNumber}</span>
                </div>
                <div className="mt-1 text-sky-text-muted text-xs">{new Date(w.createdAt).toLocaleString()}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setSelected(w); setAction(null); }} className="flex-1 px-3 py-2 bg-sky-dark rounded-lg text-sky-text-secondary text-xs font-medium flex items-center justify-center gap-1">
                    <Eye size={13} /> Details
                  </button>
                  {(w.status === 'PENDING' || w.status === 'HELD') && (
                    <>
                      <button onClick={() => openAction(w, 'approve')} className="flex-1 px-3 py-2 bg-sky-green/20 text-sky-green rounded-lg text-xs font-bold">Approve</button>
                      <button onClick={() => openAction(w, 'reject')} className="flex-1 px-3 py-2 bg-sky-red/20 text-sky-red rounded-lg text-xs font-bold">Reject</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {/* Detail modal */}
      {selected && !action && (
        <Modal title="Withdrawal Review" onClose={() => setSelected(null)} wide>
          <div className="space-y-5">
            {/* User */}
            <Section title="User">
              <Grid>
                <Cell label="Full Name" value={selected.user.name} />
                <Cell label="Email" value={selected.user.email} mono />
                <Cell label="Phone" value={selected.user.phone || '—'} mono />
                <Cell label="User ID" value={selected.user.id} mono small />
              </Grid>
            </Section>

            {/* Withdrawal */}
            <Section title="Withdrawal Request">
              <Grid>
                <Cell label="Amount" value={`${fmt(selected.amount)} ETB`} bold />
                <Cell label="Payment Method" value={selected.paymentMethod} />
                <Cell label="Account / Phone" value={selected.accountNumber} mono />
                {selected.accountHolder && <Cell label="Account Holder" value={selected.accountHolder} />}
                <Cell label="Status" value={statusBadge(selected.status)} />
                <Cell label="Submitted" value={new Date(selected.createdAt).toLocaleString()} small />
                {selected.processedAt && <Cell label="Processed" value={new Date(selected.processedAt).toLocaleString()} small />}
              </Grid>
            </Section>

            {/* Balance info */}
            <Section title="Balance Information">
              <Grid>
                <Cell label="Balance Before Request" value={selected.balanceInfo.balanceBefore != null ? `${fmt(selected.balanceInfo.balanceBefore)} ETB` : '—'} mono />
                <Cell label="Available After Reserve" value={selected.balanceInfo.balanceAfter != null ? `${fmt(selected.balanceInfo.balanceAfter)} ETB` : '—'} mono />
                <Cell label="Current Balance" value={selected.balanceInfo.currentBalance != null ? `${fmt(selected.balanceInfo.currentBalance)} ETB` : '—'} mono />
                <Cell label="Currently Reserved" value={selected.balanceInfo.currentReserved != null ? `${fmt(selected.balanceInfo.currentReserved)} ETB` : '—'} mono orange />
              </Grid>
            </Section>

            {/* Ledger trail */}
            {selected.transactions.length > 0 && (
              <Section title="Transaction / Ledger Records">
                <div className="space-y-2">
                  {selected.transactions.map((t) => (
                    <div key={t.id} className="bg-sky-dark rounded-lg p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-mono text-sky-blue">{t.type}</span>
                        <span className={`font-mono ${t.amount >= 0 ? 'text-sky-green' : 'text-sky-red'}`}>
                          {t.amount >= 0 ? '+' : ''}{fmt(t.amount)} ETB
                        </span>
                      </div>
                      <div className="flex justify-between text-sky-text-muted">
                        <span>Balance {fmt(t.balanceBefore)} → {fmt(t.balanceAfter)} ETB</span>
                        <span className={`px-1.5 rounded ${t.status === 'PENDING' ? 'bg-sky-orange/20 text-sky-orange' : 'bg-sky-green/20 text-sky-green'}`}>{t.status}</span>
                      </div>
                      <div className="text-sky-text-muted">{t.description}</div>
                      <div className="text-sky-text-muted text-[10px]">{new Date(t.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Withdrawal history */}
            {selected.history && selected.history.length > 0 && (
              <Section title={`User Withdrawal History (${selected.history.length})`}>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-xs text-sky-green hover:text-sky-green-light flex items-center gap-1 font-medium"
                >
                  <History size={12} /> {showHistory ? 'Hide' : 'Show'} history
                </button>
                {showHistory && (
                  <div className="mt-2 space-y-1.5">
                    {selected.history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between bg-sky-dark rounded-lg px-3 py-2 text-xs">
                        <span className="font-mono text-white">{fmt(h.amount)} ETB</span>
                        <span className="text-sky-text-muted">{new Date(h.createdAt).toLocaleDateString()}</span>
                        {statusBadge(h.status)}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}

            {/* Rejection reason */}
            {selected.status === 'REJECTED' && selected.rejectionReason && (
              <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                <div className="text-xs text-sky-red font-bold mb-1">Rejection Reason</div>
                <p className="text-sky-red text-sm">{selected.rejectionReason}</p>
              </div>
            )}

            {/* Risk-engine auto-hold annotation */}
            {selected.status === 'HELD' && selected.rejectionReason && (
              <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                <div className="text-xs text-sky-red font-bold mb-1">⚠ Risk Auto-Hold — Admin Review Required</div>
                <p className="text-sky-red text-sm">{selected.rejectionReason}</p>
              </div>
            )}

            {/* Actions */}
            {(selected.status === 'PENDING' || selected.status === 'HELD') && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => openAction(selected, 'approve')}
                  className="flex-1 px-4 py-3 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} /> Approve
                </button>
                <button
                  onClick={() => openAction(selected, 'reject')}
                  className="flex-1 px-4 py-3 bg-sky-red/20 hover:bg-sky-red/30 text-sky-red font-bold rounded-lg border border-sky-red/30 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={16} /> Reject
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Action modal */}
      {selected && action && (
        <Modal
          title={action === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
          onClose={() => { if (!actionLoading) { setAction(null); setConfirming(false); setActionError(null); } }}
        >
          <div className="space-y-4">
            <div className="bg-sky-dark rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">User</span>
                <span className="text-white font-medium">{selected.user.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">Amount</span>
                <span className="text-white font-mono font-bold">{fmt(selected.amount)} ETB</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">Send to</span>
                <span className="text-white font-mono text-xs">{selected.paymentMethod} · {selected.accountNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">Currently reserved</span>
                <span className="text-sky-orange font-mono">{fmt(selected.balanceInfo.currentReserved)} ETB</span>
              </div>
            </div>

            {!confirming ? (
              <>
                {action === 'reject' && (
                  <div>
                    <label htmlFor="w-reject-reason" className="block text-sm font-bold text-white mb-2">
                      Rejection Reason *
                    </label>
                    <textarea
                      id="w-reject-reason"
                      value={reason}
                      onChange={(e) => { setReason(e.target.value); setActionError(null); }}
                      placeholder="e.g., invalid account number, suspicious activity..."
                      rows={3}
                      className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green resize-none"
                      autoFocus
                    />
                    <p className="text-xs text-sky-blue mt-2">
                      The reserved {fmt(selected.amount)} ETB will be released back to the user's available balance exactly once.
                    </p>
                  </div>
                )}
                {action === 'approve' && (
                  <p className="text-xs text-sky-blue bg-sky-dark rounded-lg p-3">
                    Approving clears the reservation and marks the withdrawal paid. The balance was already reserved at submission — nothing is deducted twice.
                  </p>
                )}

                {actionError && (
                  <div className="flex gap-2 bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                    <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
                    <p className="text-sky-red text-sm">{actionError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setAction(null); setActionError(null); }}
                    className="flex-1 px-4 py-3 border border-sky-border text-sky-text-secondary hover:bg-sky-card-hover font-bold rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (action === 'reject' && !reason.trim()) { setActionError('A rejection reason is required'); return; }
                      setActionError(null);
                      setConfirming(true);
                    }}
                    className={`flex-1 px-4 py-3 font-bold rounded-lg transition-colors ${
                      action === 'approve'
                        ? 'bg-sky-green hover:bg-sky-green-dark text-sky-dark'
                        : 'bg-sky-red hover:bg-sky-red-dark text-white'
                    }`}
                  >
                    Review & Confirm
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={`rounded-lg p-5 text-center border ${
                  action === 'approve' ? 'bg-sky-green/10 border-sky-green/30' : 'bg-sky-red/10 border-sky-red/30'
                }`}>
                  <AlertCircle size={36} className={`mx-auto mb-3 ${action === 'approve' ? 'text-sky-green' : 'text-sky-red'}`} />
                  <h4 className="text-white font-bold mb-1">
                    {action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </h4>
                  <p className="text-sky-text-secondary text-sm">
                    {action === 'approve' ? (
                      <>Approve the payout of <span className="text-white font-bold font-mono">{fmt(selected.amount)} ETB</span> to <span className="text-white font-bold">{selected.user.name}</span> ({selected.accountNumber})?</>
                    ) : (
                      <>Reject and release <span className="text-white font-bold font-mono">{fmt(selected.amount)} ETB</span> back to <span className="text-white font-bold">{selected.user.name}</span>?</>
                    )}
                  </p>
                  {action === 'reject' && reason.trim() && (
                    <p className="text-sky-text-muted text-xs mt-2">Reason: "{reason.trim()}"</p>
                  )}
                </div>

                {actionError && (
                  <div className="flex gap-2 bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                    <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
                    <p className="text-sky-red text-sm">{actionError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    disabled={actionLoading}
                    className="flex-1 px-4 py-3 border border-sky-border text-sky-text-secondary hover:bg-sky-card-hover font-bold rounded-lg transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={submitAction}
                    disabled={actionLoading}
                    className={`flex-1 px-4 py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      action === 'approve'
                        ? 'bg-sky-green hover:bg-sky-green-dark text-sky-dark'
                        : 'bg-sky-red hover:bg-sky-red-dark text-white'
                    }`}
                  >
                    {actionLoading && <Loader2 size={16} className="animate-spin" />}
                    {actionLoading ? 'Processing...' : action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- tiny shared bits (local to this section) ----------

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-sky-card border border-sky-border rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto`}>
        <div className="sticky top-0 bg-sky-card border-b border-sky-border px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-sky-card-hover text-sky-text-muted hover:text-white transition-colors" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-sky-text-secondary uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{children}</div>;
}

function Cell({ label, value, mono, bold, green, orange, small }: {
  label: string; value: React.ReactNode; mono?: boolean; bold?: boolean; green?: boolean; orange?: boolean; small?: boolean;
}) {
  return (
    <div className="bg-sky-dark rounded-lg p-3">
      <div className="text-[11px] text-sky-text-muted mb-0.5">{label}</div>
      <div className={`${small ? 'text-xs' : 'text-sm'} ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'} ${green ? 'text-sky-green' : orange ? 'text-sky-orange' : 'text-white'} break-all`}>
        {value}
      </div>
    </div>
  );
}

function Pagination({ page, pageCount, total, pageSize, onPageChange }: {
  page: number; pageCount: number; total: number; pageSize: number; onPageChange: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <p className="text-sky-text-muted text-sm">
        Showing {total === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 bg-sky-card border border-sky-border rounded-lg text-sky-text-secondary hover:bg-sky-card-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Prev
        </button>
        <span className="px-3 py-1.5 text-xs text-sky-text-muted">Page {page + 1} / {pageCount}</span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={(page + 1) * pageSize >= total}
          className="px-3 py-1.5 bg-sky-card border border-sky-border rounded-lg text-sky-text-secondary hover:bg-sky-card-hover disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors flex items-center gap-1"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

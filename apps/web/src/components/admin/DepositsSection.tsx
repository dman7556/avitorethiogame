import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, ChevronLeft, ChevronRight, X, Eye, Check, AlertCircle,
  Loader2, Image as ImageIcon, ExternalLink, RefreshCw, Clock,
  ArrowDownLeft, RotateCw, ZoomIn, ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl } from '../../lib/config';
import { adminActionErrorMessage } from '../../lib/adminErrors';

interface DepositRow {
  id: string;
  userId: string;
  submittedAmount: number;
  verifiedAmount: number | null;
  paymentMethod: string;
  screenshotUrl?: string | null;
  screenshotPublicId?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
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
}

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
type SortKey = 'newest' | 'oldest' | 'amount';

const PAGE_SIZE = 20;

/**
 * Professional Admin Deposits section.
 * Status tabs, search, date filters, sorting, pagination, detail review
 * modal with screenshot preview, and guarded approve/reject flows with
 * confirmation dialogs. Real-time refresh via `refreshTick` from parent.
 */
export default function DepositsSection({
  initialStatus = 'PENDING',
  refreshTick,
  onStatsChanged,
}: {
  initialStatus?: StatusFilter;
  refreshTick?: number;
  onStatsChanged?: () => void;
}) {
  const { token } = useAuth();

  const [deposits, setDeposits] = useState<DepositRow[]>([]);
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

  // Review modal state
  const [selected, setSelected] = useState<DepositRow | null>(null);
  const [zoom, setZoom] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Authenticated fallback URL for <img> when the direct URL fails
  const rawShotUrl = selected && token
    ? apiUrl(`/api/deposits/${selected.id}/screenshot/raw?token=${encodeURIComponent(token)}`)
    : null;

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchDeposits = useCallback(async () => {
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

      const res = await fetch(apiUrl(`/api/admin/deposits?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load deposits');
      setDeposits(data.data.deposits || []);
      setTotal(data.data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, status, search, sort, dateFrom, dateTo]);

  useEffect(() => { fetchDeposits(); }, [fetchDeposits, refreshTick]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openApprove = (d: DepositRow) => {
    setSelected(d);
    setCreditAmount(d.submittedAmount > 0 ? d.submittedAmount.toFixed(2) : '');
    setReason('');
    setAction('approve');
    setConfirming(false);
    setActionError(null);
    setImgFailed(false);
    setRotation(0);
  };

  const openReject = (d: DepositRow) => {
    setSelected(d);
    setCreditAmount('');
    setReason('');
    setAction('reject');
    setConfirming(false);
    setActionError(null);
    setImgFailed(false);
    setRotation(0);
  };

  const submitAction = async () => {
    if (!selected || !action || !token) return;

    // Client-side guards mirroring the server rules
    if (action === 'approve') {
      const amt = parseFloat(creditAmount);
      if (!isFinite(amt) || amt <= 0) { setActionError('Enter a valid credit amount greater than 0'); return; }
      if (Math.round(amt * 100) !== amt * 100) { setActionError('Amount supports at most 2 decimal places'); return; }
      // Approvals always need a recorded reason. Credits beyond the max
      // deposit cap are rejected by the server and demand a second admin.
      if (!reason.trim()) { setActionError('An approval reason is required'); return; }
    } else if (!reason.trim()) {
      setActionError('A rejection reason is required');
      return;
    }

    setActionLoading(true);
    setActionError(null);
    try {
      const endpoint =
        action === 'approve'
          ? apiUrl(`/api/admin/deposits/${selected.id}/approve`)
          : apiUrl(`/api/admin/deposits/${selected.id}/reject`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(
          action === 'approve'
            ? { creditAmount: parseFloat(creditAmount), reason: reason.trim() }
            : { reason: reason.trim() }
        ),
      });
      const data = await res.json();
      if (!data.success) throw new Error(adminActionErrorMessage(data.code, data.error));

      // Close modals and refresh the list + dashboard totals
      setConfirming(false);
      setAction(null);
      setSelected(null);
      await fetchDeposits();
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
      APPROVED: 'bg-sky-green/20 text-sky-green border-sky-green/40',
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
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'ALL', label: 'All' },
  ], []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ArrowDownLeft size={18} className="text-sky-blue" /> Deposits
          <span className="text-sm font-normal text-sky-text-muted">({total})</span>
        </h2>
        <button onClick={fetchDeposits} className="p-2 rounded-lg hover:bg-sky-card-hover text-sky-text-secondary hover:text-white transition-colors" title="Refresh">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-sky-card border border-sky-border rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setStatus(t.key); setPage(0); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
            placeholder="Search name, email, phone..."
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
          <button onClick={fetchDeposits} className="ml-auto px-3 py-1.5 bg-sky-red/20 hover:bg-sky-red/30 rounded-lg text-xs font-medium">Retry</button>
        </div>
      ) : deposits.length === 0 ? (
        <div className="bg-sky-card border border-sky-border rounded-xl p-10 text-center">
          <Clock size={28} className="text-sky-text-muted mx-auto mb-3" />
          <p className="text-sky-text-secondary">No {status === 'ALL' ? '' : status.toLowerCase() + ' '}deposits found</p>
          {(search || dateFrom || dateTo) && (
            <p className="text-sky-text-muted text-xs mt-1">Try clearing search or date filters</p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-sky-card border border-sky-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead>
                <tr className="border-b border-sky-border text-xs text-sky-text-muted">
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Method</th>
                  <th className="px-4 py-3 text-left">Screenshot</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Submitted</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-border/50">
                {deposits.map((d) => (
                  <tr key={d.id} className="hover:bg-sky-card-hover transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{d.user.name}</div>
                      <div className="text-sky-text-muted text-xs">{d.user.email}</div>
                      {d.user.phone && <div className="text-sky-text-muted text-xs">{d.user.phone}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-white font-semibold">
                        {d.submittedAmount > 0 ? `${fmt(d.submittedAmount)} ETB` : 'To verify'}
                      </div>
                      {d.verifiedAmount != null && (
                        <div className="text-xs text-sky-green font-mono">credited {fmt(d.verifiedAmount)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sky-text-secondary">{d.paymentMethod}</td>
                    <td className="px-4 py-3">
                      {d.screenshotUrl ? (
                        <button
                          onClick={() => { setSelected(d); setZoom(false); setImgFailed(false); setRotation(0); }}
                          className="w-14 h-14 rounded-lg overflow-hidden border border-sky-border hover:border-sky-green hover:scale-105 transition-all"
                          title="View screenshot evidence"
                        >
                          <img
                            src={d.screenshotUrl}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget;
                              if (token && !el.dataset.fallback) {
                                el.dataset.fallback = '1';
                                el.src = apiUrl(`/api/deposits/${d.id}/screenshot/raw?token=${encodeURIComponent(token)}`);
                              }
                            }}
                          />
                        </button>
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-sky-dark flex items-center justify-center">
                          <ImageIcon size={14} className="text-sky-text-muted" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">{statusBadge(d.status)}</td>
                    <td className="px-4 py-3 text-sky-text-muted text-xs">{new Date(d.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => { setSelected(d); setAction(null); setImgFailed(false); setRotation(0); }}
                          className="p-2 hover:bg-sky-dark rounded-lg text-sky-blue hover:text-sky-green transition-colors"
                          title="View details"
                        >
                          <Eye size={15} />
                        </button>
                        {d.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => openApprove(d)}
                              className="p-2 hover:bg-sky-dark rounded-lg text-sky-green transition-colors"
                              title="Approve"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={() => openReject(d)}
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
            {deposits.map((d) => (
              <div key={d.id} className="bg-sky-card border border-sky-border rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-white font-medium text-sm">{d.user.name}</div>
                    <div className="text-sky-text-muted text-xs">{d.user.email}</div>
                  </div>
                  {statusBadge(d.status)}
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="font-mono text-white font-semibold">
                    {d.submittedAmount > 0 ? `${fmt(d.submittedAmount)} ETB` : 'To verify'}
                  </span>
                  <span className="text-sky-text-muted text-xs">{d.paymentMethod}</span>
                </div>
                <div className="mt-1 text-sky-text-muted text-xs">{new Date(d.createdAt).toLocaleString()}</div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => { setSelected(d); setAction(null); setImgFailed(false); setRotation(0); }} className="flex-1 px-3 py-2 bg-sky-dark rounded-lg text-sky-text-secondary text-xs font-medium flex items-center justify-center gap-1">
                    <Eye size={13} /> Details
                  </button>
                  {d.status === 'PENDING' && (
                    <>
                      <button onClick={() => openApprove(d)} className="flex-1 px-3 py-2 bg-sky-green/20 text-sky-green rounded-lg text-xs font-bold">Approve</button>
                      <button onClick={() => openReject(d)} className="flex-1 px-3 py-2 bg-sky-red/20 text-sky-red rounded-lg text-xs font-bold">Reject</button>
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
        <Modal
          title="Deposit Review"
          onClose={() => { setSelected(null); setZoom(false); }}
          wide
        >
          <div className="space-y-5">
            {/* User info */}
            <Section title="User">
              <Grid>
                <Cell label="Full Name" value={selected.user.name} />
                <Cell label="Email" value={selected.user.email} mono />
                <Cell label="Phone" value={selected.user.phone || '—'} mono />
                <Cell label="User ID" value={selected.user.id} mono small />
              </Grid>
            </Section>

            {/* Deposit info */}
            <Section title="Deposit">
              <Grid>
                <Cell label="Requested Amount" value={selected.submittedAmount > 0 ? `${fmt(selected.submittedAmount)} ETB` : 'Not provided'} bold />
                {selected.verifiedAmount != null && (
                  <Cell label="Credited Amount" value={`${fmt(selected.verifiedAmount)} ETB`} bold green />
                )}
                <Cell label="Payment Method" value={selected.paymentMethod} />
                <Cell label="Status" value={<span>{statusBadge(selected.status)}</span>} />
                <Cell label="Submitted" value={new Date(selected.createdAt).toLocaleString()} small />
                {selected.processedAt && (
                  <Cell label="Processed" value={new Date(selected.processedAt).toLocaleString()} small />
                )}
              </Grid>
            </Section>

            {/* Wallet snapshot */}
            <Section title="Balance Information">
              <Grid>
                <Cell label="Balance Before Approval" value={selected.balanceInfo.balanceBefore != null ? `${fmt(selected.balanceInfo.balanceBefore)} ETB` : '—'} mono />
                <Cell label="Balance After Approval" value={selected.balanceInfo.balanceAfter != null ? `${fmt(selected.balanceInfo.balanceAfter)} ETB` : '—'} mono />
                <Cell label="Current Balance" value={selected.balanceInfo.currentBalance != null ? `${fmt(selected.balanceInfo.currentBalance)} ETB` : '—'} mono />
                <Cell label="Current Reserved" value={selected.balanceInfo.currentReserved != null ? `${fmt(selected.balanceInfo.currentReserved)} ETB` : '—'} mono />
              </Grid>
            </Section>

            {/* Screenshot — approval evidence */}
            <Section title="Payment Screenshot (Approval Evidence)">
              {selected.screenshotUrl ? (
                <div className="space-y-2">
                  {!imgFailed ? (
                    <div className="relative bg-black/40 rounded-lg border border-sky-border flex items-center justify-center" style={{ minHeight: '260px' }}>
                      <img
                        src={selected.screenshotUrl}
                        alt="Payment screenshot evidence"
                        onError={(e) => {
                          const el = e.currentTarget;
                          if (rawShotUrl && !el.dataset.fallback) {
                            el.dataset.fallback = '1';
                            el.src = rawShotUrl;
                          } else {
                            setImgFailed(true);
                          }
                        }}
                        onClick={() => setZoom(true)}
                        className="max-w-full cursor-zoom-in"
                        style={{
                          maxHeight: '420px',
                          objectFit: 'contain',
                          transform: `rotate(${rotation}deg)`,
                          transition: 'transform 0.2s ease',
                        }}
                      />
                      {/* Toolbar */}
                      <div className="absolute top-2 right-2 flex gap-1.5">
                        <button
                          onClick={() => setRotation((r) => (r + 90) % 360)}
                          className="p-2 bg-sky-card/90 border border-sky-border rounded-lg text-sky-text-secondary hover:text-white transition-colors"
                          title="Rotate 90°"
                        >
                          <RotateCw size={14} />
                        </button>
                        <button
                          onClick={() => setZoom(true)}
                          className="p-2 bg-sky-card/90 border border-sky-border rounded-lg text-sky-text-secondary hover:text-white transition-colors"
                          title="Full screen"
                        >
                          <ZoomIn size={14} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4 flex items-start gap-3">
                      <ShieldAlert size={18} className="text-sky-red flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <p className="text-sky-red font-semibold mb-1">Screenshot could not be displayed</p>
                        <p className="text-sky-text-secondary text-xs mb-2">
                          The stored image may have been deleted from storage or the URL is broken.
                          Ask the user to re-submit, or reject the deposit with reason "evidence unavailable".
                        </p>
                        <div className="flex gap-2">
                          <button onClick={() => setImgFailed(false)} className="px-3 py-1.5 bg-sky-card border border-sky-border rounded text-xs text-sky-text-secondary hover:text-white">Retry</button>
                          {rawShotUrl && (
                            <a href={rawShotUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-sky-card border border-sky-border rounded text-xs text-sky-green hover:text-sky-green-light flex items-center gap-1">
                              Try direct link <ExternalLink size={11} />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-sky-text-muted">
                    <span className="font-mono break-all">{selected.screenshotPublicId || 'cloudinary asset'}</span>
                    <a
                      href={rawShotUrl || selected.screenshotUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-green hover:text-sky-green-light flex items-center gap-1 font-medium"
                    >
                      Open original <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 bg-sky-dark rounded-lg text-sky-text-muted text-sm flex flex-col items-center gap-2">
                  <ImageIcon size={22} />
                  No screenshot uploaded
                </div>
              )}
            </Section>

            {/* Ledger transactions */}
            {selected.transactions.length > 0 && (
              <Section title="Transaction Records">
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
                        <span>{fmt(t.balanceBefore)} → {fmt(t.balanceAfter)} ETB</span>
                        <span>{new Date(t.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="text-sky-text-muted">{t.description}</div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Rejection reason */}
            {selected.status === 'REJECTED' && selected.rejectionReason && (
              <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                <div className="text-xs text-sky-red font-bold mb-1">Rejection Reason</div>
                <p className="text-sky-red text-sm">{selected.rejectionReason}</p>
              </div>
            )}

            {/* Actions */}
            {selected.status === 'PENDING' && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => openApprove(selected)}
                  className="flex-1 px-4 py-3 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={16} /> Approve
                </button>
                <button
                  onClick={() => openReject(selected)}
                  className="flex-1 px-4 py-3 bg-sky-red/20 hover:bg-sky-red/30 text-sky-red font-bold rounded-lg border border-sky-red/30 transition-colors flex items-center justify-center gap-2"
                >
                  <X size={16} /> Reject
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Screenshot zoom (full-screen evidence viewer) */}
      {selected && zoom && selected.screenshotUrl && (
        <div className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          <img
            src={selected.screenshotUrl}
            alt="Payment screenshot full size"
            className="max-w-full max-h-full object-contain"
            style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.2s ease' }}
            onError={(e) => {
              const el = e.currentTarget;
              if (rawShotUrl && !el.dataset.fallback) {
                el.dataset.fallback = '1';
                el.src = rawShotUrl;
              }
            }}
          />
          <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2.5 bg-sky-card rounded-lg text-white hover:bg-sky-card-hover"
              aria-label="Rotate"
              title="Rotate 90°"
            >
              <RotateCw size={18} />
            </button>
            <button
              onClick={() => setZoom(false)}
              className="p-2.5 bg-sky-card rounded-lg text-white hover:bg-sky-card-hover"
              aria-label="Close zoom"
            >
              <X size={18} />
            </button>
          </div>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sky-text-muted text-xs">
            Click anywhere to close · {selected.user.name} · {selected.paymentMethod}
          </div>
        </div>
      )}

      {/* Action modal */}
      {selected && action && (
        <Modal
          title={action === 'approve' ? 'Approve Deposit' : 'Reject Deposit'}
          onClose={() => { if (!actionLoading) { setAction(null); setConfirming(false); setActionError(null); } }}
        >
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-sky-dark rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">User</span>
                <span className="text-white font-medium">{selected.user.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">Submitted</span>
                <span className="text-white font-mono">
                  {selected.submittedAmount > 0 ? `${fmt(selected.submittedAmount)} ETB` : 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-sky-text-secondary">Current Balance</span>
                <span className="text-white font-mono">{fmt(selected.balanceInfo.currentBalance)} ETB</span>
              </div>
            </div>

            {!confirming ? (
              <>
                {action === 'approve' ? (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="credit-amount" className="block text-sm font-bold text-white mb-2">
                        Exact Amount to Credit (ETB) *
                      </label>
                      <input
                        id="credit-amount"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        value={creditAmount}
                        onChange={(e) => { setCreditAmount(e.target.value); setActionError(null); }}
                        placeholder="0.00"
                        className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white font-mono focus:outline-none focus:border-sky-green"
                        autoFocus
                      />
                      <p className="text-xs text-sky-blue mt-2">
                        Credit exactly what the user actually paid — it can differ from the submitted amount.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="approve-reason" className="block text-sm font-bold text-white mb-2">
                        Approval Reason *
                      </label>
                      <textarea
                        id="approve-reason"
                        value={reason}
                        onChange={(e) => { setReason(e.target.value); setActionError(null); }}
                        placeholder="Explain why this deposit is approved (e.g., payment verified, screenshot matches amount)..."
                        rows={3}
                        className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green resize-none"
                      />
                      <p className="text-xs text-sky-blue mt-2">
                        Required for audit trail and compliance purposes.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="reject-reason" className="block text-sm font-bold text-white mb-2">
                      Rejection Reason *
                    </label>
                    <textarea
                      id="reject-reason"
                      value={reason}
                      onChange={(e) => { setReason(e.target.value); setActionError(null); }}
                      placeholder="Explain why this deposit is rejected..."
                      rows={3}
                      className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green resize-none"
                      autoFocus
                    />
                  </div>
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
                      if (action === 'approve') {
                        const amt = parseFloat(creditAmount);
                        if (!isFinite(amt) || amt <= 0) { setActionError('Enter a valid credit amount'); return; }
                        if (!reason.trim()) { setActionError('An approval reason is required'); return; }
                        if (reason.trim().length < 4) { setActionError('Approval reason must be at least 4 characters'); return; }
                      } else {
                        if (!reason.trim()) { setActionError('A rejection reason is required'); return; }
                        if (reason.trim().length < 4) { setActionError('Rejection reason must be at least 4 characters'); return; }
                      }
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
                {/* Confirmation dialog */}
                <div className={`rounded-lg p-5 text-center border ${
                  action === 'approve' ? 'bg-sky-green/10 border-sky-green/30' : 'bg-sky-red/10 border-sky-red/30'
                }`}>
                  <AlertCircle size={36} className={`mx-auto mb-3 ${action === 'approve' ? 'text-sky-green' : 'text-sky-red'}`} />
                  <h4 className="text-white font-bold mb-1">
                    {action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
                  </h4>
                  <p className="text-sky-text-secondary text-sm">
                    {action === 'approve' ? (
                      <>Credit <span className="text-white font-bold font-mono">{fmt(parseFloat(creditAmount) || 0)} ETB</span> to <span className="text-white font-bold">{selected.user.name}</span>'s wallet?</>
                    ) : (
                      <>Reject this deposit from <span className="text-white font-bold">{selected.user.name}</span>? No balance change will occur.</>
                    )}
                  </p>
                  {reason.trim() && (
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

function Cell({ label, value, mono, bold, green, small }: {
  label: string; value: React.ReactNode; mono?: boolean; bold?: boolean; green?: boolean; small?: boolean;
}) {
  return (
    <div className="bg-sky-dark rounded-lg p-3">
      <div className="text-[11px] text-sky-text-muted mb-0.5">{label}</div>
      <div className={`${small ? 'text-xs' : 'text-sm'} ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'} ${green ? 'text-sky-green' : 'text-white'} break-all`}>
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

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ChevronLeft, Check, AlertCircle } from 'lucide-react';
import { apiUrl } from '../../lib/config';

interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  accountHolder?: string;
  status: 'PENDING' | 'COMPLETED' | 'REJECTED';
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    wallet?: {
      balance: number;
      reserved: number;
    };
  };
}

type ViewMode = 'list' | 'details' | 'approval';

export default function WithdrawalApprovalPage() {
  const { token } = useAuth();
  
  // List view state
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'COMPLETED' | 'REJECTED'>('PENDING');
  const [search, setSearch] = useState('');
  
  // Navigation state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  
  // Approval state
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [showActionConfirm, setShowActionConfirm] = useState<'approve' | 'reject' | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [actionLoading, setActionLoading] = useState(false);

  // Load withdrawals on mount and when filter changes
  useEffect(() => {
    fetchWithdrawals();
  }, [filter, token]);

  // Countdown timer for action confirmation
  useEffect(() => {
    if (!showActionConfirm) return;
    
    const timer = setInterval(() => {
      setCountdownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [showActionConfirm]);

  const fetchWithdrawals = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`[WITHDRAWAL PAGE] Fetching withdrawals - filter: ${filter}, token: ${token ? 'present' : 'missing'}`);
      
      const res = await fetch(
        apiUrl(`/api/admin/withdrawals?status=${filter}&limit=50`),
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      console.log(`[WITHDRAWAL PAGE] Response status: ${res.status}`);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `HTTP ${res.status}: Failed to fetch withdrawals`);
      }
      
      const data = await res.json();
      console.log(`[WITHDRAWAL PAGE] Data received:`, data);
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch withdrawals');
      
      const withdrawalsList = data.data.withdrawals || data.data;
      console.log(`[WITHDRAWAL PAGE] Setting ${withdrawalsList?.length || 0} withdrawals`);
      
      setWithdrawals(withdrawalsList || []);
    } catch (err: any) {
      setError(err.message);
      console.error('[WITHDRAWAL PAGE]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setActionError('');
    setViewMode('approval');
  };

  const handleConfirmAction = async () => {
    if (!selectedWithdrawal || countdownSeconds > 0) return;

    setActionLoading(true);
    try {
      const endpoint = showActionConfirm === 'approve' 
        ? apiUrl(`/api/admin/withdrawals/${selectedWithdrawal.id}/approve`)
        : apiUrl(`/api/admin/withdrawals/${selectedWithdrawal.id}/reject`);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(
          showActionConfirm === 'reject' 
            ? { reason: rejectionReason }
            : {}
        )
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${showActionConfirm} withdrawal`);
      }

      // Success - refresh and reset
      await fetchWithdrawals();
      setViewMode('list');
      setSelectedWithdrawal(null);
      setRejectionReason('');
      setShowActionConfirm(null);
      setCountdownSeconds(5);
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectClick = () => {
    setRejectionReason('');
    setShowActionConfirm('reject');
  };

  const filteredWithdrawals = withdrawals.filter(w => {
    if (!search) return true;
    const q = search.toLowerCase();
    return w.user.name.toLowerCase().includes(q) || 
           w.user.email.toLowerCase().includes(q);
  });

  // ============ RENDER: LIST VIEW ============
  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-sky-darker p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Withdrawal Approvals</h1>
            <p className="text-sky-text-secondary">Review and approve pending withdrawal requests</p>
          </div>

          {/* Filters */}
          <div className="bg-sky-card border border-sky-border rounded-xl p-4 mb-6 flex gap-4 items-center flex-wrap">
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-64 px-4 py-2 bg-sky-dark border border-sky-border rounded-lg text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
            />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-4 py-2 bg-sky-dark border border-sky-border rounded-lg text-white focus:outline-none focus:border-sky-green"
            >
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-green"></div>
              </div>
              <p className="text-sky-text-secondary mt-4">Loading withdrawals...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-sky-red/10 border border-sky-red/30 rounded-xl p-4 text-sky-red mb-6">
              {error}
            </div>
          )}

          {/* Withdrawals List */}
          {!loading && !error && (
            <div className="space-y-3">
              {filteredWithdrawals.length === 0 ? (
                <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center text-sky-text-secondary">
                  No {filter.toLowerCase()} withdrawals found
                </div>
              ) : (
                filteredWithdrawals.map(withdrawal => (
                  <div
                    key={withdrawal.id}
                    className="bg-sky-card border border-sky-border rounded-xl p-4 hover:border-sky-green/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedWithdrawal(withdrawal);
                      setViewMode('details');
                    }}
                  >
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white">{withdrawal.user.name}</div>
                        <div className="text-sm text-sky-text-muted">{withdrawal.user.email}</div>
                        <div className="text-sm text-sky-text-muted mt-1">
                          {withdrawal.amount.toFixed(2)} ETB • {withdrawal.paymentMethod} • {withdrawal.accountNumber}
                        </div>
                      </div>

                      {/* Status & Date */}
                      <div className="flex-shrink-0 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                          withdrawal.status === 'PENDING' ? 'bg-sky-orange/20 text-sky-orange' :
                          withdrawal.status === 'COMPLETED' ? 'bg-sky-green/20 text-sky-green' :
                          'bg-sky-red/20 text-sky-red'
                        }`}>
                          {withdrawal.status}
                        </span>
                        <div className="text-xs text-sky-text-muted">
                          {new Date(withdrawal.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============ RENDER: DETAILS VIEW ============
  if (viewMode === 'details' && selectedWithdrawal) {
    return (
      <div className="min-h-screen bg-sky-darker p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <button
            onClick={() => {
              setViewMode('list');
              setSelectedWithdrawal(null);
            }}
            className="flex items-center gap-2 text-sky-green hover:text-sky-green-light mb-6 transition-colors"
          >
            <ChevronLeft size={20} />
            Back to List
          </button>

          {/* Card */}
          <div className="bg-sky-card border border-sky-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-sky-darker border-b border-sky-border p-6">
              <h2 className="text-2xl font-bold text-white mb-1">{selectedWithdrawal.user.name}</h2>
              <p className="text-sky-text-secondary">{selectedWithdrawal.user.email}</p>
              {selectedWithdrawal.user.phone && (
                <p className="text-sky-text-secondary">📱 {selectedWithdrawal.user.phone}</p>
              )}
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sky-text-secondary">Status</span>
                <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                  selectedWithdrawal.status === 'PENDING' ? 'bg-sky-orange/20 text-sky-orange' :
                  selectedWithdrawal.status === 'COMPLETED' ? 'bg-sky-green/20 text-sky-green' :
                  'bg-sky-red/20 text-sky-red'
                }`}>
                  {selectedWithdrawal.status}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Amount</div>
                  <div className="text-lg font-bold text-sky-green">
                    {selectedWithdrawal.amount.toFixed(2)} ETB
                  </div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Payment Method</div>
                  <div className="text-lg font-bold text-white">{selectedWithdrawal.paymentMethod}</div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Account/Phone</div>
                  <div className="text-lg font-bold text-white font-mono">{selectedWithdrawal.accountNumber}</div>
                </div>
                {selectedWithdrawal.accountHolder && (
                  <div className="bg-sky-dark rounded-lg p-4">
                    <div className="text-xs text-sky-text-muted mb-1">Account Holder</div>
                    <div className="text-lg font-bold text-white">{selectedWithdrawal.accountHolder}</div>
                  </div>
                )}
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Requested On</div>
                  <div className="text-lg font-bold text-white">
                    {new Date(selectedWithdrawal.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Time</div>
                  <div className="text-lg font-bold text-white">
                    {new Date(selectedWithdrawal.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* User Wallet Info */}
              {selectedWithdrawal.user.wallet && (
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-3">Current Wallet</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-sky-text-muted mb-1">Balance</div>
                      <div className="text-white font-bold">{selectedWithdrawal.user.wallet.balance.toFixed(2)} ETB</div>
                    </div>
                    <div>
                      <div className="text-xs text-sky-text-muted mb-1">Reserved</div>
                      <div className="text-sky-orange font-bold">{selectedWithdrawal.user.wallet.reserved.toFixed(2)} ETB</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Rejection Reason */}
              {selectedWithdrawal.rejectionReason && (
                <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4">
                  <div className="text-xs text-sky-red font-bold mb-1">Rejection Reason</div>
                  <p className="text-sky-red">{selectedWithdrawal.rejectionReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              {selectedWithdrawal.status === 'PENDING' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApproveClick(selectedWithdrawal)}
                    className="flex-1 px-4 py-3 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors"
                  >
                    Approve Withdrawal
                  </button>
                  <button
                    onClick={handleRejectClick}
                    className="flex-1 px-4 py-3 bg-sky-red/20 hover:bg-sky-red/30 text-sky-red font-bold rounded-lg border border-sky-red/30 transition-colors"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ RENDER: APPROVAL VIEW ============
  if (viewMode === 'approval' && selectedWithdrawal) {
    return (
      <div className="min-h-screen bg-sky-darker p-6 flex items-center justify-center">
        <div className="max-w-2xl w-full">
          {/* Back button */}
          <button
            onClick={() => {
              setViewMode('details');
              setShowActionConfirm(null);
              setCountdownSeconds(5);
              setActionError('');
              setRejectionReason('');
            }}
            className="flex items-center gap-2 text-sky-green hover:text-sky-green-light mb-6 transition-colors"
          >
            <ChevronLeft size={20} />
            Back
          </button>

          {/* Main Card */}
          <div className="bg-sky-card border border-sky-border rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-sky-darker border-b border-sky-border p-6">
              <h2 className="text-2xl font-bold text-white">
                {showActionConfirm === 'reject' ? 'Reject Withdrawal' : 'Approve Withdrawal'}
              </h2>
              <p className="text-sky-text-secondary mt-1">{selectedWithdrawal.user.name}</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {!showActionConfirm ? (
                <>
                  {/* User Info */}
                  <div className="bg-sky-dark rounded-lg p-4">
                    <div className="text-xs text-sky-text-muted mb-2">User Information</div>
                    <div className="space-y-1">
                      <div className="text-white font-semibold">{selectedWithdrawal.user.name}</div>
                      <div className="text-sky-text-muted text-sm">{selectedWithdrawal.user.email}</div>
                      {selectedWithdrawal.user.phone && (
                        <div className="text-sky-text-muted text-sm">📱 {selectedWithdrawal.user.phone}</div>
                      )}
                    </div>
                  </div>

                  {/* Withdrawal Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-dark rounded-lg p-4">
                      <div className="text-xs text-sky-text-muted mb-1">Amount</div>
                      <div className="text-sky-green font-bold text-lg">
                        {selectedWithdrawal.amount.toFixed(2)} ETB
                      </div>
                    </div>
                    <div className="bg-sky-dark rounded-lg p-4">
                      <div className="text-xs text-sky-text-muted mb-1">Payment Method</div>
                      <div className="text-white font-bold">{selectedWithdrawal.paymentMethod}</div>
                    </div>
                    <div className="col-span-2 bg-sky-dark rounded-lg p-4">
                      <div className="text-xs text-sky-text-muted mb-1">Account/Phone Number</div>
                      <div className="text-white font-bold font-mono">{selectedWithdrawal.accountNumber}</div>
                    </div>
                  </div>

                  {/* Rejection Reason Input (only for reject) */}
                  {showActionConfirm === 'reject' && (
                    <div>
                      <label className="block text-sm font-bold text-white mb-2">
                        Rejection Reason
                      </label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Provide a reason for rejection (e.g., invalid account number, duplicate request, etc.)"
                        className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green resize-none"
                        rows={3}
                      />
                      <p className="text-xs text-sky-text-muted mt-2">
                        User will see this reason in their withdrawal history
                      </p>
                    </div>
                  )}

                  {/* Error */}
                  {actionError && (
                    <div className="flex gap-2 bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                      <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
                      <p className="text-sky-red text-sm">{actionError}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={() => {
                      if (showActionConfirm === 'reject' && !rejectionReason.trim()) {
                        setActionError('Please provide a rejection reason');
                        return;
                      }
                      setShowActionConfirm(showActionConfirm || 'approve');
                      setCountdownSeconds(5);
                    }}
                    disabled={actionLoading}
                    className={`w-full px-4 py-3 font-bold rounded-lg transition-colors ${
                      showActionConfirm === 'reject'
                        ? 'bg-sky-red hover:bg-sky-red-dark disabled:opacity-50 disabled:cursor-not-allowed text-white'
                        : 'bg-sky-green hover:bg-sky-green-dark disabled:opacity-50 disabled:cursor-not-allowed text-sky-dark'
                    }`}
                  >
                    {actionLoading ? 'Processing...' : 'Review & Confirm'}
                  </button>

                  {/* Choose Action Buttons */}
                  {!showActionConfirm && (
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowActionConfirm('approve')}
                        className="flex-1 px-4 py-3 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setShowActionConfirm('reject')}
                        className="flex-1 px-4 py-3 bg-sky-red/20 hover:bg-sky-red/30 text-sky-red font-bold rounded-lg border border-sky-red/30 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Confirmation Dialog */}
                  <div className={`rounded-lg p-6 text-center ${
                    showActionConfirm === 'reject'
                      ? 'bg-sky-red/10 border border-sky-red/30'
                      : 'bg-sky-green/10 border border-sky-green/30'
                  }`}>
                    <AlertCircle size={48} className={`${showActionConfirm === 'reject' ? 'text-sky-red' : 'text-sky-green'} mx-auto mb-4`} />
                    <h3 className="text-xl font-bold text-white mb-2">
                      {showActionConfirm === 'reject' ? 'Confirm Rejection' : 'Confirm Approval'}
                    </h3>
                    <p className="text-sky-text-secondary mb-4">
                      {showActionConfirm === 'reject'
                        ? `You are about to reject the withdrawal of ${selectedWithdrawal.amount.toFixed(2)} ETB from ${selectedWithdrawal.user.name}`
                        : `You are about to approve the withdrawal of ${selectedWithdrawal.amount.toFixed(2)} ETB from ${selectedWithdrawal.user.name}. The amount will be deducted from their account.`
                      }
                    </p>
                  </div>

                  {/* Countdown */}
                  <div className="text-center">
                    <p className="text-sky-text-secondary mb-4">Confirm button will be enabled in:</p>
                    <div className="text-6xl font-bold text-sky-green">{countdownSeconds}</div>
                  </div>

                  {/* Buttons */}
                  <div className="space-y-3">
                    <button
                      onClick={handleConfirmAction}
                      disabled={countdownSeconds > 0 || actionLoading}
                      className={`w-full px-4 py-3 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 ${
                        countdownSeconds > 0
                          ? 'bg-sky-green/20 text-sky-green/50 cursor-not-allowed border border-sky-green/20'
                          : 'bg-sky-green hover:bg-sky-green-dark text-sky-dark'
                      }`}
                    >
                      {countdownSeconds > 0 ? (
                        <>Wait {countdownSeconds}s</>
                      ) : (
                        <>
                          <Check size={20} />
                          {showActionConfirm === 'reject' ? 'Confirm Rejection' : 'Confirm Approval'}
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowActionConfirm(null);
                        setCountdownSeconds(5);
                        setRejectionReason('');
                      }}
                      disabled={actionLoading}
                      className="w-full px-4 py-3 border border-sky-border text-sky-text-secondary hover:bg-sky-card-hover font-bold rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

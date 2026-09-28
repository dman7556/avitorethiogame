import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { X, ChevronLeft, Check, AlertCircle } from 'lucide-react';
import { apiUrl } from '../../lib/config';

interface Deposit {
  id: string;
  userId: string;
  submittedAmount: number;
  verifiedAmount?: number;
  paymentMethod: string;
  screenshotUrl?: string;
  screenshotPublicId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
  };
}

type ViewMode = 'list' | 'details' | 'approval';

export default function DepositApprovalPage() {
  const { token } = useAuth();
  
  // List view state
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [search, setSearch] = useState('');
  
  // Navigation state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  
  // Approval state
  const [creditAmount, setCreditAmount] = useState('');
  const [approvalError, setApprovalError] = useState('');
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [approvalLoading, setApprovalLoading] = useState(false);

  // Load deposits on mount and when filter changes
  useEffect(() => {
    fetchDeposits();
  }, [filter, token]);

  // Countdown timer for approval confirmation
  useEffect(() => {
    if (!showApprovalConfirm) return;
    
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
  }, [showApprovalConfirm]);

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const res = await fetch(
        apiUrl(`/api/admin/deposits?status=${filter}&limit=50`),
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (!res.ok) throw new Error('Failed to fetch deposits');
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to fetch deposits');
      
      setDeposits(data.data.deposits);
    } catch (err: any) {
      setError(err.message);
      console.error('[DEPOSIT PAGE]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (deposit: Deposit) => {
    setSelectedDeposit(deposit);
    setCreditAmount(deposit.submittedAmount.toString());
    setApprovalError('');
    setViewMode('approval');
  };

  const handleApproveSubmit = () => {
    if (!creditAmount) {
      setApprovalError('Please enter credit amount');
      return;
    }

    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      setApprovalError('Amount must be greater than 0');
      return;
    }

    setShowApprovalConfirm(true);
    setCountdownSeconds(5);
  };

  const handleConfirmApprove = async () => {
    if (!selectedDeposit || countdownSeconds > 0) return;

    setApprovalLoading(true);
    try {
      const res = await fetch(
        apiUrl(`/api/admin/deposits/${selectedDeposit.id}/approve`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ creditAmount: parseFloat(creditAmount) })
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve deposit');
      }

      // Success - refresh and reset
      await fetchDeposits();
      setViewMode('list');
      setSelectedDeposit(null);
      setCreditAmount('');
      setShowApprovalConfirm(false);
      setCountdownSeconds(5);
    } catch (err: any) {
      setApprovalError(err.message);
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleRejectClick = async () => {
    if (!selectedDeposit) return;

    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    try {
      const res = await fetch(
        apiUrl(`/api/admin/deposits/${selectedDeposit.id}/reject`),
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason })
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject deposit');
      }

      await fetchDeposits();
      setViewMode('list');
      setSelectedDeposit(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const filteredDeposits = deposits.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.user.name.toLowerCase().includes(q) || 
           d.user.email.toLowerCase().includes(q);
  });

  // ============ RENDER: LIST VIEW ============
  if (viewMode === 'list') {
    return (
      <div className="min-h-screen bg-sky-darker p-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Deposit Approvals</h1>
            <p className="text-sky-text-secondary">Review and approve pending deposits</p>
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
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Loading */}
          {loading && (
            <div className="text-center py-16">
              <div className="inline-block">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-green"></div>
              </div>
              <p className="text-sky-text-secondary mt-4">Loading deposits...</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-sky-red/10 border border-sky-red/30 rounded-xl p-4 text-sky-red mb-6">
              {error}
            </div>
          )}

          {/* Deposits List */}
          {!loading && !error && (
            <div className="space-y-3">
              {filteredDeposits.length === 0 ? (
                <div className="bg-sky-card border border-sky-border rounded-xl p-8 text-center text-sky-text-secondary">
                  No {filter.toLowerCase()} deposits found
                </div>
              ) : (
                filteredDeposits.map(deposit => (
                  <div
                    key={deposit.id}
                    className="bg-sky-card border border-sky-border rounded-xl p-4 hover:border-sky-green/50 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedDeposit(deposit);
                      setViewMode('details');
                    }}
                  >
                    <div className="flex items-center justify-between gap-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0">
                        {deposit.screenshotUrl ? (
                          <img
                            src={deposit.screenshotUrl}
                            alt="screenshot"
                            className="w-16 h-16 rounded-lg object-cover border border-sky-border"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-sky-dark border border-sky-border flex items-center justify-center">
                            <span className="text-sky-text-muted text-xs">No image</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white">{deposit.user.name}</div>
                        <div className="text-sm text-sky-text-muted">{deposit.user.email}</div>
                        <div className="text-sm text-sky-text-muted mt-1">
                          {deposit.submittedAmount > 0 
                            ? `${deposit.submittedAmount.toFixed(2)} ETB` 
                            : 'Amount to verify'
                          } • {deposit.paymentMethod}
                        </div>
                      </div>

                      {/* Status & Date */}
                      <div className="flex-shrink-0 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                          deposit.status === 'PENDING' ? 'bg-sky-orange/20 text-sky-orange' :
                          deposit.status === 'APPROVED' ? 'bg-sky-green/20 text-sky-green' :
                          'bg-sky-red/20 text-sky-red'
                        }`}>
                          {deposit.status}
                        </span>
                        <div className="text-xs text-sky-text-muted">
                          {new Date(deposit.createdAt).toLocaleDateString()}
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
  if (viewMode === 'details' && selectedDeposit) {
    return (
      <div className="min-h-screen bg-sky-darker p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <button
            onClick={() => {
              setViewMode('list');
              setSelectedDeposit(null);
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
              <h2 className="text-2xl font-bold text-white mb-1">{selectedDeposit.user.name}</h2>
              <p className="text-sky-text-secondary">{selectedDeposit.user.email}</p>
              {selectedDeposit.user.phone && (
                <p className="text-sky-text-secondary">📱 {selectedDeposit.user.phone}</p>
              )}
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between">
                <span className="text-sky-text-secondary">Status</span>
                <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                  selectedDeposit.status === 'PENDING' ? 'bg-sky-orange/20 text-sky-orange' :
                  selectedDeposit.status === 'APPROVED' ? 'bg-sky-green/20 text-sky-green' :
                  'bg-sky-red/20 text-sky-red'
                }`}>
                  {selectedDeposit.status}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Payment Method</div>
                  <div className="text-lg font-bold text-white">{selectedDeposit.paymentMethod}</div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Submitted Amount</div>
                  <div className="text-lg font-bold text-sky-green">
                    {selectedDeposit.submittedAmount > 0 
                      ? `${selectedDeposit.submittedAmount.toFixed(2)} ETB` 
                      : 'Not provided'
                    }
                  </div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Submitted On</div>
                  <div className="text-lg font-bold text-white">
                    {new Date(selectedDeposit.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="bg-sky-dark rounded-lg p-4">
                  <div className="text-xs text-sky-text-muted mb-1">Time</div>
                  <div className="text-lg font-bold text-white">
                    {new Date(selectedDeposit.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>

              {/* Screenshot */}
              {selectedDeposit.screenshotUrl && (
                <div>
                  <h3 className="text-sm font-bold text-sky-text-secondary mb-2">Payment Screenshot</h3>
                  <a 
                    href={selectedDeposit.screenshotUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <img
                      src={selectedDeposit.screenshotUrl}
                      alt="payment screenshot"
                      className="w-full rounded-lg border border-sky-border hover:border-sky-green transition-colors cursor-pointer"
                      style={{ maxHeight: '400px', objectFit: 'contain' }}
                    />
                  </a>
                  <p className="text-xs text-sky-text-muted mt-2 text-center">
                    Click to view full size in new tab
                  </p>
                </div>
              )}

              {/* Rejection Reason */}
              {selectedDeposit.rejectionReason && (
                <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-4">
                  <div className="text-xs text-sky-red font-bold mb-1">Rejection Reason</div>
                  <p className="text-sky-red">{selectedDeposit.rejectionReason}</p>
                </div>
              )}

              {/* Action Buttons */}
              {selectedDeposit.status === 'PENDING' && (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleApproveClick(selectedDeposit)}
                    className="flex-1 px-4 py-3 bg-sky-green hover:bg-sky-green-dark text-sky-dark font-bold rounded-lg transition-colors"
                  >
                    Approve
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
  if (viewMode === 'approval' && selectedDeposit) {
    return (
      <div className="min-h-screen bg-sky-darker p-6 flex items-center justify-center">
        <div className="max-w-2xl w-full">
          {/* Back button */}
          <button
            onClick={() => {
              setViewMode('details');
              setShowApprovalConfirm(false);
              setCountdownSeconds(5);
              setApprovalError('');
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
              <h2 className="text-2xl font-bold text-white">Approve Deposit</h2>
              <p className="text-sky-text-secondary mt-1">{selectedDeposit.user.name}</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {!showApprovalConfirm ? (
                <>
                  {/* User Info */}
                  <div className="bg-sky-dark rounded-lg p-4">
                    <div className="text-xs text-sky-text-muted mb-2">User Information</div>
                    <div className="space-y-1">
                      <div className="text-white font-semibold">{selectedDeposit.user.name}</div>
                      <div className="text-sky-text-muted text-sm">{selectedDeposit.user.email}</div>
                      {selectedDeposit.user.phone && (
                        <div className="text-sky-text-muted text-sm">📱 {selectedDeposit.user.phone}</div>
                      )}
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-dark rounded-lg p-4">
                      <div className="text-xs text-sky-text-muted mb-1">Payment Method</div>
                      <div className="text-white font-bold">{selectedDeposit.paymentMethod}</div>
                    </div>
                    <div className="bg-sky-dark rounded-lg p-4">
                      <div className="text-xs text-sky-text-muted mb-1">Submitted Amount</div>
                      <div className="text-sky-green font-bold">
                        {selectedDeposit.submittedAmount > 0 
                          ? `${selectedDeposit.submittedAmount.toFixed(2)} ETB` 
                          : 'Not provided'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Screenshot Preview */}
                  {selectedDeposit.screenshotUrl && (
                    <div>
                      <div className="text-xs text-sky-text-muted mb-2">Payment Screenshot</div>
                      <img
                        src={selectedDeposit.screenshotUrl}
                        alt="payment"
                        className="w-full rounded-lg border border-sky-border"
                        style={{ maxHeight: '300px', objectFit: 'contain' }}
                      />
                    </div>
                  )}

                  {/* Credit Amount Input */}
                  <div>
                    <label className="block text-sm font-bold text-white mb-2">
                      Credit Amount (ETB)
                    </label>
                    <input
                      type="number"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(e.target.value)}
                      className="w-full px-4 py-3 bg-sky-dark border border-sky-border rounded-lg text-white focus:outline-none focus:border-sky-green"
                      min="1"
                      step="any"
                    />
                    <p className="text-xs text-sky-blue mt-2">
                      Enter the amount to credit to user's wallet. Can be different from submitted amount.
                    </p>
                  </div>

                  {/* Error */}
                  {approvalError && (
                    <div className="flex gap-2 bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                      <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
                      <p className="text-sky-red text-sm">{approvalError}</p>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleApproveSubmit}
                    disabled={approvalLoading}
                    className="w-full px-4 py-3 bg-sky-green hover:bg-sky-green-dark disabled:opacity-50 disabled:cursor-not-allowed text-sky-dark font-bold rounded-lg transition-colors"
                  >
                    {approvalLoading ? 'Processing...' : 'Review & Confirm'}
                  </button>
                </>
              ) : (
                <>
                  {/* Confirmation Dialog */}
                  <div className="bg-sky-orange/10 border border-sky-orange/30 rounded-lg p-6 text-center">
                    <AlertCircle size={48} className="text-sky-orange mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-white mb-2">Confirm Approval</h3>
                    <p className="text-sky-text-secondary mb-4">
                      You are about to credit <span className="font-bold text-white">{parseFloat(creditAmount).toFixed(2)} ETB</span> to <span className="font-bold text-white">{selectedDeposit.user.name}</span>
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
                      onClick={handleConfirmApprove}
                      disabled={countdownSeconds > 0 || approvalLoading}
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
                          Confirm Approval
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setShowApprovalConfirm(false);
                        setCountdownSeconds(5);
                      }}
                      disabled={approvalLoading}
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

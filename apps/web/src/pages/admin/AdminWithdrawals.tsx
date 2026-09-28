import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Check, 
  X, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import AdminHeader from '../../components/AdminHeader';
import AdminLoadingSpinner from '../../components/AdminLoadingSpinner';
import AdminEmptyState from '../../components/AdminEmptyState';
import { apiUrl } from '../../lib/config';

interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: string;
  accountNumber: string;
  accountHolder?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    wallet?: {
      balance: number;
      reserved: number;
    };
  };
}

export default function AdminWithdrawals() {
  const { token } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount'>('newest');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  
  // Modal state
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchWithdrawals();
  }, [status, page, token]);

  const fetchWithdrawals = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: '20',
        offset: (page * 20).toString(),
        ...(status !== 'all' && { status }),
      });

      const res = await fetch(apiUrl(`/api/admin/withdrawals?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      let withdrawalsList = data.data.withdrawals;
      
      // Sort based on selection
      if (sortBy === 'oldest') {
        withdrawalsList = withdrawalsList.reverse();
      } else if (sortBy === 'amount') {
        withdrawalsList = withdrawalsList.sort((a: Withdrawal, b: Withdrawal) => 
          b.amount - a.amount
        );
      }

      setWithdrawals(withdrawalsList);
      setTotal(data.data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredWithdrawals = withdrawals.filter((w) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      w.user.name.toLowerCase().includes(q) || 
      w.user.email.toLowerCase().includes(q) ||
      w.id.toLowerCase().includes(q)
    );
  });

  const handleApproveClick = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setActionType('approve');
    setRejectionReason('');
    setShowActionModal(true);
  };

  const handleRejectClick = (withdrawal: Withdrawal) => {
    setSelectedWithdrawal(withdrawal);
    setActionType('reject');
    setRejectionReason('');
    setShowActionModal(true);
  };

  const handleApprove = async () => {
    if (!selectedWithdrawal) return;

    try {
      setProcessing(true);
      const res = await fetch(apiUrl(`/api/admin/withdrawals/${selectedWithdrawal.id}/approve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);

      setShowActionModal(false);
      setSelectedWithdrawal(null);
      setActionType(null);
      fetchWithdrawals();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedWithdrawal || !rejectionReason.trim()) return;

    try {
      setProcessing(true);
      const res = await fetch(apiUrl(`/api/admin/withdrawals/${selectedWithdrawal.id}/reject`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);

      setShowActionModal(false);
      setSelectedWithdrawal(null);
      setActionType(null);
      setRejectionReason('');
      fetchWithdrawals();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'PENDING':
        return <span className="px-3 py-1 bg-sky-orange/20 text-sky-orange rounded-full text-xs font-medium border border-sky-orange/50">Pending Review</span>;
      case 'APPROVED':
        return <span className="px-3 py-1 bg-sky-blue/20 text-sky-blue rounded-full text-xs font-medium border border-sky-blue/50">Approved</span>;
      case 'COMPLETED':
        return <span className="px-3 py-1 bg-emerald-600/20 text-emerald-400 rounded-full text-xs font-medium border border-emerald-600/50">Completed</span>;
      case 'REJECTED':
        return <span className="px-3 py-1 bg-red-600/20 text-red-400 rounded-full text-xs font-medium border border-red-600/50">Rejected</span>;
      default:
        return null;
    }
  };

  const pageCount = Math.ceil(total / 20);
  const startIndex = page * 20 + 1;
  const endIndex = Math.min((page + 1) * 20, total);

  return (
    <div className="min-h-screen bg-sky-dark">
      <AdminHeader title="Withdrawals Management" showBackButton={true} />

      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Header with Total Count */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Withdrawals</h2>
          <div className="text-sky-text-secondary text-sm">
            Total: <span className="text-white font-semibold">{total}</span> withdrawal{total !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-sky-card border border-sky-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-text-muted" />
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                className="w-full pl-9 pr-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm placeholder-sky-text-muted focus:outline-none focus:border-sky-green transition-colors"
                aria-label="Search withdrawals"
              />
            </div>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as any);
                setPage(0);
              }}
              className="px-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm focus:outline-none focus:border-sky-green transition-colors"
              aria-label="Filter by withdrawal status"
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending Only</option>
              <option value="APPROVED">Approved</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
            </select>

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm focus:outline-none focus:border-sky-green transition-colors"
              aria-label="Sort withdrawals"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount">Highest Amount</option>
            </select>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <AdminLoadingSpinner message="Loading withdrawals..." />
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6 text-red-300 flex items-start gap-4">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold mb-3">Error loading withdrawals</p>
              <p className="text-sm mb-4">{error}</p>
              <button
                onClick={fetchWithdrawals}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded text-red-300 hover:text-red-200 transition-colors text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredWithdrawals.length === 0 ? (
          <AdminEmptyState 
            title="No withdrawals found"
            description={search ? "Try adjusting your search or filters" : "No withdrawals to display at this time"}
            icon={<Search size={32} className="text-sky-text-muted" />}
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block bg-sky-card border border-sky-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" role="table">
                  <thead className="bg-sky-card-hover border-b border-sky-border">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">User</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Method</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Account</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Date</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-sky-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sky-border">
                    {filteredWithdrawals.map((withdrawal) => (
                      <tr key={withdrawal.id} className="hover:bg-sky-card-hover transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-white">{withdrawal.user.name}</p>
                            <p className="text-xs text-sky-text-muted">{withdrawal.user.email}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-white">{withdrawal.amount.toFixed(2)} ETB</p>
                        </td>
                        <td className="px-6 py-4 text-sky-text-secondary">{withdrawal.paymentMethod}</td>
                        <td className="px-6 py-4 text-sm">
                          <p className="text-white font-medium">{withdrawal.accountNumber}</p>
                          {withdrawal.accountHolder && (
                            <p className="text-xs text-sky-text-muted">{withdrawal.accountHolder}</p>
                          )}
                        </td>
                        <td className="px-6 py-4">{getStatusBadge(withdrawal.status)}</td>
                        <td className="px-6 py-4 text-sm text-sky-text-muted">
                          {new Date(withdrawal.createdAt).toLocaleDateString()} <br />
                          <span className="text-xs">{new Date(withdrawal.createdAt).toLocaleTimeString()}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedWithdrawal(withdrawal);
                                setShowDetailModal(true);
                              }}
                              className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-sky-green hover:text-sky-green-light"
                              aria-label={`View details for ${withdrawal.user.name}'s withdrawal`}
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>
                            {withdrawal.status === 'PENDING' && (
                              <>
                                <button
                                  onClick={() => handleApproveClick(withdrawal)}
                                  className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-emerald-400 hover:text-emerald-300"
                                  aria-label={`Approve ${withdrawal.user.name}'s withdrawal`}
                                  title="Approve"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => handleRejectClick(withdrawal)}
                                  className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-red-400 hover:text-red-300"
                                  aria-label={`Reject ${withdrawal.user.name}'s withdrawal`}
                                  title="Reject"
                                >
                                  <X size={16} />
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
            </div>

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {filteredWithdrawals.map((withdrawal) => (
                <div key={withdrawal.id} className="bg-sky-card border border-sky-border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white">{withdrawal.user.name}</p>
                      <p className="text-xs text-sky-text-muted">{withdrawal.user.email}</p>
                    </div>
                    {getStatusBadge(withdrawal.status)}
                  </div>
                  
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Amount:</span>
                      <span className="font-semibold text-white">{withdrawal.amount.toFixed(2)} ETB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Method:</span>
                      <span className="text-sky-text-secondary">{withdrawal.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Account:</span>
                      <span className="text-sky-text-secondary text-xs">{withdrawal.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Date:</span>
                      <span className="text-sky-text-muted text-xs">{new Date(withdrawal.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedWithdrawal(withdrawal); setShowDetailModal(true); }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-sky-card-hover hover:bg-sky-card-hover-active rounded-lg transition-colors text-sky-green text-sm font-medium"
                      aria-label={`View details for ${withdrawal.user.name}'s withdrawal`}
                    >
                      <Eye size={16} /> Details
                    </button>
                    {withdrawal.status === 'PENDING' && (
                      <>
                        <button 
                          onClick={() => handleApproveClick(withdrawal)}
                          className="flex-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/50 rounded-lg transition-colors text-emerald-400 text-sm font-medium"
                          aria-label={`Approve ${withdrawal.user.name}'s withdrawal`}
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleRejectClick(withdrawal)}
                          className="flex-1 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded-lg transition-colors text-red-400 text-sm font-medium"
                          aria-label={`Reject ${withdrawal.user.name}'s withdrawal`}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between mt-8 gap-4">
              <div className="text-sky-text-secondary text-sm">
                Showing {startIndex} to {endIndex} of {total} withdrawal{total !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-2 bg-sky-card hover:bg-sky-card-hover border border-sky-border rounded text-sky-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>
                <span className="px-3 py-2 text-sky-text-secondary text-sm">
                  Page {page + 1} of {pageCount}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= pageCount - 1}
                  className="px-3 py-2 bg-sky-card hover:bg-sky-card-hover border border-sky-border rounded text-sky-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedWithdrawal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
            <div className="bg-sky-card border border-sky-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-sky-card-hover border-b border-sky-border px-6 py-4 flex items-center justify-between sticky top-0">
                <h2 id="detail-modal-title" className="text-xl font-bold text-white">Withdrawal Details</h2>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-sky-text-secondary hover:text-white transition-colors p-1 rounded hover:bg-sky-card-hover-active"
                  aria-label="Close details"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* User Information */}
                <div>
                  <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">User Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Name</p>
                      <p className="text-white font-medium mt-1">{selectedWithdrawal.user.name}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Email</p>
                      <p className="text-white font-medium mt-1 break-all text-sm">{selectedWithdrawal.user.email}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3 col-span-2">
                      <p className="text-xs text-sky-text-muted">User ID</p>
                      <p className="text-white font-medium mt-1 text-xs break-all">{selectedWithdrawal.user.id}</p>
                    </div>
                  </div>
                </div>

                {/* Wallet Information */}
                {selectedWithdrawal.user.wallet && (
                  <div>
                    <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">Current Wallet</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Balance</p>
                        <p className="text-white font-medium mt-1">{selectedWithdrawal.user.wallet.balance.toFixed(2)} ETB</p>
                      </div>
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Reserved</p>
                        <p className="text-sky-orange font-medium mt-1">{selectedWithdrawal.user.wallet.reserved.toFixed(2)} ETB</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Withdrawal Information */}
                <div>
                  <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">Withdrawal Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Withdrawal ID</p>
                      <p className="text-white font-medium mt-1 text-xs break-all">{selectedWithdrawal.id}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Payment Method</p>
                      <p className="text-white font-medium mt-1">{selectedWithdrawal.paymentMethod}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Amount</p>
                      <p className="text-white font-medium mt-1 text-lg">{selectedWithdrawal.amount.toFixed(2)} ETB</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Status</p>
                      <div className="mt-1">{getStatusBadge(selectedWithdrawal.status)}</div>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3 col-span-2">
                      <p className="text-xs text-sky-text-muted">Account Number</p>
                      <p className="text-white font-medium mt-1">{selectedWithdrawal.accountNumber}</p>
                    </div>
                    {selectedWithdrawal.accountHolder && (
                      <div className="bg-sky-card-hover rounded p-3 col-span-2">
                        <p className="text-xs text-sky-text-muted">Account Holder</p>
                        <p className="text-white font-medium mt-1">{selectedWithdrawal.accountHolder}</p>
                      </div>
                    )}
                    <div className="bg-sky-card-hover rounded p-3 col-span-2">
                      <p className="text-xs text-sky-text-muted">Submitted Date</p>
                      <p className="text-white font-medium mt-1 text-sm">{new Date(selectedWithdrawal.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Rejection Reason */}
                {selectedWithdrawal.status === 'REJECTED' && selectedWithdrawal.rejectionReason && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-2 uppercase">Rejection Reason</h3>
                    <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-red-300 text-sm">
                      {selectedWithdrawal.rejectionReason}
                    </div>
                  </div>
                )}

                {/* Processing Info */}
                {selectedWithdrawal.processedAt && (
                  <div className="bg-sky-card-hover border border-sky-border rounded p-4">
                    <p className="text-xs text-sky-text-muted mb-1">
                      Processed on {new Date(selectedWithdrawal.processedAt).toLocaleString()}
                    </p>
                  </div>
                )}

                <button
                  onClick={() => setShowDetailModal(false)}
                  className="w-full bg-sky-card-hover hover:bg-sky-card-hover-active text-white font-medium py-2 rounded transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Action Modal */}
        {showActionModal && selectedWithdrawal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="action-modal-title">
            <div className="bg-sky-card border border-sky-border rounded-lg max-w-md w-full">
              <div className="bg-sky-card-hover border-b border-sky-border px-6 py-4 flex items-center justify-between">
                <h2 id="action-modal-title" className="text-lg font-bold text-white">
                  {actionType === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
                </h2>
                <button
                  onClick={() => {
                    setShowActionModal(false);
                    setActionType(null);
                    setRejectionReason('');
                  }}
                  className="text-sky-text-secondary hover:text-white transition-colors p-1 rounded hover:bg-sky-card-hover-active"
                  aria-label="Close"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="bg-sky-card-hover rounded p-3">
                  <p className="text-xs text-sky-text-muted">User</p>
                  <p className="text-white font-medium mt-1">{selectedWithdrawal.user.name}</p>
                </div>

                <div className="bg-sky-card-hover rounded p-3">
                  <p className="text-xs text-sky-text-muted">Amount</p>
                  <p className="text-white font-medium mt-1 text-lg">{selectedWithdrawal.amount.toFixed(2)} ETB</p>
                </div>

                <div className="bg-sky-card-hover rounded p-3">
                  <p className="text-xs text-sky-text-muted">Account</p>
                  <p className="text-white font-medium mt-1">{selectedWithdrawal.accountNumber}</p>
                </div>

                {actionType === 'reject' && (
                  <div>
                    <label htmlFor="rejection-reason" className="block text-sm font-medium text-white mb-2">
                      Rejection Reason *
                    </label>
                    <textarea
                      id="rejection-reason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Enter reason for rejection..."
                      className="w-full px-4 py-2 bg-sky-input border border-sky-border rounded text-white focus:outline-none focus:border-sky-green transition-colors resize-none"
                      rows={3}
                      aria-label="Enter rejection reason"
                    />
                    <p className="text-xs text-sky-text-muted mt-2">The funds will be refunded and user will be notified</p>
                  </div>
                )}

                {actionType === 'approve' && (
                  <div className="bg-emerald-900/20 border border-emerald-700/50 rounded p-3">
                    <p className="text-emerald-300 text-sm">
                      The withdrawal will be marked as approved. The funds should be transferred to the user's account.
                    </p>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowActionModal(false);
                      setActionType(null);
                      setRejectionReason('');
                    }}
                    className="flex-1 px-4 py-2 bg-sky-card-hover hover:bg-sky-card-hover-active text-white rounded transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={actionType === 'approve' ? handleApprove : handleReject}
                    disabled={processing || (actionType === 'reject' && !rejectionReason.trim())}
                    className={`flex-1 px-4 py-2 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium ${
                      actionType === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                    aria-label={actionType === 'approve' ? 'Confirm withdrawal approval' : 'Confirm withdrawal rejection'}
                  >
                    {processing && <Loader2 size={16} className="animate-spin" />}
                    {actionType === 'approve' ? 
                      (processing ? 'Approving...' : 'Approve') : 
                      (processing ? 'Rejecting...' : 'Reject')
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

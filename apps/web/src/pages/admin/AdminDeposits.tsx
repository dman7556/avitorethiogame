import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUrl, uploadUrl } from '../../lib/config';
import { adminActionErrorMessage } from '../../lib/adminErrors';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  Eye, 
  Check, 
  X, 
  AlertCircle,
  Loader2,
  ExternalLink
} from 'lucide-react';
import AdminHeader from '../../components/AdminHeader';
import AdminLoadingSpinner from '../../components/AdminLoadingSpinner';
import AdminEmptyState from '../../components/AdminEmptyState';

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
    wallet?: {
      balance: number;
      reserved: number;
    };
  };
}

export default function AdminDeposits() {
  const { token } = useAuth();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount'>('newest');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [approvalAmount, setApprovalAmount] = useState<string>('');
  // H1: the API rejects any approval without a recorded reason.
  const [approvalReason, setApprovalReason] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchDeposits();
  }, [status, page, token]);

  const fetchDeposits = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({
        limit: '20',
        offset: (page * 20).toString(),
        ...(status !== 'all' && { status }),
      });

      const res = await fetch(apiUrl(`/api/admin/deposits?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      let depositsList = data.data.deposits;
      
      if (sortBy === 'oldest') {
        depositsList = depositsList.reverse();
      } else if (sortBy === 'amount') {
        depositsList = depositsList.sort((a: Deposit, b: Deposit) => 
          b.submittedAmount - a.submittedAmount
        );
      }

      setDeposits(depositsList);
      setTotal(data.data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredDeposits = deposits.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.user.name.toLowerCase().includes(q) || 
      d.user.email.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q)
    );
  });

  const handleApproveClick = (deposit: Deposit) => {
    setSelectedDeposit(deposit);
    setApprovalAmount(deposit.submittedAmount.toString());
    setApprovalReason('');
    setActionType('approve');
    setShowActionModal(true);
  };

  const handleRejectClick = (deposit: Deposit) => {
    setSelectedDeposit(deposit);
    setRejectionReason('');
    setActionType('reject');
    setShowActionModal(true);
  };

  const handleApprove = async () => {
    if (!selectedDeposit || !approvalAmount) return;
    
    try {
      setProcessing(true);
      const creditAmount = parseFloat(approvalAmount);
      
      if (creditAmount <= 0) {
        setError('Credit amount must be greater than 0');
        return;
      }

      if (approvalReason.trim().length < 4) {
        setError('An approval reason is required (at least 4 characters)');
        return;
      }

      const res = await fetch(apiUrl(`/api/admin/deposits/${selectedDeposit.id}/approve`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ creditAmount, reason: approvalReason.trim() }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(adminActionErrorMessage(data.code, data.error));

      setShowActionModal(false);
      setSelectedDeposit(null);
      setApprovalAmount('');
      setApprovalReason('');
      setActionType(null);
      fetchDeposits();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDeposit || !rejectionReason.trim()) return;

    try {
      setProcessing(true);
      const res = await fetch(apiUrl(`/api/admin/deposits/${selectedDeposit.id}/reject`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(adminActionErrorMessage(data.code, data.error));

      setShowActionModal(false);
      setSelectedDeposit(null);
      setRejectionReason('');
      setActionType(null);
      fetchDeposits();
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
        return <span className="px-3 py-1 bg-emerald-600/20 text-emerald-400 rounded-full text-xs font-medium border border-emerald-600/50">Approved</span>;
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
      <AdminHeader title="Deposits Management" showBackButton={true} />

      <div className="max-w-[1600px] mx-auto px-4 py-8">
        {/* Header with Total Count */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Deposits</h2>
          <div className="text-sky-text-secondary text-sm">
            Total: <span className="text-white font-semibold">{total}</span> deposit{total !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="bg-sky-card border border-sky-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sky-text-muted" />
              <input
                type="text"
                placeholder="Search by name, email, or ID..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full pl-9 pr-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm placeholder-sky-text-muted focus:outline-none focus:border-sky-green transition-colors"
                aria-label="Search deposits"
                aria-describedby="search-help"
              />
            </div>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as any); setPage(0); }}
              className="px-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm focus:outline-none focus:border-sky-green transition-colors"
              aria-label="Filter by deposit status"
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending Only</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-sky-input border border-sky-border rounded text-white text-sm focus:outline-none focus:border-sky-green transition-colors"
              aria-label="Sort deposits"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="amount">Highest Amount</option>
            </select>
          </div>
          <p id="search-help" className="text-xs text-sky-text-muted mt-2">
            Search in user name, email, or deposit ID
          </p>
        </div>

        {/* Content Area */}
        {loading ? (
          <AdminLoadingSpinner message="Loading deposits..." />
        ) : error ? (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-6 text-red-300 flex items-start gap-4">
            <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold mb-3">Error loading deposits</p>
              <p className="text-sm mb-4">{error}</p>
              <button
                onClick={fetchDeposits}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded text-red-300 hover:text-red-200 transition-colors text-sm font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        ) : filteredDeposits.length === 0 ? (
          <AdminEmptyState 
            title="No deposits found"
            description={search ? "Try adjusting your search or filters" : "No deposits to display at this time"}
            icon={<Search size={32} className="text-sky-text-muted" />}
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden sm:block bg-sky-card border border-sky-border rounded-lg overflow-hidden">
              <table className="w-full" role="table">
                <thead className="bg-sky-card-hover border-b border-sky-border">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">User</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Method</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-sky-text-secondary">Date</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-sky-text-secondary">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-border">
                  {filteredDeposits.map((deposit) => (
                    <tr key={deposit.id} className="hover:bg-sky-card-hover transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-white">{deposit.user.name}</p>
                        <p className="text-xs text-sky-text-muted">{deposit.user.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-white">{deposit.submittedAmount.toFixed(2)} ETB</p>
                        {deposit.verifiedAmount && <p className="text-xs text-sky-text-muted">Approved: {deposit.verifiedAmount.toFixed(2)} ETB</p>}
                      </td>
                      <td className="px-6 py-4 text-sky-text-secondary">{deposit.paymentMethod}</td>
                      <td className="px-6 py-4">{getStatusBadge(deposit.status)}</td>
                      <td className="px-6 py-4 text-sm text-sky-text-muted">{new Date(deposit.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => { setSelectedDeposit(deposit); setShowDetailModal(true); }}
                            className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-sky-green hover:text-sky-green-light"
                            aria-label={`View details for ${deposit.user.name}'s deposit`}
                            title="View details"
                          >
                            <Eye size={16} />
                          </button>
                          {deposit.status === 'PENDING' && (
                            <>
                              <button 
                                onClick={() => handleApproveClick(deposit)}
                                className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-emerald-400 hover:text-emerald-300"
                                aria-label={`Approve ${deposit.user.name}'s deposit`}
                                title="Approve deposit"
                              >
                                <Check size={16} />
                              </button>
                              <button 
                                onClick={() => handleRejectClick(deposit)}
                                className="p-2 hover:bg-sky-card-hover rounded-lg transition-colors text-red-400 hover:text-red-300"
                                aria-label={`Reject ${deposit.user.name}'s deposit`}
                                title="Reject deposit"
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

            {/* Mobile Card View */}
            <div className="sm:hidden space-y-4">
              {filteredDeposits.map((deposit) => (
                <div key={deposit.id} className="bg-sky-card border border-sky-border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-white">{deposit.user.name}</p>
                      <p className="text-xs text-sky-text-muted">{deposit.user.email}</p>
                    </div>
                    {getStatusBadge(deposit.status)}
                  </div>
                  
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Amount:</span>
                      <span className="font-semibold text-white">{deposit.submittedAmount.toFixed(2)} ETB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Method:</span>
                      <span className="text-sky-text-secondary">{deposit.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sky-text-secondary">Date:</span>
                      <span className="text-sky-text-muted text-xs">{new Date(deposit.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => { setSelectedDeposit(deposit); setShowDetailModal(true); }}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-sky-card-hover hover:bg-sky-card-hover-active rounded-lg transition-colors text-sky-green text-sm font-medium"
                      aria-label={`View details for ${deposit.user.name}'s deposit`}
                    >
                      <Eye size={16} /> Details
                    </button>
                    {deposit.status === 'PENDING' && (
                      <>
                        <button 
                          onClick={() => handleApproveClick(deposit)}
                          className="flex-1 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-600/50 rounded-lg transition-colors text-emerald-400 text-sm font-medium"
                          aria-label={`Approve ${deposit.user.name}'s deposit`}
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleRejectClick(deposit)}
                          className="flex-1 px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded-lg transition-colors text-red-400 text-sm font-medium"
                          aria-label={`Reject ${deposit.user.name}'s deposit`}
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
                Showing {startIndex} to {endIndex} of {total} deposit{total !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-2 bg-sky-card hover:bg-sky-card-hover border border-sky-border rounded text-sky-text-secondary hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} /> Prev
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
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* Detail Modal */}
        {showDetailModal && selectedDeposit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="detail-modal-title">
            <div className="bg-sky-card border border-sky-border rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="bg-sky-card-hover border-b border-sky-border px-6 py-4 flex items-center justify-between sticky top-0">
                <h2 id="detail-modal-title" className="text-xl font-bold text-white">Deposit Details</h2>
                <button 
                  onClick={() => setShowDetailModal(false)}
                  className="text-sky-text-secondary hover:text-white transition-colors p-1 rounded hover:bg-sky-card-hover-active"
                  aria-label="Close details"
                  title="Close"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                {/* User Info */}
                <div>
                  <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">User Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Name</p>
                      <p className="text-white font-medium mt-1">{selectedDeposit.user.name}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Email</p>
                      <p className="text-white font-medium mt-1 break-all text-sm">{selectedDeposit.user.email}</p>
                    </div>
                    {selectedDeposit.user.phone && (
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Phone</p>
                        <p className="text-white font-medium mt-1">{selectedDeposit.user.phone}</p>
                      </div>
                    )}
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">User ID</p>
                      <p className="text-white font-medium mt-1 text-xs break-all">{selectedDeposit.user.id}</p>
                    </div>
                  </div>
                </div>

                {/* Deposit Info */}
                <div>
                  <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">Deposit Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Submitted Amount</p>
                      <p className="text-white font-medium mt-1 text-lg">{selectedDeposit.submittedAmount.toFixed(2)} ETB</p>
                    </div>
                    {selectedDeposit.verifiedAmount !== undefined && (
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Approved Amount</p>
                        <p className="text-sky-green font-medium mt-1 text-lg">{selectedDeposit.verifiedAmount.toFixed(2)} ETB</p>
                      </div>
                    )}
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Payment Method</p>
                      <p className="text-white font-medium mt-1">{selectedDeposit.paymentMethod}</p>
                    </div>
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Status</p>
                      <div className="mt-1">{getStatusBadge(selectedDeposit.status)}</div>
                    </div>
                  </div>
                </div>

                {/* Wallet Info */}
                {selectedDeposit.user.wallet && (
                  <div>
                    <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">User Wallet</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Current Balance</p>
                        <p className="text-white font-medium mt-1">{selectedDeposit.user.wallet.balance.toFixed(2)} ETB</p>
                      </div>
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Reserved</p>
                        <p className="text-sky-orange font-medium mt-1">{selectedDeposit.user.wallet.reserved.toFixed(2)} ETB</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Screenshot */}
                {selectedDeposit.screenshotUrl && (
                  <div>
                    <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">Payment Screenshot</h3>
                    <div className="bg-sky-card-hover rounded p-3">
                      <img 
                        src={uploadUrl(selectedDeposit.screenshotUrl)} 
                        alt="Payment screenshot" 
                        className="w-full rounded border border-sky-border max-h-96 object-contain"
                      />
                      <a 
                        href={uploadUrl(selectedDeposit.screenshotUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 mt-3 text-sky-green hover:text-sky-green-light text-sm font-medium transition-colors"
                        aria-label="Open screenshot in new window"
                      >
                        Open Full Size <ExternalLink size={14} />
                      </a>
                    </div>
                  </div>
                )}

                {/* Rejection Reason */}
                {selectedDeposit.status === 'REJECTED' && selectedDeposit.rejectionReason && (
                  <div>
                    <h3 className="text-sm font-semibold text-red-400 mb-2 uppercase">Rejection Reason</h3>
                    <div className="bg-red-900/20 border border-red-700/50 rounded p-3 text-red-300 text-sm">
                      {selectedDeposit.rejectionReason}
                    </div>
                  </div>
                )}

                {/* Timestamps */}
                <div>
                  <h3 className="text-sm font-semibold text-sky-text-secondary mb-3 uppercase">Timestamps</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-sky-card-hover rounded p-3">
                      <p className="text-xs text-sky-text-muted">Submitted</p>
                      <p className="text-white font-medium mt-1 text-xs">{new Date(selectedDeposit.createdAt).toLocaleString()}</p>
                    </div>
                    {selectedDeposit.processedAt && (
                      <div className="bg-sky-card-hover rounded p-3">
                        <p className="text-xs text-sky-text-muted">Processed</p>
                        <p className="text-white font-medium mt-1 text-xs">{new Date(selectedDeposit.processedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>

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
        {showActionModal && selectedDeposit && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="action-modal-title">
            <div className="bg-sky-card border border-sky-border rounded-lg max-w-md w-full">
              <div className="bg-sky-card-hover border-b border-sky-border px-6 py-4 flex items-center justify-between">
                <h2 id="action-modal-title" className="text-lg font-bold text-white">
                  {actionType === 'approve' ? 'Approve Deposit' : 'Reject Deposit'}
                </h2>
                <button 
                  onClick={() => { setShowActionModal(false); setActionType(null); setApprovalAmount(''); setRejectionReason(''); }}
                  className="text-sky-text-secondary hover:text-white transition-colors p-1 rounded hover:bg-sky-card-hover-active"
                  aria-label="Close"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-sky-card-hover rounded p-3">
                  <p className="text-xs text-sky-text-muted">Amount</p>
                  <p className="text-white font-medium mt-1 text-lg">{selectedDeposit.submittedAmount.toFixed(2)} ETB</p>
                </div>

                {actionType === 'approve' ? (
                  <>
                    <div>
                      <label htmlFor="approval-amount" className="block text-sm font-medium text-white mb-2">
                        Credit Amount to Wallet
                      </label>
                      <input 
                        id="approval-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={approvalAmount}
                        onChange={(e) => setApprovalAmount(e.target.value)}
                        className="w-full px-4 py-2 bg-sky-input border border-sky-border rounded text-white focus:outline-none focus:border-sky-green transition-colors"
                        aria-label="Enter the amount to credit"
                      />
                    </div>
                    <div>
                      <label htmlFor="approval-reason" className="block text-sm font-medium text-white mb-2">
                        Approval Reason *
                      </label>
                      <textarea
                        id="approval-reason"
                        value={approvalReason}
                        onChange={(e) => setApprovalReason(e.target.value)}
                        placeholder="Explain why this deposit is approved (e.g., payment verified)..."
                        className="w-full px-4 py-2 bg-sky-input border border-sky-border rounded text-white focus:outline-none focus:border-sky-green transition-colors resize-none"
                        rows={3}
                        aria-label="Enter approval reason"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => { setShowActionModal(false); setActionType(null); }}
                        className="flex-1 bg-sky-card-hover hover:bg-sky-card-hover-active text-white py-2 rounded transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleApprove}
                        disabled={processing || approvalReason.trim().length < 4}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
                        aria-label="Confirm deposit approval"
                      >
                        {processing && <Loader2 size={16} className="animate-spin" />}
                        {processing ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="rejection-reason" className="block text-sm font-medium text-white mb-2">
                        Rejection Reason *
                      </label>
                      <textarea 
                        id="rejection-reason"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Explain why this deposit is being rejected..."
                        className="w-full px-4 py-2 bg-sky-input border border-sky-border rounded text-white focus:outline-none focus:border-sky-green transition-colors resize-none"
                        rows={3}
                        aria-label="Enter rejection reason"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={() => { setShowActionModal(false); setActionType(null); }}
                        className="flex-1 bg-sky-card-hover hover:bg-sky-card-hover-active text-white py-2 rounded transition-colors font-medium"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleReject}
                        disabled={processing || !rejectionReason.trim()}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 font-medium"
                        aria-label="Confirm deposit rejection"
                      >
                        {processing && <Loader2 size={16} className="animate-spin" />}
                        {processing ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

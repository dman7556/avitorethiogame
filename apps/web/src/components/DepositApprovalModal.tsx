import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadUrl, apiUrl } from '../lib/config';

interface Deposit {
  id: string;
  userId: string;
  submittedAmount: number;
  paymentMethod: string;
  screenshotUrl?: string;
  screenshotPublicId?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: {
    name: string;
    email: string;
    phone?: string;
  };
}

interface DepositApprovalModalProps {
  isOpen: boolean;
  deposit: Deposit | null;
  onClose: () => void;
  onApproved: () => void;
}

export default function DepositApprovalModal({ isOpen, deposit, onClose, onApproved }: DepositApprovalModalProps) {
  const { token } = useAuth();
  const [creditAmount, setCreditAmount] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debug logging
  useEffect(() => {
    console.log('[MODAL COMPONENT] Props changed:', { isOpen, depositId: deposit?.id });
  }, [isOpen, deposit]);

  // Countdown effect
  useEffect(() => {
    if (!showConfirm) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowConfirm(false);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showConfirm]);

  console.log('[MODAL RENDER] isOpen:', isOpen, 'deposit:', deposit);
  
  if (!isOpen || !deposit) {
    console.log('[MODAL] Returning null - isOpen:', isOpen, 'deposit:', !!deposit);
    return null;
  }
  
  console.log('[MODAL] Rendering modal for deposit:', deposit.id);

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!creditAmount) {
      setError('Please enter credit amount');
      return;
    }

    const amount = parseFloat(creditAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Credit amount must be a positive number');
      return;
    }

    setShowConfirm(true);
  };

  const handleConfirmApprove = async () => {
    if (countdown > 0) return; // Disabled until countdown reaches 0

    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/admin/deposits/${deposit.id}/approve`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          creditAmount: parseFloat(creditAmount),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve deposit');
      }

      onApproved();
      onClose();
      setCreditAmount('');
      setShowConfirm(false);
      setCountdown(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    const reason = prompt('Enter rejection reason:');
    if (!reason) return;

    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/admin/deposits/${deposit.id}/reject`), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject deposit');
      }

      onApproved();
      onClose();
      setCreditAmount('');
      setShowConfirm(false);
      setCountdown(5);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={!showConfirm && !loading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-sky-card border border-sky-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-sky-border">
          <h3 className="text-lg font-bold text-white">Approve Deposit</h3>
          {!showConfirm && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-sky-card-hover transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-sky-text-secondary" />
            </button>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* User Info */}
          <div className="bg-sky-dark rounded-xl p-3">
            <div className="text-sm text-sky-text-muted mb-1">User Information</div>
            <div className="text-white font-semibold">{deposit.user.name}</div>
            <div className="text-xs text-sky-text-muted mt-1">{deposit.user.email}</div>
            {deposit.user.phone && (
              <div className="text-xs text-sky-text-muted mt-0.5">📱 {deposit.user.phone}</div>
            )}
          </div>

          {/* Deposit Details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-sky-dark rounded-xl p-3">
              <div className="text-xs text-sky-text-muted mb-1">Payment Method</div>
              <div className="text-white font-semibold text-sm">{deposit.paymentMethod}</div>
            </div>
            <div className="bg-sky-dark rounded-xl p-3">
              <div className="text-xs text-sky-text-muted mb-1">Submitted Amount</div>
              <div className="text-sky-green font-mono font-semibold text-sm">
                {deposit.submittedAmount === 0 ? 'Not provided' : `${deposit.submittedAmount} ETB`}
              </div>
            </div>
          </div>

          {/* Submission Date */}
          <div className="bg-sky-dark rounded-xl p-3">
            <div className="text-xs text-sky-text-muted mb-1">Submitted On</div>
            <div className="text-white text-sm">{new Date(deposit.createdAt).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short'
            })}</div>
          </div>

          {/* Screenshot Preview */}
          {deposit.screenshotUrl && (
            <div>
              <div className="text-xs text-sky-text-muted mb-2">Payment Screenshot (from Cloudinary)</div>
              <a 
                href={uploadUrl(deposit.screenshotUrl)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block"
              >
                <img
                  src={uploadUrl(deposit.screenshotUrl)}
                  alt="Payment screenshot"
                  className="w-full rounded-lg border border-sky-border hover:border-sky-green transition-colors cursor-pointer"
                  style={{ maxHeight: '200px', objectFit: 'contain' }}
                />
              </a>
              <p className="text-xs text-sky-blue mt-1 text-center">
                Click to view full size in new tab
              </p>
            </div>
          )}

          {!showConfirm ? (
            <>
              {/* Credit Amount Input */}
              <div>
                <label htmlFor="credit-amount" className="block text-sm text-sky-text-secondary mb-1.5">
                  Credit Amount (ETB)
                </label>
                <input
                  id="credit-amount"
                  type="number"
                  inputMode="decimal"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 100, 500, 3000"
                  min="1"
                  max="999999"
                  step="any"
                  className="w-full bg-sky-dark border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green text-base"
                  disabled={loading}
                />
                <p className="text-xs text-sky-blue mt-2">
                  Enter the amount of tokens to credit to user's wallet. Can be different from submitted amount.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="flex gap-2 bg-sky-red/10 border border-sky-red/30 rounded-lg p-3">
                  <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
                  <p className="text-sky-red text-sm">{error}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={loading || !creditAmount}
                  className="flex-1 bg-sky-green hover:bg-sky-green/90 disabled:opacity-50 disabled:cursor-not-allowed text-sky-dark font-bold py-2.5 rounded-lg transition-colors"
                >
                  {loading ? 'Processing...' : 'Approve'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="flex-1 bg-sky-red/20 hover:bg-sky-red/30 disabled:opacity-50 disabled:cursor-not-allowed text-sky-red font-bold py-2.5 rounded-lg transition-colors border border-sky-red/30"
                >
                  Reject
                </button>
              </div>
            </>
          ) : (
            // Confirmation State
            <div className="space-y-4">
              <div className="bg-sky-orange/10 border border-sky-orange/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle size={20} className="text-sky-orange" />
                  <p className="text-sky-orange font-semibold">Confirm Approval</p>
                </div>
                <p className="text-sm text-sky-text-secondary">
                  Are you sure you want to credit <span className="font-bold text-white">{parseFloat(creditAmount).toFixed(2)} ETB</span> to <span className="font-bold text-white">{deposit.user.name}</span>?
                </p>
              </div>

              {/* Countdown */}
              <div className="text-center">
                <p className="text-sm text-sky-text-muted mb-2">
                  Confirm button will be enabled in:
                </p>
                <div className="text-3xl font-bold text-sky-green">{countdown}</div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirmApprove}
                disabled={countdown > 0 || loading}
                className={`w-full font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                  countdown > 0
                    ? 'bg-sky-green/20 text-sky-green/50 cursor-not-allowed border border-sky-green/20'
                    : 'bg-sky-green hover:bg-sky-green/90 text-sky-dark'
                }`}
              >
                {countdown > 0 ? (
                  <>
                    Wait {countdown}s
                  </>
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Confirm Approval
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setShowConfirm(false);
                  setCountdown(5);
                }}
                disabled={loading}
                className="w-full border border-sky-border text-sky-text-secondary hover:bg-sky-card-hover py-2.5 rounded-lg transition-colors font-semibold"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

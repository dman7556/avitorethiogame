import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { GAME_CONSTANTS } from '@sky-rush/shared';
import { apiUrl } from '../lib/config';

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  /** Available = balance - reserved (default: balance) */
  available?: number;
}

const WITHDRAWAL_METHODS = [
  { id: 'CBE', name: 'CBE', fullName: 'Commercial Bank of Ethiopia', type: 'bank' },
  { id: 'TELEBIRR', name: 'Telebirr', fullName: 'Telebirr Mobile Money', type: 'mobile' }
];

export default function WithdrawalModal({ isOpen, onClose, balance, available }: WithdrawalModalProps) {
  // Withdrawable funds exclude anything reserved for pending withdrawals
  const withdrawable = available !== undefined ? available : balance;
  const [amount, setAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(WITHDRAWAL_METHODS[0]);
  const [destination, setDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { token } = useAuth();

  if (!isOpen) return null;

  const withdrawAmount = parseFloat(amount) || 0;
  const remainingAfterWithdrawal = withdrawable - withdrawAmount;

  // Validation checks (mirrors server rules exactly)
  const isInsufficientBalance = withdrawAmount > withdrawable;
  const isBelowMinimum = withdrawAmount > 0 && withdrawAmount < GAME_CONSTANTS.MINIMUM_WITHDRAWAL;
  const violatesMinimumRemaining = withdrawAmount > 0 && remainingAfterWithdrawal < GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE;
  const canSubmit = amount && destination && !isInsufficientBalance && !isBelowMinimum && !violatesMinimumRemaining && !loading;

  const getValidationError = (): string | null => {
    if (isInsufficientBalance) {
      return `Insufficient available balance. Available: ${withdrawable.toFixed(2)} ETB`;
    }
    if (isBelowMinimum) {
      return `Minimum withdrawal is ${GAME_CONSTANTS.MINIMUM_WITHDRAWAL} ETB`;
    }
    if (violatesMinimumRemaining) {
      const maxWithdrawable = withdrawable - GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE;
      return `You must keep at least ${GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE} ETB in your balance. Maximum you can withdraw: ${maxWithdrawable.toFixed(2)} ETB`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const validationError = getValidationError();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch(apiUrl('/api/withdrawals'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount, // string — the server parses it as a decimal (M7)
          paymentMethod: selectedMethod.id,
          accountNumber: destination.trim(),
          accountHolder: undefined,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSuccess(true);
        // Keep modal open for 3 seconds to show success message
        setTimeout(() => {
          onClose();
          setAmount('');
          setDestination('');
          setError('');
          setSuccess(false);
        }, 3000);
      } else {
        setError(data.error || data.message || 'Withdrawal request failed');
      }
    } catch (error) {
      console.error('Withdrawal failed:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success modal (like deposit flow)
  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative w-full sm:max-w-md bg-sky-card border border-sky-border sm:rounded-2xl rounded-t-2xl shadow-xl p-8 text-center">
          <CheckCircle size={48} className="text-sky-green mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Withdrawal Submitted</h3>
          <p className="text-sky-text-secondary text-sm mb-4">
            Your withdrawal request of {withdrawAmount.toFixed(2)} ETB has been submitted for admin approval. You'll receive a notification once it's processed.
          </p>
          <div className="bg-sky-dark rounded-lg p-3 text-left text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-sky-text-secondary">Amount:</span>
              <span className="text-white font-mono">{withdrawAmount.toFixed(2)} ETB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-text-secondary">Status:</span>
              <span className="text-sky-orange font-semibold">Pending Approval</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sky-text-secondary">Method:</span>
              <span className="text-white font-mono">{selectedMethod.name}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main form modal
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - bottom sheet on mobile */}
      <div className="relative w-full sm:max-w-md bg-sky-card border border-sky-border sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-sky-card border-b border-sky-border flex items-center justify-between px-4 py-3 z-10">
          <h2 className="text-lg font-bold text-white">Withdraw Funds</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-sky-card-hover transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-sky-text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Current Balance Info */}
          <div className="bg-sky-dark rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sky-text-secondary text-sm">Available to Withdraw</span>
              <span className="text-sky-green font-mono font-semibold">
                {withdrawable.toFixed(2)} ETB
              </span>
            </div>
            {balance - withdrawable > 0.001 && (
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-sky-text-secondary">Reserved (pending withdrawal)</span>
                <span className="text-sky-orange font-mono">{(balance - withdrawable).toFixed(2)} ETB</span>
              </div>
            )}
            <div className="h-px bg-sky-border mb-2" />
            <div className="flex items-center justify-between text-xs">
              <span className="text-sky-text-secondary">Minimum to Keep</span>
              <span className="text-sky-text-secondary">{GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE} ETB</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-sky-text-secondary">Max You Can Withdraw</span>
              <span className={`font-mono font-semibold ${
                withdrawable - GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE >= GAME_CONSTANTS.MINIMUM_WITHDRAWAL
                  ? 'text-sky-green'
                  : 'text-sky-red'
              }`}>
                {Math.max(0, withdrawable - GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE).toFixed(2)} ETB
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="withdraw-amount" className="block text-sm text-sky-text-secondary mb-1.5">Withdrawal Amount (ETB)</label>
            <div className="relative">
              <input
                id="withdraw-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  let val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setAmount(val);
                    setError('');
                  }
                }}
                placeholder="Enter amount"
                required
                className={`w-full bg-sky-dark border rounded-xl px-4 py-3 pr-14 text-white placeholder-sky-text-muted focus:outline-none text-base font-mono font-semibold transition-colors ${
                  error && (isInsufficientBalance || isBelowMinimum || violatesMinimumRemaining)
                    ? 'border-sky-red focus:border-sky-red'
                    : 'border-sky-border focus:border-sky-green'
                }`}
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sky-text-secondary text-sm font-medium">
                ETB
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-sky-text-muted mt-1.5">
              <span>Min: {GAME_CONSTANTS.MINIMUM_WITHDRAWAL} ETB</span>
              <span>Max: {Math.max(0, withdrawable - GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE).toFixed(2)} ETB</span>
            </div>
            {withdrawAmount > 0 && !error && (
              <div className="text-xs text-sky-text-secondary mt-2 p-2 bg-sky-dark/50 rounded">
                <div className="flex justify-between mb-1">
                  <span>Balance after withdrawal:</span>
                  <span className="font-mono text-white">{remainingAfterWithdrawal.toFixed(2)} ETB</span>
                </div>
              </div>
            )}
          </div>

          {/* Withdrawal Method Selection */}
          <div>
            <label className="block text-sm text-sky-text-secondary mb-1.5">Withdrawal Method</label>
            <div className="grid grid-cols-2 gap-2">
              {WITHDRAWAL_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(method);
                    setDestination('');
                  }}
                  className={`p-3 rounded-xl border transition-all text-left ${
                    selectedMethod.id === method.id
                      ? 'border-sky-green bg-sky-green/10'
                      : 'border-sky-border bg-sky-dark hover:border-sky-border-light'
                  }`}
                >
                  <div className={`font-medium text-sm ${selectedMethod.id === method.id ? 'text-white' : 'text-sky-text-secondary'}`}>
                    {method.name}
                  </div>
                  <div className="text-[11px] text-sky-text-muted mt-0.5">
                    {method.type === 'bank' ? 'Bank Transfer' : 'Mobile Money'}
                  </div>
                  {selectedMethod.id === method.id && (
                    <CheckCircle size={14} className="text-sky-green mt-1" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Input */}
          <div>
            <label htmlFor="withdraw-destination" className="block text-sm text-sky-text-secondary mb-1.5">
              {selectedMethod.id === 'CBE' ? 'Bank Account Number' : 'Phone Number'}
            </label>
            <input
              id="withdraw-destination"
              type={selectedMethod.id === 'CBE' ? 'text' : 'tel'}
              inputMode={selectedMethod.id === 'CBE' ? 'numeric' : 'tel'}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder={
                selectedMethod.id === 'CBE' 
                  ? 'Enter account number' 
                  : '+251 9XX XXX XXX'
              }
              required
              className="w-full bg-sky-dark border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green text-base"
            />
            <div className="text-xs text-sky-text-muted mt-1.5">
              {selectedMethod.id === 'CBE' 
                ? 'Your registered CBE account number'
                : 'Your registered Telebirr phone number'
              }
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-sky-red/10 border border-sky-red/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle size={16} className="text-sky-red flex-shrink-0 mt-0.5" />
              <div className="text-sm text-sky-red">{error}</div>
            </div>
          )}

          {/* Important Notes */}
          <div className="bg-sky-orange/10 border border-sky-orange/30 rounded-lg p-3">
            <div className="text-xs text-sky-orange space-y-0.5">
              <div><strong>Note:</strong> Your withdrawal will be held for admin approval.</div>
              <div>Funds are reserved from your balance until processed.</div>
              <div>Processing takes 1-24 hours after approval.</div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
              canSubmit
                ? 'bg-gradient-to-r from-sky-green to-sky-green/80 hover:from-sky-green/90 hover:to-sky-green/70 text-white'
                : 'bg-sky-dark border border-sky-border text-sky-text-muted cursor-not-allowed opacity-50'
            }`}
          >
            {loading ? (
              <span className="animate-pulse">Processing...</span>
            ) : (
              `Withdraw ${withdrawAmount > 0 ? withdrawAmount.toFixed(2) : ''} ETB`
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

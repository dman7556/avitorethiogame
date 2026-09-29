import { useState, useRef } from 'react';
import { X, Upload, Copy, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiUrl } from '../lib/config';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
}

const PAYMENT_METHODS = [
  { id: 'cbe', name: 'CBE', fullName: 'Commercial Bank of Ethiopia', type: 'bank' },
  { id: 'telebirr', name: 'Telebirr', fullName: 'Telebirr Mobile Money', type: 'mobile' }
];

export default function DepositModal({ isOpen, onClose, balance }: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [selectedMethod, setSelectedMethod] = useState(PAYMENT_METHODS[0]);
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!screenshot) {
      setError('Please upload a payment screenshot');
      return;
    }
    
    // Amount is now optional - if provided, validate minimum
    if (amount && parseFloat(amount) < 50) {
      setError('Minimum deposit amount is 50 ETB');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('amount', amount);
      formData.append('paymentMethod', selectedMethod.id);
      formData.append('screenshot', screenshot);

      const response = await fetch(apiUrl('/api/deposits'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        // Show success modal
        setShowSuccess(true);
        // Reset form
        setAmount('');
        setScreenshot(null);
        setError('');
      } else {
        const data = await response.json();
        setError(data.message || 'Deposit request failed');
      }
    } catch (error) {
      console.error('Deposit failed:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const accountInfo = selectedMethod.id === 'cbe' 
    ? { account: '1000498522622', name: 'Biniyam Birhanu' }
    : { phone: '+251911123456', name: 'Aviator Gaming' };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - bottom sheet on mobile, centered on desktop */}
      <div className="relative w-full sm:max-w-md bg-sky-card border border-sky-border sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-sky-card border-b border-sky-border flex items-center justify-between px-4 py-3 z-10">
          <h2 className="text-lg font-bold text-white">Deposit Funds</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-sky-card-hover transition-colors"
            aria-label="Close"
          >
            <X size={20} className="text-sky-text-secondary" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Current Balance */}
          <div className="bg-sky-dark rounded-xl p-3 flex items-center justify-between">
            <span className="text-sky-text-secondary text-sm">Balance</span>
            <span className="text-sky-green font-mono font-semibold">
              {balance.toFixed(2)} ETB
            </span>
          </div>

          {/* Amount Input */}
          <div>
            <label htmlFor="deposit-amount" className="block text-sm text-sky-text-secondary mb-1.5">Amount (Optional)</label>
            <div className="relative">
              <input
                id="deposit-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount (admin can adjust)"
                min="50"
                max="50000"
                step="any"
                className="w-full bg-sky-dark border border-sky-border rounded-xl px-4 py-3 pr-14 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green text-base"
              />
              <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sky-text-secondary text-sm font-medium">
                ETB
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-sky-text-muted mt-1.5">
              <span>Min: 50 ETB</span>
              <span>Max: 50,000 ETB</span>
            </div>
            <p className="text-xs text-sky-blue mt-2">If you leave this empty, the admin will manually verify the amount from your screenshot.</p>
          </div>

          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm text-sky-text-secondary mb-1.5">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedMethod(method)}
                  disabled={method.id === 'telebirr'}
                  className={`p-3 rounded-xl border transition-all text-left relative ${
                    method.id === 'telebirr'
                      ? 'border-sky-border bg-sky-dark/50 opacity-60 cursor-not-allowed'
                      : selectedMethod.id === method.id
                      ? 'border-sky-green bg-sky-green/10'
                      : 'border-sky-border bg-sky-dark hover:border-sky-border-light'
                  }`}
                >
                  <div className={`font-medium text-sm ${selectedMethod.id === method.id ? 'text-white' : 'text-sky-text-secondary'}`}>
                    {method.name}
                  </div>
                  <div className="text-[11px] text-sky-text-muted mt-0.5">
                    {method.id === 'telebirr' ? 'Soon Available' : method.type === 'bank' ? 'Bank Transfer' : 'Mobile Money'}
                  </div>
                  {selectedMethod.id === method.id && method.id !== 'telebirr' && (
                    <CheckCircle size={14} className="text-sky-green mt-1" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Instructions */}
          <div className="bg-sky-dark rounded-xl p-3">
            <div className="text-xs text-sky-text-muted mb-2">Transfer to this account:</div>
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-sky-text-muted">
                  {selectedMethod.id === 'cbe' ? 'Account Number' : 'Phone Number'}
                </div>
                <div className="text-white font-mono text-sm truncate">
                  {selectedMethod.id === 'cbe' ? accountInfo.account : accountInfo.phone}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(selectedMethod.id === 'cbe' ? accountInfo.account : (accountInfo as any).phone)}
                className="p-2 rounded-lg hover:bg-sky-card-hover transition-colors flex-shrink-0 ml-2"
                aria-label="Copy to clipboard"
              >
                {copied ? (
                  <CheckCircle size={16} className="text-sky-green" />
                ) : (
                  <Copy size={16} className="text-sky-text-secondary" />
                )}
              </button>
            </div>
            <div className="mt-2 text-xs text-sky-text-muted">
              Name: <span className="text-sky-text-secondary">{accountInfo.name}</span>
            </div>
          </div>

          {/* Screenshot Upload */}
          <div>
            <label className="block text-sm text-sky-text-secondary mb-1.5">Payment Screenshot</label>
            {screenshot ? (
              <div className="bg-sky-dark border border-sky-green/30 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle size={20} className="text-sky-green flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">{screenshot.name}</div>
                  <div className="text-xs text-sky-text-muted">
                    {(screenshot.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="text-xs text-sky-red hover:underline flex-shrink-0"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-sky-border rounded-xl p-6 text-center hover:border-sky-border-light transition-colors"
              >
                <Upload size={24} className="text-sky-text-muted mx-auto mb-2" />
                <div className="text-sm text-sky-text-secondary">
                  Tap to upload screenshot
                </div>
                <div className="text-xs text-sky-text-muted mt-1">
                  JPG, PNG up to 50MB
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => setScreenshot(e.target.files?.[0] || null)}
              className="hidden"
              aria-label="Upload payment screenshot"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sky-red text-sm text-center bg-sky-red/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !screenshot}
            className="btn-primary w-full py-3.5 text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Submitting...' : 'Submit Deposit Request'}
          </button>

          {/* Note */}
          <div className="bg-sky-blue/10 border border-sky-blue/30 rounded-lg p-3">
            <div className="text-xs text-sky-blue leading-relaxed">
              Your deposit will be processed within 5-30 minutes during business hours. Ensure the screenshot is clear.
            </div>
          </div>
        </form>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 rounded-2xl">
          <div className="bg-sky-card border border-sky-green/30 rounded-xl p-6 mx-4 max-w-sm">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-sky-green/20 flex items-center justify-center mb-4">
                <CheckCircle size={32} className="text-sky-green" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Deposit Submitted!</h3>
              <p className="text-sky-text-secondary text-sm mb-1">
                Your deposit request has been successfully submitted.
              </p>
              <p className="text-sky-text-muted text-xs mb-6">
                Status: <span className="text-yellow-500 font-medium">PENDING</span> • Please wait 5-30 minutes for admin approval
              </p>
              <button
                onClick={() => {
                  setShowSuccess(false);
                  onClose();
                }}
                className="btn-primary w-full py-3"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

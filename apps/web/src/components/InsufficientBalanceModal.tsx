import { X, AlertCircle } from 'lucide-react';

interface InsufficientBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  required: number;
}

export default function InsufficientBalanceModal({ 
  isOpen, 
  onClose, 
  balance, 
  required 
}: InsufficientBalanceModalProps) {
  if (!isOpen) return null;

  const handleDeposit = () => {
    onClose();
    // Dispatch event so the Header can open its deposit modal
    window.dispatchEvent(new CustomEvent('open-deposit'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-sky-card border border-sky-border rounded-2xl p-5 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-sky-card-hover transition-colors"
          aria-label="Close"
        >
          <X size={18} className="text-sky-text-secondary" />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-sky-red/10 flex items-center justify-center mx-auto mb-3">
          <AlertCircle className="w-7 h-7 text-sky-red" />
        </div>

        {/* Content */}
        <h2 className="text-lg font-bold text-white text-center mb-1">
          Insufficient Balance
        </h2>
        <p className="text-sky-text-secondary text-center text-sm mb-4">
          You need more funds to place this bet
        </p>

        {/* Balance info */}
        <div className="bg-sky-dark rounded-xl p-3 mb-4 space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-sky-text-secondary text-sm">Your balance:</span>
            <span className="text-white font-mono font-semibold text-sm">{balance.toFixed(2)} ETB</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sky-text-secondary text-sm">Bet amount:</span>
            <span className="text-sky-red font-mono font-semibold text-sm">{required.toFixed(2)} ETB</span>
          </div>
          <div className="h-px bg-sky-border" />
          <div className="flex justify-between items-center">
            <span className="text-sky-text-secondary text-sm">You need:</span>
            <span className="text-sky-green font-mono font-semibold text-sm">
              {(required - balance).toFixed(2)} ETB
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 btn-secondary py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleDeposit}
            className="flex-1 btn-primary py-2.5 text-sm"
          >
            Deposit
          </button>
        </div>
      </div>
    </div>
  );
}

import { AlertCircle, X } from 'lucide-react';

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
}

export default function ErrorModal({ isOpen, onClose, title = 'Something went wrong', message }: ErrorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-sky-card border border-sky-border rounded-2xl p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-sky-text-secondary hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-sky-red/10 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-sky-red" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-bold text-white text-center mb-2">
          {title}
        </h2>

        {/* Message */}
        <p className="text-sky-text-secondary text-center text-sm mb-6 leading-relaxed">
          {message}
        </p>

        {/* Action */}
        <button
          onClick={onClose}
          className="btn-primary w-full py-3"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

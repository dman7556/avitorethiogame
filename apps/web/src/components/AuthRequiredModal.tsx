import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, LogIn, UserPlus } from 'lucide-react';

interface AuthRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
  returnTo?: string;
}

export function AuthRequiredModal({
  isOpen,
  onClose,
  message = 'You need to be logged in to access this feature',
  returnTo = '/',
}: AuthRequiredModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleLogin = () => {
    navigate('/login', { state: { returnTo } });
  };

  const handleRegister = () => {
    navigate('/register', { state: { returnTo } });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-sky-card border border-sky-border rounded-2xl shadow-2xl max-w-md w-full pointer-events-auto animate-slideUp"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-sky-border">
            <h2 className="text-xl font-bold text-white">Authentication Required</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-sky-card-hover transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-sky-text-secondary" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            <p className="text-sky-text-secondary text-center">
              {message}
            </p>

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleLogin}
                className="w-full bg-sky-green hover:bg-sky-green-dark transition-colors rounded-xl py-3 px-4 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-sky-green/20"
              >
                <LogIn size={18} />
                Log In to Your Account
              </button>

              <button
                onClick={handleRegister}
                className="w-full bg-sky-dark hover:bg-sky-card-hover border-2 border-sky-border hover:border-sky-green transition-colors rounded-xl py-3 px-4 text-white font-semibold flex items-center justify-center gap-2"
              >
                <UserPlus size={18} />
                Create New Account
              </button>
            </div>

            {/* Info */}
            <div className="bg-sky-dark/50 border border-sky-border rounded-lg p-4">
              <p className="text-xs text-sky-text-secondary text-center">
                Creating an account is <span className="text-sky-green font-semibold">free</span> and takes less than a minute
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

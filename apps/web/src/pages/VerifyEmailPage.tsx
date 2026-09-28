import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';

export default function VerifyEmailPage() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const { verifyEmail, resendVerificationCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const email = (location.state as any)?.email || '';
  const returnTo = (location.state as any)?.returnTo || '/';

  useEffect(() => {
    if (!email) {
      navigate('/register');
    }
  }, [email, navigate]);

  // Cooldown timer for resend button
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`verify-code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`verify-code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await verifyEmail(email, fullCode);
      // Redirect to login page after successful verification
      navigate('/login', { 
        state: { 
          message: 'Email verified successfully! Please log in with your credentials.',
          email: email
        } 
      });
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    
    setResendLoading(true);
    setError('');
    setResendMessage('');
    
    try {
      await resendVerificationCode(email);
      setResendMessage('New verification code sent to your email!');
      setResendCooldown(60); // 60 second cooldown
      // Clear existing code inputs
      setCode(['', '', '', '', '', '']);
      // Focus first input
      const firstInput = document.getElementById('verify-code-0');
      firstInput?.focus();
    } catch (err: any) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-sky-dark flex flex-col">
      <PageHeader title="Verify Email" backTo="/register" backLabel="Back to Register" />
      
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-green to-sky-green-dark flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">SR</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Verify Your Email</h2>
            <p className="text-sky-text-secondary text-sm mt-2">
              We've sent a 6-digit code to
            </p>
            <p className="text-sky-green text-sm font-medium">{email}</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 6-digit code input */}
            <div className="flex justify-center gap-2 sm:gap-3">
              {code.map((digit, index) => (
                <input
                  key={index}
                  id={`verify-code-${index}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-10 h-12 sm:w-12 sm:h-14 bg-sky-card border border-sky-border rounded-xl text-white text-center text-xl sm:text-2xl font-mono focus:outline-none focus:border-sky-green"
                  aria-label={`Verification code digit ${index + 1}`}
                />
              ))}
            </div>

            {/* Resend code section */}
            <div className="text-center">
              <p className="text-sky-text-secondary text-sm mb-3">
                Didn't receive the code?
              </p>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendLoading || resendCooldown > 0}
                className={`text-sm font-medium ${
                  resendCooldown > 0 
                    ? 'text-sky-text-muted cursor-not-allowed' 
                    : 'text-sky-green hover:text-sky-green-light cursor-pointer'
                } ${resendLoading ? 'opacity-50' : ''}`}
              >
                {resendLoading ? (
                  'Sending...'
                ) : resendCooldown > 0 ? (
                  `Resend code in ${resendCooldown}s`
                ) : (
                  'Resend verification code'
                )}
              </button>
            </div>

            {/* Success message for resend */}
            {resendMessage && (
              <div className="text-sky-green text-sm text-center bg-sky-green/10 rounded-lg px-3 py-2">
                {resendMessage}
              </div>
            )}

            {error && (
              <div className="text-sky-red text-sm text-center bg-sky-red/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.join('').length !== 6}
              className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PasswordInput from '../components/PasswordInput';
import PageHeader from '../components/PageHeader';

export default function ResetPasswordPage() {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [codeVerified, setCodeVerified] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState('');
  const { verifyResetCode, resetPassword, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const email = (location.state as any)?.email || '';

  useEffect(() => {
    if (!email) {
      navigate('/forgot-password');
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
      const nextInput = document.getElementById(`reset-code-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`reset-code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const valid = await verifyResetCode(email, fullCode);
      if (valid) {
        setCodeVerified(true);
        setResendMessage('');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    
    setResendLoading(true);
    setError('');
    setResendMessage('');
    
    try {
      await requestPasswordReset(email);
      setResendMessage('New verification code sent to your email!');
      setResendCooldown(60); // 60 second cooldown
      // Clear existing code inputs
      setCode(['', '', '', '', '', '']);
      // Focus first input
      const firstInput = document.getElementById('reset-code-0');
      firstInput?.focus();
    } catch (err: any) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await resetPassword(email, code.join(''), newPassword);
      navigate('/login', { 
        state: { message: 'Password reset successful! Please login with your new password.' } 
      });
    } catch (err: any) {
      setError(err.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-sky-dark flex flex-col">
      <PageHeader title="Reset Password" backTo="/forgot-password" backLabel="Back" />
      
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-blue to-sky-blue-dark flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">SR</span>
            </div>
            <h2 className="text-2xl font-bold text-white">
              {codeVerified ? 'Create New Password' : 'Enter Reset Code'}
            </h2>
            <p className="text-sky-text-secondary text-sm mt-2">
              {codeVerified 
                ? 'Choose a strong password for your account'
                : `We've sent a 6-digit code to ${email}`
              }
            </p>
          </div>

          {!codeVerified ? (
            /* Code verification form */
            <form onSubmit={handleVerifyCode} className="space-y-6">
              {/* 6-digit code input */}
              <div className="flex justify-center gap-2 sm:gap-3">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    id={`reset-code-${index}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-10 h-12 sm:w-12 sm:h-14 bg-sky-card border border-sky-border rounded-xl text-white text-center text-xl sm:text-2xl font-mono focus:outline-none focus:border-sky-green"
                    aria-label={`Code digit ${index + 1}`}
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
                  onClick={handleResendCode}
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
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
            </form>
          ) : (
            /* Password reset form */
            <form onSubmit={handleResetPassword} className="space-y-4">
              <PasswordInput
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Confirm Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                autoComplete="new-password"
              />

              {error && (
                <div className="text-sky-red text-sm text-center bg-sky-red/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          )}

          {/* Back to login */}
          <p className="text-center text-sky-text-secondary text-sm mt-6">
            Remember your password?{' '}
            <Link to="/login" className="text-sky-green hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

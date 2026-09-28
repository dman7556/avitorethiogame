import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import PageHeader from '../components/PageHeader';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [noAccount, setNoAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const { requestPasswordReset } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNoAccount(false);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      // Navigate to reset password page with email
      navigate('/reset-password', { state: { email } });
    } catch (err: any) {
      if (err.message === 'NO_ACCOUNT' || err.message?.includes('No account found')) {
        setNoAccount(true);
        setError('No account found with this email.');
      } else {
        setError(err.message || 'Failed to send reset code');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-sky-dark flex flex-col">
      <PageHeader title="Forgot Password?" backTo="/login" backLabel="Back to Login" />
      
      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-blue to-sky-blue-dark flex items-center justify-center mx-auto mb-4">
              <span className="text-white font-bold text-2xl">SR</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Reset Your Password</h2>
            <p className="text-sky-text-secondary text-sm mt-2">
              Enter your registered email address
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="forgot-email" className="block text-sm text-sky-text-secondary mb-1">Email</label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full bg-sky-card border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
              />
            </div>

            {error && (
              <div className="text-sky-red text-sm text-center bg-sky-red/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {noAccount && (
              <div className="bg-sky-card border border-sky-border rounded-xl p-4 text-center space-y-3">
                <p className="text-sky-text-secondary text-sm">
                  Don't have an account yet?
                </p>
                <Link
                  to="/register"
                  className="btn-primary inline-block px-6 py-2.5 text-sm"
                >
                  Create Account
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-lg"
            >
              {loading ? 'Sending...' : 'Send Reset Code'}
            </button>
          </form>

          {/* Back to login */}
          <p className="text-center text-sky-text-secondary text-sm mt-6">
            Remember your password?{' '}
            <Link to="/login" className="inline-flex min-h-[44px] items-center px-2 text-sky-green hover:underline">
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

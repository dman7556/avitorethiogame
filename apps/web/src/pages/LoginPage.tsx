import { useState, useEffect } from 'react';
import { usePageMeta } from '../lib/seo';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ErrorModal from '../components/ErrorModal';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage() {
  usePageMeta({
    title: 'Log In',
    description:
      'Log in to your Aviator account to play the live crash game, manage your balance, and cash out.',
    path: '/login',
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const returnTo = (location.state as any)?.returnTo || '/';
  const messageFromState = (location.state as any)?.message;
  const emailFromState = (location.state as any)?.email || '';

  // Show success message from registration
  useEffect(() => {
    if (messageFromState) {
      setSuccessMessage(messageFromState);
      if (emailFromState) {
        setEmail(emailFromState);
      }
      const timer = setTimeout(() => setSuccessMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [messageFromState, emailFromState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-sky-dark flex flex-col">
      {/* Back to Home */}
      <div className="px-4 pt-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sky-text-secondary hover:text-white transition-colors text-sm font-medium min-h-[44px] py-2"
        >
          <ArrowLeft size={18} />
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
            <div className="text-center mb-8">
              <span className="ref-logo" style={{ fontSize: 32 }}>
                Aviator
              </span>
              <p className="text-sky-text-secondary text-sm mt-1">Crash Game</p>
            </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Success message */}
            {successMessage && (
              <div className="bg-sky-green/10 border border-sky-green text-sky-green rounded-lg px-4 py-3 text-sm">
                {successMessage}
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-sm text-sky-text-secondary mb-1">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full bg-sky-card border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
              />
            </div>
            <div>
              <PasswordInput
                label="Password"
                value={password}
                onChange={setPassword}
                required
                autoComplete="current-password"
              />
              <div className="text-right mt-1">
                <Link to="/forgot-password" className="inline-flex min-h-[44px] items-center text-sky-green text-xs hover:underline">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-lg"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {/* Register link */}
          <p className="text-center text-sky-text-secondary text-sm mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="inline-flex min-h-[44px] items-center text-sky-green hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>

      {/* Error Modal */}
      <ErrorModal
        isOpen={showError}
        onClose={() => setShowError(false)}
        message={error}
      />
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ErrorModal from '../components/ErrorModal';
import PasswordInput from '../components/PasswordInput';
import { usePageMeta } from '../lib/seo';

export default function RegisterPage() {
  usePageMeta({
    title: 'Create Account — 20 Birr Free to Start',
    description:
      'Create your Aviator account in under a minute: 20 birr free balance on signup, provably fair live rounds, instant ETB deposits and withdrawals. Strictly 18+.',
    path: '/register',
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showError, setShowError] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const returnTo = (location.state as any)?.returnTo || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setShowError(true);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setShowError(true);
      return;
    }

    setLoading(true);
    try {
      await register(name, email, phone, password);
      // User is now auto-logged-in — go to the game
      navigate(returnTo);
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
      setShowError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-dvh bg-sky-dark flex flex-col">
      {/* Back to Login */}
      <div className="px-4 pt-3">
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sky-text-secondary hover:text-white transition-colors text-sm font-medium min-h-[44px] py-2"
        >
          <ArrowLeft size={18} />
          <span>Back to Login</span>
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <span className="ref-logo" style={{ fontSize: 32 }}>
              Aviator
            </span>
            <h1 className="text-xl font-bold text-white mt-2">Create Account</h1>
            <p className="text-sky-green-light text-sm mt-1 font-medium">🎁 Sign up now and get 20 birr free balance</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="register-name" className="block text-sm text-sky-text-secondary mb-1">Full Name</label>
              <input
                id="register-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                className="w-full bg-sky-card border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
              />
            </div>
            <div>
              <label htmlFor="register-email" className="block text-sm text-sky-text-secondary mb-1">Email</label>
              <input
                id="register-email"
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
              <label htmlFor="register-phone" className="block text-sm text-sky-text-secondary mb-1">Phone Number</label>
              <input
                id="register-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+251 9XX XXX XXX"
                required
                autoComplete="tel"
                className="w-full bg-sky-card border border-sky-border rounded-xl px-4 py-3 text-white placeholder-sky-text-muted focus:outline-none focus:border-sky-green"
              />
            </div>
            <PasswordInput
              label="Password"
              value={password}
              onChange={setPassword}
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 text-lg"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sky-text-secondary text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="inline-flex min-h-[44px] items-center text-sky-green hover:underline">
              Sign In
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

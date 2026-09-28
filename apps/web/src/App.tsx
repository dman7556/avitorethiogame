import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import NotificationToast from './components/NotificationToast';
import GamePage from './pages/GamePage';

// Fix 4 (perf audit): code-split every non-landing route. The landing page
// stays eager so first paint is immediate; admin and dashboard code (heavy,
// only used by a subset of users) no longer ships in the initial player
// bundle. One shared Suspense boundary covers all lazy chunks.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const UserDashboardPage = lazy(() => import('./pages/UserDashboardPage'));
const ProfilePage = lazy(() => import('./pages/user/ProfilePage'));
const DepositHistoryPage = lazy(() => import('./pages/user/DepositHistoryPage'));
const WithdrawalHistoryPage = lazy(() => import('./pages/user/WithdrawalHistoryPage'));
const DepositApprovalPage = lazy(() => import('./pages/admin/DepositApprovalPage'));
const WithdrawalApprovalPage = lazy(() => import('./pages/admin/WithdrawalApprovalPage'));

// Public trust/SEO content pages (indexable, linked from the site footer)
const ProvablyFairPage = lazy(() => import('./pages/ProvablyFairPage'));
const ResponsibleGamingPage = lazy(() => import('./pages/ResponsibleGamingPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const LegalPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.TermsOfServicePage })));
const PrivacyPage = lazy(() => import('./pages/LegalPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sky-dark">
      <div className="text-sky-text-secondary">Loading...</div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-dark">
        <div className="text-sky-text-secondary">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sky-dark">
        <div className="text-sky-text-secondary">Loading...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;
  if (user.role !== 'ADMIN') return <Navigate to="/" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Public, indexable content */}
      <Route path="/provably-fair" element={<ProvablyFairPage />} />
      <Route path="/responsible-gaming" element={<ResponsibleGamingPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/terms" element={<LegalPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <GameProvider>
            <GamePage />
          </GameProvider>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <UserDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/deposits"
        element={
          <ProtectedRoute>
            <DepositHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/withdrawals"
        element={
          <ProtectedRoute>
            <WithdrawalHistoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminPage />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/deposits"
        element={
          <AdminRoute>
            <DepositApprovalPage />
          </AdminRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <NotificationToast />
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

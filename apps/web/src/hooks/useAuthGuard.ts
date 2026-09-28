import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook that provides authentication guard functionality
 * Returns a function that checks auth and redirects if needed
 */
export function useAuthGuard() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Fix 2 (connection audit): the action's return value is propagated so a
  // money-movement call's promise (and its ack-timeout rejection) reaches the
  // caller. Previously the promise was silently discarded, so BetCard's
  // await resolved immediately and error messages could never surface.
  const requireAuth = (action?: () => unknown): unknown => {
    if (!isAuthenticated) {
      navigate('/login', { state: { returnTo: '/' } });
      return false;
    }

    // User is authenticated, execute the action
    return action ? action() : true;
  };

  return { requireAuth, isAuthenticated };
}
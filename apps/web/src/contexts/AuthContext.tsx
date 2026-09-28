import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '@sky-rush/shared';
import { API_BASE } from '../lib/config';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  isAdmin: boolean;
  isGuest: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, phone: string, password: string) => Promise<{ emailSent: boolean; email: string; }>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerificationCode: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  verifyResetCode: (email: string, code: string) => Promise<boolean>;
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = API_BASE; // '' in dev (Vite proxy) · remote Oracle origin in production

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('skyrush_token'));
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (authToken: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
      } else {
        localStorage.removeItem('skyrush_token');
        setToken(null);
        setUser(null);
      }
    } catch {
      localStorage.removeItem('skyrush_token');
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchProfile(token).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (token) {
      await fetchProfile(token);
    }
  }, [token, fetchProfile]);

  const login = async (email: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) {
      // Pass error code to caller for special handling
      const error: any = new Error(data.error);
      error.code = data.code;
      error.email = data.email;
      throw error;
    }
    localStorage.setItem('skyrush_token', data.data.token);
    setToken(data.data.token);
    setUser(data.data.user);
  };

  const register = async (name: string, email: string, phone: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    // Auto-login: store token and user data
    if (data.data.token) {
      localStorage.setItem('skyrush_token', data.data.token);
      setToken(data.data.token);
      setUser(data.data.user);
    }
    return data.data;
  };

  const verifyEmail = async (email: string, code: string) => {
    const res = await fetch(`${API_URL}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    
    // Email verified successfully, but need to login now
    // Don't set token yet - user needs to login after verification
  };

  const resendVerificationCode = async (email: string) => {
    const res = await fetch(`${API_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  };

  const requestPasswordReset = async (email: string) => {
    const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || data.message || 'Failed to send reset code');
  };

  const verifyResetCode = async (email: string, code: string): Promise<boolean> => {
    const res = await fetch(`${API_URL}/api/auth/verify-reset-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.data.valid;
  };

  const resetPassword = async (email: string, code: string, newPassword: string) => {
    const res = await fetch(`${API_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
  };

  const logout = () => {
    localStorage.removeItem('skyrush_token');
    setToken(null);
    setUser(null);
  };

  const isAdmin = user?.role === 'ADMIN';
  const isGuest = !user && !token;
  const isAuthenticated = !!user && !!token;

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      loading, 
      isAdmin, 
      isGuest, 
      isAuthenticated,
      login, 
      register, 
      logout, 
      refreshProfile,
      verifyEmail,
      resendVerificationCode,
      requestPasswordReset,
      verifyResetCode,
      resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

import { env } from './env';

/**
 * Supabase Auth REST API helper (Node 20 compatible — no WebSocket needed)
 * All auth operations go through Supabase's REST API
 */

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;

// ─── Admin API (service_role key) ───────────────────────────────

export async function supabaseAdminCreateUser(params: {
  email: string;
  password: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, any>;
}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<any>;
}

export async function supabaseAdminListUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  return res.json() as Promise<any>;
}

// ─── Public API (anon key — for signup/login) ──────────────────

export async function supabaseSignUp(params: {
  email: string;
  password: string;
  data?: Record<string, any>;
}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...params,
      options: {
        // Disable Supabase's automatic email confirmation
        emailRedirectTo: undefined,
        data: params.data,
      },
    }),
  });
  return res.json() as Promise<any>;
}

export async function supabaseSignIn(params: {
  email: string;
  password: string;
}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<any>;
}

// ─── Token verification (service_role key) ─────────────────────

export async function supabaseVerifyUser(accessToken: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return res.json() as Promise<any>;
}

// ─── Password management ───────────────────────────────────────

export async function supabaseUpdatePassword(accessToken: string, newPassword: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });
  return res.json() as Promise<any>;
}

// ─── Email verification ────────────────────────────────────────

export async function supabaseVerifyOtp(email: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      token,
      type: 'signup',
    }),
  });
  return res.json() as Promise<any>;
}

export async function supabaseResendVerification(email: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      type: 'signup',
    }),
  });
  return res.json() as Promise<any>;
}

// ─── Password reset ────────────────────────────────────────────

export async function supabaseResetPassword(email: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });
  return res.json() as Promise<any>;
}

// ─── Admin: check if user exists by email ──────────────

export async function supabaseAdminGetUserByEmail(email: string) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const data: any = await res.json();
  // The list endpoint returns ALL users; filter locally by email
  const users: any[] = data?.users || [];
  return users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

// ─── Admin: delete user ────────────────────────────────────────

export async function supabaseAdminDeleteUser(userId: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  return res.ok;
}

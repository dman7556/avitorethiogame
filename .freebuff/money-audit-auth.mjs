// Money-audit auth helper — plain REST calls to Supabase Auth (no SDK, no
// WebSocket requirement on Node 20) plus small wrappers around the app API.

const env = process.env;
const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || '';
const API = 'http://localhost:4000/api';

/** Sign in via Supabase Auth REST; returns the access token. */
export async function apiSignin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify({ email, password }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`signin failed (${res.status}): ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

/** Register through the app's real /api/auth/register, then sign in. */
export async function apiRegister(email, password, phone, name) {
  const res = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, password }),
  });
  const j = await res.json();
  if (!j.success) throw new Error('register failed: ' + JSON.stringify(j).slice(0, 300));
  const token = await apiSignin(email, password);
  return { token, userId: j.data.user.id };
}

export async function apiGet(path, token) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

export async function apiPost(path, token, body = {}) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

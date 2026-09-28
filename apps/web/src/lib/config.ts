/**
 * Central API/socket configuration — the single source of truth for where the
 * backend lives (production: Vercel frontend → Oracle Cloud backend).
 *
 * HOW IT RESOLVES
 * ─ Development:  VITE_API_URL is unset or localhost in apps/web/.env →
 *                 REST uses relative paths ('' base) which ride Vite's dev
 *                 proxy to http://localhost:4000, and sockets connect to
 *                 window.location.origin (also proxied, ws: true). No
 *                 hardcoded localhost in app code.
 * ─ Production:   Vercel env var VITE_API_URL=https://<oracle-backend-domain>
 *                 → REST and sockets go straight to the Oracle origin.
 *
 * VITE_* variables are public by design (baked into the JS bundle). Only an
 * API origin may live here — never secrets, service keys, or DB URLs. The
 * backend domain is supplied at build time by Vercel env settings, never
 * hardcoded in source.
 */

const RAW_API_URL = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

/**
 * True when a genuinely remote backend origin is configured. A localhost
 * VITE_API_URL (dev convenience) deliberately falls through to proxy mode so
 * local dev behaves identically with or without the variable set.
 */
export const IS_REMOTE_API =
  RAW_API_URL.length > 0 &&
  !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(RAW_API_URL);

/**
 * Base URL for REST calls: '' in dev/proxy mode (relative paths), or the
 * remote backend origin in production. Use `apiUrl()` rather than
 * concatenating this directly.
 */
export const API_BASE = IS_REMOTE_API ? RAW_API_URL : '';

/**
 * Prefix a relative API path with the configured backend origin.
 * Accepts '/api/...' style paths and returns an absolute URL in production,
 * the unchanged relative path in development.
 *
 *   apiUrl('/api/wallet')            → '/api/wallet'                (dev)
 *   apiUrl('/api/wallet')            → 'https://api.example.com/api/wallet' (prod)
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Origin for Socket.IO connections. Mirrors the REST strategy: the Vite dev
 * proxy in development (ws: true is already configured), the Oracle backend
 * origin in production. Never window.location.origin in production — the
 * frontend is served by Vercel and has no Socket.IO endpoint of its own.
 */
export function socketOrigin(): string {
  return API_BASE || window.location.origin;
}

/**
 * Resolve a stored screenshot URL for rendering. New deposits store absolute
 * Cloudinary URLs (returned unchanged); legacy rows store server-relative
 * /uploads/... paths that live on the Oracle backend, not on Vercel — those
 * must be resolved against the backend origin so they don't 404 against the
 * Vercel filesystem (which is not persistent app storage).
 */
export function uploadUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url; // Cloudinary / absolute
  return apiUrl(url.startsWith('/') ? url : `/${url}`); // legacy /uploads/...
}

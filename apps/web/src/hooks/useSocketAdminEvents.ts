import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { socketOrigin } from '../lib/config';

/**
 * Admin real-time events via Socket.IO.
 * Connects an authenticated admin socket and fires a refresh callback on
 * any financial event (new/approved/rejected deposits & withdrawals,
 * stats changes). The socket persists across re-renders; only the token
 * can retrigger a connection. Falls back silently to the page's polling.
 */
const ADMIN_EVENTS = [
  'admin:deposit_new',
  'admin:deposit_approved',
  'admin:deposit_rejected',
  'admin:withdrawal_new',
  'admin:withdrawal_approved',
  'admin:withdrawal_rejected',
  'admin:stats_updated',
] as const;

export function useSocketAdminEvents(token: string | null, onEvent: () => void) {
  // Keep the latest callback without reconnecting on identity changes
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    let socket: Socket | null = null;
    let disposed = false;

    try {
      // Oracle backend via socketOrigin(): Vite proxies /socket.io in dev,
      // VITE_API_URL in production (never the Vercel origin)
      socket = io(socketOrigin(), {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
      });

      const handler = () => handlerRef.current();
      for (const evt of ADMIN_EVENTS) {
        socket.on(evt, handler);
      }

      socket.on('connect', () => {
        console.log('[AdminSocket] Connected for real-time admin events');
      });

      socket.on('connect_error', () => {
        // Silent - the 15s polling fallback keeps the page functional
      });
    } catch {
      // Socket failure must never break the admin page
    }

    return () => {
      disposed = true;
      if (socket) {
        socket.disconnect();
      }
    };
  }, [token]);
}

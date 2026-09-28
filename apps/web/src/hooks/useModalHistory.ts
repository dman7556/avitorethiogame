import { useEffect, useRef } from 'react';

/**
 * Mobile UX #3: integrate a modal with browser history so the Android back
 * gesture (and the browser back button) closes the modal instead of leaving
 * the page — which would drop the player's session mid-round.
 *
 * - When `isOpen` flips true, one history entry is pushed.
 * - popstate (user pressed back) closes the modal; the entry it consumes is
 *   the one we pushed, so no phantom step is left behind.
 * - When the modal closes via its own close button (isOpen flips false
 *   without a popstate), the pushed entry is popped with history.back(),
 *   so a later back press still reaches the real previous page.
 *
 * Each modal instance tracks its own entry; instances whose depth is 0
 * ignore popstate events entirely.
 *
 * Known edge: if the host component unmounts while the modal is open
 * (navigating away with a modal open), one entry is left in history —
 * one extra back press becomes a no-op. Accepted for this minimal version.
 */
export function useModalHistory(isOpen: boolean, close: () => void) {
  const depthRef = useRef(0);
  const poppedRef = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;

  // User pressed back / swiped the back gesture
  useEffect(() => {
    const onPopState = () => {
      if (depthRef.current > 0) {
        depthRef.current -= 1;
        poppedRef.current = true; // the close below must NOT pop again
        closeRef.current();
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Track open/close transitions
  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ modal: true }, '');
      depthRef.current += 1;
    } else if (poppedRef.current) {
      poppedRef.current = false; // back press already consumed the entry
    } else if (depthRef.current > 0) {
      depthRef.current -= 1;
      window.history.back(); // closed via its own close button — pop our entry
    }
  }, [isOpen]);
}

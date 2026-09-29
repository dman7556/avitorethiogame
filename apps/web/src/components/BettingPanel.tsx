import { useState, useRef, useLayoutEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useNavigate } from 'react-router-dom';
import { GAME_CONSTANTS } from '../shared/types';
import BetCard from './BetCard';

export default function BettingPanel() {
  const { bet1, bet2, phase, placeBet, cashout, cancelBet, setBetAmount, setAutoCashout, balance } = useGame();
  const { isAuthenticated } = useAuth();
  const { requireAuth } = useAuthGuard();
  // Single design (phone layout everywhere): the optional second bet card
  // starts in its designed collapsed state ("+ Add second bet") on ALL
  // viewports — desktop included. One tap restores it.
  const [showBet2, setShowBet2] = useState(false);

  // ── Dual-bet fit (mobile) ────────────────────────────────────
  // With the second card open, BOTH cards must stay fully visible on phones.
  // The game screen is a fixed, non-scrolling fit and the bet panel itself can
  // extend below the fold (canvas + panel claim more height than the viewport
  // has), so simply appending the card used to leave its bottom clipped and
  // the panel scrollable. Instead: measure the panel's *visible* height and
  // uniformly scale the two cards down to fit it, keeping full width.
  const panelRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    if (!showBet2) {
      setFitScale(1);
      return;
    }

    let frame = 0;

    const measure = () => {
      const panel = panelRef.current;
      const scaler = scalerRef.current;
      if (!panel || !scaler) return;

      const rect = panel.getBoundingClientRect();
      // visualViewport tracks mobile toolbars/keyboard better than innerHeight
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      // Clamp to the fold: the panel's lower part may be off-screen entirely.
      const visible = Math.max(0, Math.min(rect.bottom, viewportH) - rect.top);
      const cs = getComputedStyle(panel);
      const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const available = visible - padding;
      // offsetHeight is layout-based, so it reports the natural (unscaled)
      // height even while a transform is applied — this can never loop.
      const natural = scaler.offsetHeight;

      if (natural > 0 && available > 0) {
        setFitScale(Math.min(1, available / natural));
      }
    };

    // Measure immediately (so the fit is right even where rAF is throttled or
    // paused, e.g. a hidden tab or a non-compositing webview) and once more on
    // the next frame, because resize/visualViewport events can arrive before
    // the new geometry is in place — a stale, too-large scale would clip a
    // card. The computation is idempotent and transform-independent, so
    // running it twice can never loop.
    const schedule = () => {
      measure();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    if (panelRef.current) observer.observe(panelRef.current);
    if (scalerRef.current) observer.observe(scalerRef.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    // Mobile URL bars and the on-screen keyboard resize the visual viewport
    // without always firing a window resize.
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
    };
  }, [showBet2]);

  // Allow betting at all times except CRASHED
  // During countdown: bets activate immediately
  // After countdown: bets queue for next round
  const canBet = phase !== 'CRASHED';
  const canCashout = phase === 'FLYING';

  // Scale down (never up) with a width compensation so a scaled card still
  // spans the full panel width instead of shrinking toward the centre.
  const scaling = showBet2 && fitScale < 1;
  const scalerStyle = scaling
    ? { transform: `scale(${fitScale})`, width: `${100 / fitScale}%` }
    : undefined;

  return (
    <div
      ref={panelRef}
      className={`betting-panel px-3 py-2 space-y-2.5 ${showBet2 ? 'is-dual' : ''}`}
    >
      <div ref={scalerRef} className="betting-scaler space-y-2.5" style={scalerStyle}>
        {/* Bet Card 1 */}
        <div className="relative">
          <BetCard
            bet={bet1}
            canBet={canBet && isAuthenticated}
            canCashout={canCashout && isAuthenticated}
            balance={balance}
            isGuest={!isAuthenticated}
            // Fix 2 (connection audit): await through so the ack-timeout
            // rejection reaches BetCard's error banner instead of vanishing.
            onPlaceBet={async (amount, autoCashout) => { await requireAuth(() => placeBet(1, amount, autoCashout)); }}
            onCashout={async () => { await requireAuth(() => cashout(1)); }}
            onCancel={async () => { await requireAuth(() => cancelBet(1)); }}
            onAmountChange={(amount) => requireAuth(() => setBetAmount(1, amount))}
            onAutoCashoutChange={(val) => requireAuth(() => setAutoCashout(1, val))}
          />
        </div>

        {/* Bet Card 2 */}
        <div className="relative">
          {showBet2 ? (
            <BetCard
              bet={bet2}
              canBet={canBet && isAuthenticated}
              canCashout={canCashout && isAuthenticated}
              balance={balance}
              isGuest={!isAuthenticated}
              onPlaceBet={async (amount, autoCashout) => { await requireAuth(() => placeBet(2, amount, autoCashout)); }}
              onCashout={async () => { await requireAuth(() => cashout(2)); }}
              onCancel={async () => { await requireAuth(() => cancelBet(2)); }}
              onAmountChange={(amount) => requireAuth(() => setBetAmount(2, amount))}
              onAutoCashoutChange={(val) => requireAuth(() => setAutoCashout(2, val))}
              onRemove={() => requireAuth(() => setShowBet2(false))}
            />
          ) : (
            <button
              onClick={() => requireAuth(() => setShowBet2(true))}
              className="w-full py-3 border border-dashed border-sky-border rounded-xl text-sky-text-secondary text-sm hover:border-sky-border-light transition-colors"
            >
              + Add second bet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
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

  // Allow betting at all times except CRASHED
  // During countdown: bets activate immediately
  // After countdown: bets queue for next round
  const canBet = phase !== 'CRASHED';
  const canCashout = phase === 'FLYING';  return (
    <div className="px-3 py-2 space-y-2.5">
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
  );
}

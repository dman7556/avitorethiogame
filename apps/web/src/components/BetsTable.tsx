import { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import type { BetStatus } from '@sky-rush/shared';

type Tab = 'ALL' | 'PREVIOUS' | 'TOP';

function getStatusColor(status: BetStatus): string {
  if (status === 'CASHED_OUT') return 'text-sky-green';
  if (status === 'LOST') return 'text-sky-red';
  return 'text-sky-text-secondary';
}

export default function BetsTable() {
  const [activeTab, setActiveTab] = useState<Tab>('ALL');
  const { publicBets } = useGame();

  const filteredBets = publicBets.filter((bet) => {
    if (activeTab === 'ALL') return true;
    if (activeTab === 'PREVIOUS') return bet.status === 'CASHED_OUT' || bet.status === 'LOST';
    if (activeTab === 'TOP') return bet.payout && bet.payout > 0;
    return true;
  });

  const sortedBets = activeTab === 'TOP'
    ? [...filteredBets].sort((a, b) => (b.payout || 0) - (a.payout || 0))
    : filteredBets;

  return (
    <div className="bets-section px-4 pt-3 pb-4">
      {/* Tabs */}
      <div className="flex justify-center mb-3">
        <div className="seg-control">
          {(['ALL', 'PREVIOUS', 'TOP'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`seg-btn ${
                activeTab === tab ? 'active' : ''
              }`}
            >
              {tab === 'ALL' ? 'All Bets' : tab === 'PREVIOUS' ? 'Previous' : 'Top'}
            </button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-4 gap-2 px-2 mb-2 text-xs text-sky-text-muted">
        <span>Player</span>
        <span className="text-right">Bet</span>
        <span className="text-right">Multiplier</span>
        <span className="text-right">Win</span>
      </div>

      {/* Bets list */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {sortedBets.length === 0 ? (
          <div className="text-center text-sky-text-muted text-xs py-4">
            No bets yet
          </div>
        ) : (
          sortedBets.map((bet) => (
            <div
              key={bet.betId}
              className="grid grid-cols-4 gap-2 px-2 py-1.5 text-xs rounded-lg hover:bg-sky-dark/50 transition-colors"
            >
              <span className="text-sky-text-secondary truncate">{bet.username}</span>
              <span className="text-right font-mono text-white">{bet.amount.toFixed(2)}</span>
              <span className={`text-right font-mono ${getStatusColor(bet.status)}`}>
                {bet.multiplier ? `${bet.multiplier.toFixed(2)}x` : '—'}
              </span>
              <span className={`text-right font-mono ${bet.payout ? 'text-sky-green' : 'text-sky-text-muted'}`}>
                {bet.payout ? `+${bet.payout.toFixed(2)}` : '—'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

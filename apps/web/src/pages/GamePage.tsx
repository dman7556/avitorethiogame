import { useState } from 'react';
import Header from '../components/Header';
import RoundHistory from '../components/RoundHistory';
import GameCanvas from '../components/GameCanvas';
import BettingPanel from '../components/BettingPanel';
import BetsTable from '../components/BetsTable';
import ChatPanel from '../components/ChatPanel';
import SiteFooter from '../components/SiteFooter';
import { useAudio } from '../audio/useAudio';
import { useGame } from '../contexts/GameContext';

export default function GamePage() {
  const [showChat, setShowChat] = useState(false);
  const { connected, socket, reconnectFailed } = useGame();
  // Mounts the AudioContext unlock-on-first-interaction (§18 mobile autoplay)
  useAudio();

  return (
    <div className="game-fit bg-[#0e0e0e] flex flex-col">
      {/* Semantic page heading (visually hidden — the game is the content) */}
      <h1 className="sr-only">Aviator — real-time crash game, provably fair and 18+ only</h1>
      {/* Connection indicator */}
      {!connected && (reconnectFailed ? (
        <button
          onClick={() => socket?.connect()}
          className="bg-sky-red/25 text-sky-red w-full text-center py-2 text-xs font-semibold active:opacity-80"
        >
          Connection lost — tap to retry
        </button>
      ) : (
        <div className="bg-sky-red/20 text-sky-red text-center py-1 text-xs font-medium">
          Reconnecting...
        </div>
      ))}

      <Header onToggleChat={() => setShowChat(!showChat)} />

      <div
        className="game-middle flex-1 flex flex-col w-full"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="game-hist-sec flex-none"><RoundHistory /></div>
        <div className="game-canvas-sec"><GameCanvas /></div>
        <div className="game-panel-sec flex-none"><BettingPanel /></div>
        {/* Hide bets table on desktop (≥512px) */}
        <div className="game-bets-sec md:hidden"><BetsTable /></div>
      </div>

      {/* Trust/footer nav — desktop only, keeps the mobile viewport fit intact */}
      <div className="hidden md:block"><SiteFooter compact /></div>

      {/* Chat overlay */}
      {showChat && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowChat(false)}
          />
          <div className="relative w-full max-w-sm h-full">
            <ChatPanel onClose={() => setShowChat(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

import { useGame } from '../contexts/GameContext';
import { History, Heart } from 'lucide-react';

function getHistoryClass(crashPoint: number): string {
  if (crashPoint < 2) return 'history-low';
  if (crashPoint < 10) return 'history-medium';
  return 'history-high';
}

export default function RoundHistory() {
  const { history } = useGame();

  return (
    <div className="px-3 py-2">
      <div className="history-strip">
        <div className="history-scroll">
          {history.length === 0 ? (
            <div className="text-sky-text-muted text-xs py-1">No history yet</div>
          ) : (
            history.slice(0, 15).map((item, idx) => (
              <span
                key={item.id}
                className={`history-pill ${getHistoryClass(item.crashPoint)} ${idx === 0 ? 'brightness-125' : ''}`}
              >
                {item.crashPoint.toFixed(2)}x
              </span>
            ))
          )}
        </div>

        {/* Round-history / favorites capsule control */}
        <div className="history-capsule">
          <button aria-label="Round history" type="button">
            <History size={16} />
          </button>
          <button aria-label="Favorites" type="button">
            <Heart size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

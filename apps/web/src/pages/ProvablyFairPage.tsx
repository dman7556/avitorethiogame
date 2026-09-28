import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import PublicPage from '../components/PublicPage';
import { usePageMeta } from '../lib/seo';
import { socketOrigin } from '../lib/config';

interface RoundInfo {
  roundNumber: number;
  serverSeedHash: string | null;
  serverSeed?: string | null;
  crashPoint?: number | null;
}

/** Recompute the crash point exactly as the server does (fairness.ts). */
async function verifyAsync(serverSeed: string, roundNumber: number): Promise<number> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${serverSeed}:${roundNumber}`));
  // First 52 bits → uniform fraction in [0,1), same as the server
  const bytes = new Uint8Array(sig.slice(0, 7));
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const int = parseInt(h.slice(0, 13), 16) / Math.pow(2, 52);
  return Math.round(Math.min(10000, Math.max(1.01, (1 - 0.03) / (1 - int))) * 100) / 100;
}

export default function ProvablyFairPage() {
  usePageMeta({
    title: 'Provably Fair — Verify Every Round Yourself',
    description:
      'Every Aviator round is committed before betting opens: we publish the SHA-256 hash of the outcome seed, then reveal the seed when the round settles. Recompute any crash point yourself — no trust required.',
    path: '/provably-fair',
  });

  const [round, setRound] = useState<RoundInfo | null>(null);
  const [expected, setExpected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Own lightweight socket: this page sits outside GameProvider (which only
  // wraps the game route) and needs only the round:state broadcast.
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Split-hosting URL strategy (lib/config): VITE_API_URL (Oracle) in
    // production — window.location.origin would point sockets at Vercel
    // itself, which has no Socket.IO endpoint. Dev/proxy mode uses the Vite
    // dev proxy via same-origin.
    const socketUrl = socketOrigin();
    const s = io(socketUrl, { transports: ['websocket'] });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    return () => {
      s.close();
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onState = (s: RoundInfo) => {
      setRound(s);
      setExpected(null);
      setError(null);
    };
    socket.on('round:state', onState);
    return () => {
      socket.off('round:state', onState);
    };
  }, [socket]);

  useEffect(() => {
    if (round?.serverSeed && round.roundNumber) {
      verifyAsync(round.serverSeed, round.roundNumber)
        .then(setExpected)
        .catch(() => setError('Verification failed — check the seed and round number.'));
    }
  }, [round?.serverSeed, round?.roundNumber]);

  const revealed = Boolean(round?.serverSeed);

  return (
    <PublicPage title="Provably Fair — How Every Round Is Verified">
      <section className="space-y-4 text-sm leading-relaxed text-sky-text-secondary">
        <h2 className="text-lg font-bold text-white">The short version</h2>
        <p>
          Before betting opens on a round, our server picks a secret random{' '}
          <strong className="text-white">server seed</strong> and publishes its{' '}
          <strong className="text-white">SHA-256 hash</strong> — a commitment it
          cannot later change. When the round ends, the seed is revealed, and
          anyone can recompute the exact crash point from two public numbers.
          If we ever tampered with an outcome, it would no longer match the
          hash published <em>before</em> the round.
        </p>

        <h2 className="text-lg font-bold text-white pt-2">The formula</h2>
        <pre className="bg-black/50 border border-white/10 rounded-lg p-4 overflow-x-auto text-xs text-sky-green-light font-mono">{`h   = HMAC_SHA256(serverSeed, "\${serverSeedHash}:\${roundNumber}")
u   = first 52 bits of h as a fraction in [0, 1)
crash = clamp(round2((1 - 0.03) / (1 - u)), 1.01, 10000)`}</pre>
        <p>
          The 0.03 term is the house edge (3%) — declared openly. The outcome
          depends only on the seed and the round number: not on who is
          playing, how much is bet, or what the platform stands to win.
        </p>

        <h2 className="text-lg font-bold text-white pt-2">Verify the current round live</h2>
        <p>
          This panel listens to the live game feed. The commitment appears when
          betting opens; the reveal (and the recomputed result) appears the
          moment the round settles.
        </p>

        <div className="bg-black/40 border border-white/10 rounded-lg p-4 space-y-2 font-mono text-xs">
          <div>
            <span className="text-sky-text-secondary">live feed:</span>{' '}
            <span className={connected ? 'text-sky-green-light' : 'text-sky-red'}>{connected ? 'connected' : 'connecting…'}</span>
          </div>
          <div>
            <span className="text-sky-text-secondary">round:</span>{' '}
            <span className="text-white">{round?.roundNumber ?? '—'}</span>
          </div>
          <div className="break-all">
            <span className="text-sky-text-secondary">commitment (SHA-256):</span>{' '}
            <span className="text-sky-green-light break-all">{round?.serverSeedHash ?? '—'}</span>
          </div>
          <div className="break-all">
            <span className="text-sky-text-secondary">revealed seed:</span>{' '}
            <span className="text-white break-all">{revealed ? round!.serverSeed : 'pending — revealed when the round settles'}</span>
          </div>
          <div>
            <span className="text-sky-text-secondary">recomputed crash point:</span>{' '}
            <span className="text-sky-orange font-bold">
              {expected !== null ? `${expected.toFixed(2)}x` : error ?? '—'}
            </span>
          </div>
        </div>

        <h2 className="text-lg font-bold text-white pt-2">What this proves — and what it doesn't</h2>
        <p>
          Commit/reveal proves the <em>outcome</em> was fixed before betting
          opened and was not altered afterwards. It does not mean every round
          is profitable for you — the house edge means the odds favor the
          house over the long run. Play for entertainment, never as income.
        </p>
      </section>
    </PublicPage>
  );
}

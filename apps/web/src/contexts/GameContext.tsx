import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import * as AudioEvents from '../audio/AudioEvents';
import type {
  GamePhase,
  BetStatus,
  RoundHistoryItem,
  PublicBet,
  ChatMessageEvent,
} from '@sky-rush/shared';
import { emitWithTimeout, AckTimeoutError } from '@sky-rush/shared';
import { apiUrl, socketOrigin } from '../lib/config';

interface BetState {
  id: string | null;
  slot: 1 | 2;
  amount: number;
  autoCashout: number | null;
  status: BetStateStatus;
  payout: number | null;
  cashoutMultiplier: number | null;
}

type BetStateStatus = 'IDLE' | 'PENDING' | 'PLACED' | 'QUEUED' | 'ACTIVE' | 'CASHED_OUT' | 'LOST' | 'CANCELLED';

interface GameState {
  // Connection
  connected: boolean;
  /** #5: true once reconnection attempts are exhausted (banner switches to manual retry) */
  reconnectFailed: boolean;
  socket: Socket | null;

  // Round
  roundId: string | null;
  roundNumber: number;
  phase: GamePhase;
  multiplier: number;
  countdown: number | null;
  /** Fix 3: ISO flight-start timestamp from round:state (null outside flight). */
  startedAt: string | null;

  // Bets
  bet1: BetState;
  bet2: BetState;

  // Wallet
  balance: number;
  reserved: number;
  available: number;

  // History
  history: RoundHistoryItem[];
  fairnessCommit: { serverSeedHash: string; roundsRemaining: number } | null;
  publicBets: PublicBet[];
  chatMessages: ChatMessageEvent[];

  // Actions
  placeBet: (slot: 1 | 2, amount: number, autoCashout?: number) => Promise<void>;
  cashout: (slot: 1 | 2) => Promise<void>;
  cancelBet: (slot: 1 | 2) => Promise<void>;
  setBetAmount: (slot: 1 | 2, amount: number) => void;
  setAutoCashout: (slot: 1 | 2, value: number | null) => void;
  sendMessage: (message: string) => Promise<void>;
}

const initialBet = (slot: 1 | 2): BetState => ({
  id: null,
  slot,
  amount: 4,
  autoCashout: null,
  status: 'IDLE',
  payout: null,
  cashoutMultiplier: null,
});

const GameContext = createContext<GameState | undefined>(undefined);

// #8 (mobile UX/perf): the multiplier ticks ~20x/s during flight. Isolating it
// in its own context keeps every non-canvas consumer (header, chat, history,
// bets table) from re-rendering on each tick.
const TickContext = createContext<number>(1.0);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // #5 (mobile UX): socket.io exhausted its reconnection attempts — banner must offer manual retry
  const [reconnectFailed, setReconnectFailed] = useState(false);

  // Round state
  const [roundId, setRoundId] = useState<string | null>(null);
  // Fix 3: server flight-start timestamp (ISO) from the latest round:state
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState(0);
  const [phase, setPhase] = useState<GamePhase>('WAITING' as GamePhase);
  const [multiplier, setMultiplier] = useState(1.0);
  // #8: ref mirror of the tick multiplier — lets callbacks read the live value
  // without being re-created (and re-busting the memoized context) every tick.
  const multiplierRef = useRef(1.0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Bet state
  const [bet1, setBet1] = useState<BetState>(initialBet(1));
  const [bet2, setBet2] = useState<BetState>(initialBet(2));

  // Wallet (balance = total, reserved = held for pending withdrawals,
  // available = balance - reserved = spendable on bets)
  const [balance, setBalance] = useState(0);
  const [reserved, setReserved] = useState(0);
  const [available, setAvailable] = useState(0);

  // History & Social
  const [history, setHistory] = useState<RoundHistoryItem[]>([]);
  // Provably-fair commit info from the server (audit M2)
  const [fairnessCommit, setFairnessCommit] = useState<{ serverSeedHash: string; roundsRemaining: number } | null>(null);
  const [publicBets, setPublicBets] = useState<PublicBet[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageEvent[]>([]);

  // Bet amounts (user-editable before placing)
  const betAmountsRef = useRef({ 1: 4, 2: 4 });
  const autoCashoutRef = useRef<{ 1: number | null; 2: number | null }>({ 1: null, 2: null });

  // Track if bet was placed this round to auto-reset
  const betPlacedRef = useRef({ 1: false, 2: false });

  // Fetch initial balance
  useEffect(() => {
    if (!token) {
      // Guest mode - no balance, no redirect
      setBalance(0);
      setReserved(0);
      setAvailable(0);
      return;
    }
    
    fetch(apiUrl('/api/wallet'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setBalance(data.data.balance);
          setReserved(data.data.reserved || 0);
          setAvailable(data.data.available ?? data.data.balance - (data.data.reserved || 0));
        }
      })
      .catch(() => {});
  }, [token]);

  // Socket connection
  useEffect(() => {
    // Connect socket to backend server.
    // Split-hosting strategy (lib/config): VITE_API_URL (Oracle origin) when a
    // remote backend is configured, otherwise same-origin — the Vite dev proxy
    // (ws: true) carries /socket.io to the backend in development.
    const socketUrl = socketOrigin();
    console.log(`[GameContext] Socket URL: ${socketUrl}`);

    const newSocket = io(socketUrl, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to backend');
      setConnected(true);
      setReconnectFailed(false); // #5: back online
      
      // Authenticate only if we have a token
      if (token) {
        console.log('[Socket] Attempting authentication...');
        newSocket.emit('auth:authenticate', { token }, (response: any) => {
          if (response.success) {
            console.log('[Socket] Authenticated successfully');
          } else {
            console.log('[Socket] Authentication failed:', response.error);
          }
        });
      } else {
        console.log('[Socket] Connected as guest');
      }
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected from backend');
      setConnected(false);
    });

    newSocket.on('connect_error', (error: any) => {
      console.error('[Socket] Connection error:', error);
    });

    // #5: attempts exhausted — let the UI offer a manual retry instead of a lying banner.
    // socket.io v4 emits reconnect events on the Manager, not the Socket — listen on both.
    const onReconnectFailed = () => {
      console.log('[Socket] Reconnection attempts exhausted');
      setReconnectFailed(true);
    };
    newSocket.on('reconnect_failed', onReconnectFailed);
    newSocket.io?.on('reconnect_failed', onReconnectFailed);

    // ---- Round Events ----
    newSocket.on('round:state', (data: any) => {
      setRoundId(data.roundId);
      setRoundNumber(data.roundNumber);
      setPhase(data.phase);
      // Fix 3: surface the server's flight-start timestamp so the canvas can
      // resume the curve mid-flight on reconnect instead of restarting it.
      setStartedAt(data.startedAt ?? null);
      if (data.countdown !== null) {
        setCountdown(data.countdown);
      }

      // Audio: phase transitions and countdown
      AudioEvents.onRoundState(data);

      // Reset bets for new round
      if (data.phase === 'BETTING') {
        setBet1((prev) => {
          // If bet was QUEUED, keep the bet ID and amount but update status to PLACED
          // Server will have already moved it to the new round
          if (prev.status === 'QUEUED') {
            return {
              ...prev,
              status: 'PLACED', // Server activates queued bets as PLACED
              payout: null,
              cashoutMultiplier: null,
            };
          }
          // Otherwise reset to fresh state
          return {
            ...prev,
            id: null,
            status: 'IDLE',
            payout: null,
            cashoutMultiplier: null,
          };
        });
        setBet2((prev) => {
          // If bet was QUEUED, keep the bet ID and amount but update status to PLACED
          if (prev.status === 'QUEUED') {
            return {
              ...prev,
              status: 'PLACED',
              payout: null,
              cashoutMultiplier: null,
            };
          }
          // Otherwise reset to fresh state
          return {
            ...prev,
            id: null,
            status: 'IDLE',
            payout: null,
            cashoutMultiplier: null,
          };
        });
        betPlacedRef.current = { 1: false, 2: false };
        multiplierRef.current = 1.0; // #8
        setMultiplier(1.0);
      }
    });

    // Fix 1 (connection audit): authoritative bet/wallet resync. The server
    // sends this on EVERY successful auth (fresh connect + reconnect) AFTER
    // round:state. A client that missed a broadcast while disconnected —
    // lost place/cashout ack, settlement during a drop — rewrites its bet
    // slots and balance from the server's DB view instead of keeping stale
    // local state (e.g. showing "ACTIVE" on a bet that actually won).
    newSocket.on('bet:sync', (data: any) => {
      // Balance: payload carries the DB balance; the reserved/available split
      // comes from the existing /api/wallet fetch (same pattern as
      // wallet:updated / deposit:approved handlers).
      if (data.balance !== null && data.balance !== undefined) {
        setBalance(data.balance);
        fetch(apiUrl('/api/wallet'), { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json())
          .then((d) => {
            if (d.success) {
              setReserved(d.data.reserved || 0);
              setAvailable(d.data.available ?? d.data.balance - (d.data.reserved || 0));
            }
          })
          .catch(() => {});
      }

      // Assign rows to slots deterministically: first (oldest) row per slot.
      // A pathological duplicate QUEUED row for the same slot is ignored here
      // (the server's activation/refund paths own that row's fate).
      const assigned: { 1?: any; 2?: any } = {};
      for (const row of data.bets || []) {
        const slot = row.slot === 2 ? 2 : 1;
        if (!assigned[slot]) assigned[slot] = row;
      }

      const applySlot = (slot: 1 | 2) => (prev: BetState): BetState => {
        const row = assigned[slot];
        if (!row) {
          // No authoritative live row for this slot → the local one is stale
          // (lost ack / missed settle). Clear it so the user can bet again.
          if (prev.id === null && prev.status === 'IDLE') return prev;
          return { ...prev, id: null, status: 'IDLE', payout: null, cashoutMultiplier: null };
        }
        return {
          ...prev,
          id: row.id,
          amount: Number(row.amount),
          autoCashout: row.autoCashout ? Number(row.autoCashout) : null,
          status: row.status as BetStateStatus,
          payout: row.payout ? Number(row.payout) : null,
          cashoutMultiplier: row.cashoutMultiplier ? Number(row.cashoutMultiplier) : null,
        };
      };
      setBet1(applySlot(1));
      setBet2(applySlot(2));
    });

    newSocket.on('round:tick', (data: any) => {
      multiplierRef.current = data.multiplier; // #8
      setMultiplier(data.multiplier);
      AudioEvents.onMultiplierTick(data.multiplier);
    });

    newSocket.on('round:crashed', (data: any) => {
      setPhase('CRASHED' as GamePhase);
      multiplierRef.current = data.crashPoint; // #8
      setMultiplier(data.crashPoint);
      // Audio: interrupt the flight engine and play the crash sound NOW —
      // the server does not re-broadcast round:state with CRASHED, so this
      // event is the only live crash moment. Guarded per-round in the bridge.
      AudioEvents.onRoundCrashed(data.roundId);
      // Loss indication only if the CURRENT user still had an active (uncashed) bet
      const ownBetLost = [bet1, bet2].some(
        (b) => b.id && (b.status === 'ACTIVE' || b.status === 'PLACED')
      );
      if (ownBetLost) {
        AudioEvents.onOwnBetLost();
      }
    });

    newSocket.on('round:settled', (data: any) => {
      setPhase('SETTLED' as GamePhase);
      // Audio: engine must not continue past the round (idempotent).
      AudioEvents.onRoundSettled();
      // Keep QUEUED bets as they will be activated in next round
      // Only reset bets that have completed (CASHED_OUT, LOST) or are no longer active
      setBet1((prev) => {
        if (prev.status === 'QUEUED') {
          return prev; // Keep queued bets intact
        }
        // Reset completed bets to IDLE, preserve CASHED_OUT state briefly for display
        if (prev.status === 'CASHED_OUT') {
          return prev; // Keep showing the cashout result
        }
        if (prev.status === 'LOST' || prev.status === 'ACTIVE' || prev.status === 'PLACED') {
          return {
            ...prev,
            status: 'IDLE',
            id: null,
            payout: null,
            cashoutMultiplier: null,
          };
        }
        return prev;
      });
      setBet2((prev) => {
        if (prev.status === 'QUEUED') {
          return prev; // Keep queued bets intact
        }
        // Reset completed bets to IDLE, preserve CASHED_OUT state briefly for display
        if (prev.status === 'CASHED_OUT') {
          return prev; // Keep showing the cashout result
        }
        if (prev.status === 'LOST' || prev.status === 'ACTIVE' || prev.status === 'PLACED') {
          return {
            ...prev,
            status: 'IDLE',
            id: null,
            payout: null,
            cashoutMultiplier: null,
          };
        }
        return prev;
      });
      betPlacedRef.current = { 1: false, 2: false };
    });

    newSocket.on('round:history', (data: any) => {
      setHistory(data.history || []);
      if (typeof data.serverSeedHash === 'string' && typeof data.roundsRemaining === 'number') {
        setFairnessCommit({ serverSeedHash: data.serverSeedHash, roundsRemaining: data.roundsRemaining });
      }
    });

    // ---- Bet Events ----
    newSocket.on('bet:placed', (data: any) => {
      // NOTE: no sound here — this broadcast fires for EVERY player's bet.
      // The current user's confirmation tone plays once in placeBet()'s ack
      // path (AudioEvents.onBetAccepted), per spec §7.
      setPublicBets((prev) => [
        {
          betId: data.betId,
          username: data.username,
          amount: data.amount,
          multiplier: null,
          payout: null,
          status: 'PLACED' as BetStatus,
          slot: data.slot,
        },
        ...prev.slice(0, 49),
      ]);
    });

    newSocket.on('bet:cashed_out', (data: any) => {
      // Play a sound ONLY for the current user's cashout, exactly once —
      // the ack path may have already played it (cashoutsPlayed dedup).
      const myId = user?.id;
      const isMine = myId ? data.userId === myId : false;
      if (isMine && !AudioEvents.isCashoutPlayed(data.betId)) {
        // Broadcast-only path: this was an auto-cashout (manual cashouts
        // always play via the ack path in cashout()).
        AudioEvents.onAutoCashoutTriggered(data.betId, data.multiplier);
      }
      setPublicBets((prev) =>
        prev.map((b) =>
          b.betId === data.betId
            ? { ...b, multiplier: data.multiplier, payout: data.payout, status: 'CASHED_OUT' as BetStatus }
            : b
        )
      );
    });

    newSocket.on('wallet:updated', (data: any) => {
      if (data.balance !== undefined) {
        setBalance(data.balance);
        // Server is authoritative on reserved; recompute available
        const res = data.reserved !== undefined ? data.reserved : undefined;
        if (res !== undefined) {
          setReserved(res);
          setAvailable(data.balance - res);
        } else {
          // No reserved info in this event; refetch authoritative wallet
          fetch(apiUrl('/api/wallet'), { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => r.json())
            .then((d) => {
              if (d.success) {
                setBalance(d.data.balance);
                setReserved(d.data.reserved || 0);
                setAvailable(d.data.available ?? d.data.balance - (d.data.reserved || 0));
              }
            })
            .catch(() => {});
        }
      }
    });

    // ---- Deposit Events ----
    newSocket.on('deposit:approved', (data: any) => {
      // Show toast notification
      console.log('[DEPOSIT] Deposit approved:', data);
      // You can emit a toast event here or use a notification context
      // This would trigger a notification banner at the top of the screen
      AudioEvents.onDepositApproved(); // Use success sound for deposit approval
      // Dispatch custom event for notifications
      window.dispatchEvent(
        new CustomEvent('depositApproved', { 
          detail: { 
            message: data.message,
            amount: data.creditedAmount,
            newBalance: data.newBalance,
          } 
        })
      );
      // Update balance from the broadcast
      setBalance(data.newBalance);
      fetch(apiUrl('/api/wallet'), { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) {
            setReserved(d.data.reserved || 0);
            setAvailable(d.data.available ?? d.data.balance - (d.data.reserved || 0));
          }
        })
        .catch(() => {});
    });

    newSocket.on('deposit:rejected', (data: any) => {
      console.log('[DEPOSIT] Deposit rejected:', data);
      // Show error notification
      AudioEvents.onDepositRejected();
      window.dispatchEvent(
        new CustomEvent('depositRejected', { 
          detail: { 
            message: data.message,
            reason: data.reason,
          } 
        })
      );
    });

    // ---- Chat ----
    newSocket.on('chat:message', (data: any) => {
      setChatMessages((prev) => [...prev.slice(-49), data]);
    });
    
    // ---- Connection Events ----
    newSocket.on('connect', () => {
      console.log('[BET_DEBUG] Socket connected');
    });
    
    newSocket.on('disconnect', (reason) => {
      console.log('[BET_DEBUG] Socket disconnected:', reason);
    });
    
    newSocket.on('reconnect', (attemptNumber) => {
      console.log('[BET_DEBUG] Socket reconnected after', attemptNumber, 'attempts');
      // After reconnection, game state will be synced via round:state event
      // which is automatically sent by the server on authentication
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [token]);

  // Bet placement
  const placeBet = useCallback(
    async (slot: 1 | 2, amount: number, autoCashout?: number) => {
      if (!socket) return;
      
      console.log(`[BET_DEBUG] Button clicked - Slot: ${slot}, Amount: ${amount}, AutoCashout: ${autoCashout}`);
      console.log(`[BET_DEBUG] Client round ID: ${roundId}`);
      console.log(`[BET_DEBUG] Client game phase: ${phase}`);
      console.log(`[BET_DEBUG] Socket connected: ${socket.connected}`);

      // Fix 2: bounded ack — a lost ack (disconnect before response) used to
      // leave this promise pending forever and the button stuck on "Placing…".
      // The timeout only unsticks the UI; bet:sync (Fix 1) repairs real state.
      return emitWithTimeout<any>(
        (ack) =>
          socket.emit(
            'bet:place',
            // M7: amount crosses as a decimal string; the server parses it
            // strictly instead of trusting a JSON number.
            { amount: amount.toFixed(2), slot, autoCashout },
            ack,
          ),
        undefined,
        'bet:place',
      )
        .then((response) => {
          console.log(`[BET_DEBUG] Server response received:`, response);
          if (response.success) {
            console.log(`[BET_DEBUG] Bet accepted - ID: ${response.bet.id}, Status: ${response.bet.status}`);
            const setter = slot === 1 ? setBet1 : setBet2;
            // Map server status to frontend status
            let betStatus: BetStateStatus;
            if (response.bet.status === 'QUEUED') {
              betStatus = 'QUEUED';
            } else if (response.bet.status === 'PLACED') {
              betStatus = 'PLACED';
            } else if (response.bet.status === 'ACTIVE') {
              betStatus = 'ACTIVE';
            } else if (response.bet.status === 'PENDING') {
              betStatus = 'PENDING';
            } else {
              betStatus = 'PLACED'; // default fallback
            }

            setter((prev) => ({
              ...prev,
              id: response.bet.id,
              amount,
              autoCashout: autoCashout || null,
              status: betStatus,
            }));
            betPlacedRef.current[slot] = true;
            console.log(`[BET_DEBUG] UI state updated for slot ${slot}`);
            // Deduct the bet from local balance immediately (server already did)
            setBalance((prev) => +(prev - amount).toFixed(2));
            setAvailable((prev) => +(prev - amount).toFixed(2));
            AudioEvents.onBetAccepted();
          } else {
            console.log(`[BET_DEBUG] Bet rejected - Error: ${response.error}, Code: ${response.code}`);
            AudioEvents.onBetRejected(response.error);
            const error: any = new Error(response.error);
            error.code = response.code;
            throw error;
          }
        })
        .catch((err: any) => {
          if (err instanceof AckTimeoutError) {
            // Neutral, honest message — the real outcome arrives via bet:sync.
            throw new Error('Connection issue — your bet state will resync automatically.');
          }
          throw err;
        });
    },
    [socket, roundId, phase]
  );

  // Cashout
  const cashout = useCallback(
    async (slot: 1 | 2) => {
      if (!socket) return;

      const bet = slot === 1 ? bet1 : bet2;
      if (!bet.id) return;
      
      console.log(`[BET_DEBUG] Cashout clicked - Slot: ${slot}, Bet ID: ${bet.id}`);
      console.log(`[BET_DEBUG] Current multiplier: ${multiplierRef.current}`);

      // Fix 2: bounded ack — see placeBet.
      return emitWithTimeout<any>(
        (ack) => socket.emit('bet:cashout', { betId: bet.id }, ack),
        undefined,
        'bet:cashout',
      )
        .then((response) => {
          console.log(`[BET_DEBUG] Cashout response:`, response);
          if (response.success) {
            console.log(`[BET_DEBUG] Cashout successful - Multiplier: ${response.multiplier}x, Payout: ${response.payout}`);
            const setter = slot === 1 ? setBet1 : setBet2;
            setter((prev) => ({
              ...prev,
              status: 'CASHED_OUT',
              payout: response.payout,
              cashoutMultiplier: response.multiplier,
            }));
            // Play cashout sound AFTER server confirms (deduped by betId)
            AudioEvents.onBetCashedOut({ betId: String(bet.id), multiplier: response.multiplier });
          } else {
            console.log(`[BET_DEBUG] Cashout failed - Error: ${response.error}, Code: ${response.code}`);
            AudioEvents.onLocalCashoutError();
            const error: any = new Error(response.error);
            error.code = response.code;
            throw error;
          }
        })
        .catch((err: any) => {
          if (err instanceof AckTimeoutError) {
            // A cashout ack lost to a disconnect is the highest-stakes
            // ambiguous case — the message is honest that state will be
            // repaired by the authoritative sync, not guessed at here.
            throw new Error('Connection issue — if your cashout went through, your balance will resync automatically.');
          }
          throw err;
        });
    },
    [socket, bet1, bet2] // #8: multiplier read via ref — callback stays stable across ticks
  );

  // Cancel Bet
  const cancelBet = useCallback(
    async (slot: 1 | 2) => {
      if (!socket) return;

      const bet = slot === 1 ? bet1 : bet2;
      if (!bet.id) return;
      
      console.log(`[BET_DEBUG] Cancel clicked - Slot: ${slot}, Bet ID: ${bet.id}`);
      console.log(`[BET_DEBUG] Current phase: ${phase}`);

      // Fix 2: bounded ack — see placeBet.
      return emitWithTimeout<any>(
        (ack) => socket.emit('bet:cancel', { betId: bet.id }, ack),
        undefined,
        'bet:cancel',
      )
        .then((response) => {
          console.log(`[BET_DEBUG] Cancel response:`, response);
          if (response.success) {
            console.log(`[BET_DEBUG] Cancel successful - Balance: ${response.balance}`);
            const setter = slot === 1 ? setBet1 : setBet2;
            setter((prev) => ({
              ...prev,
              status: 'CANCELLED',
              id: null,
              payout: null,
              cashoutMultiplier: null,
            }));
            betPlacedRef.current[slot] = false;
            // Update balance from server response
            if (response.balance !== undefined) {
              setBalance(response.balance);
              setAvailable(response.balance);
            }
            AudioEvents.onBetCancelled();
          } else {
            console.log(`[BET_DEBUG] Cancel failed - Error: ${response.error}, Code: ${response.code}`);
            // Only reset to IDLE for specific error codes where bet is genuinely gone
            // For errors like ROUND_IN_PROGRESS, keep the bet state as-is
            const setter = slot === 1 ? setBet1 : setBet2;
            if (response.code === 'BET_NOT_FOUND' || response.code === 'INVALID_BET_STATE') {
              setter((prev) => ({
                ...prev,
                status: 'IDLE',
                id: null,
                payout: null,
                cashoutMultiplier: null,
              }));
              betPlacedRef.current[slot] = false;
            }
            // Otherwise keep current state and just show error
            AudioEvents.onLocalBetError();
            const error: any = new Error(response.error);
            error.code = response.code;
            throw error;
          }
        })
        .catch((err: any) => {
          if (err instanceof AckTimeoutError) {
            throw new Error('Connection issue — your bet state will resync automatically.');
          }
          throw err;
        });
    },
    [socket, bet1, bet2, phase]
  );

  const setBetAmount = useCallback((slot: 1 | 2, amount: number) => {
    betAmountsRef.current[slot] = amount;
    const setter = slot === 1 ? setBet1 : setBet2;
    setter((prev) => ({ ...prev, amount }));
  }, []);

  const setAutoCashout = useCallback((slot: 1 | 2, value: number | null) => {
    autoCashoutRef.current[slot] = value;
    const setter = slot === 1 ? setBet1 : setBet2;
    setter((prev) => ({ ...prev, autoCashout: value }));
  }, []);

  // Chat
  const sendMessage = useCallback(
    async (message: string) => {
      if (!socket) return;
      return new Promise<void>((resolve, reject) => {
        socket.emit('chat:send', { message }, (response: any) => {
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.error));
          }
        });
      });
    },
    [socket]
  );

  // #8: memoize the slow-moving context so tick-driven renders of the
  // provider don't re-render every consumer. multiplier deliberately lives
  // in TickContext below; callbacks read its live value via multiplierRef.
  const value = useMemo(
    () => ({
      connected,
      reconnectFailed,
      socket,
      roundId,
      roundNumber,
      phase,
      multiplier,
      countdown,
      startedAt,
      bet1,
      bet2,
      balance,
      reserved,
      available,
      history,
      fairnessCommit,
      publicBets,
      chatMessages,
      placeBet,
      cashout,
      cancelBet,
      setBetAmount,
      setAutoCashout,
      sendMessage,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connected, reconnectFailed, socket, roundId, roundNumber, phase, countdown, startedAt, bet1, bet2, balance, reserved, available, history, fairnessCommit, publicBets, chatMessages]
  );

  return (
    <GameContext.Provider value={value}>
      <TickContext.Provider value={multiplier}>
        {children}
      </TickContext.Provider>
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
}

/** #8: flight multiplier only — re-renders ~20x/s, so use it sparingly (canvas/cashout UI). */
export function useTickMultiplier() {
  return useContext(TickContext);
}

import { Server as SocketIOServer, Socket } from 'socket.io';
import { authService } from '../services/auth.service';
import { walletService } from '../services/wallet.service';
import { betManager, BetError } from '../game/BetManager';
import { chatService, ChatError } from '../services/chat.service';
import { GameEngine } from '../game/GameEngine';
import { GamePhase, BetStatus } from '../../shared/types';
import prisma from '../lib/prisma';
import { supabaseVerifyUser } from '../lib/supabase-auth';
import { sessionTracker } from '../analytics/session-tracker';
import { trackEvent } from '../analytics/event-pipeline';
import { realtimeBridge } from '../analytics/realtime-bridge';
import { riskEngine } from '../analytics/risk-engine';
import { betLimiters, RATE_LIMIT_CODE } from '../lib/bet-rate-limits';
import {
  MAX_GUEST_CONNECTIONS_PER_IP,
  guestIpOf,
  releaseGuest,
  tryAdmitGuest,
} from '../lib/guest-connection-tracker';
import { money } from '../services/money.helper';
import {
  betSyncService,
  setBetSyncEngine,
} from '../services/bet-sync.service';

interface SocketData {
  userId?: string;
  username?: string;
  role?: string;
}

export function setupSocketHandlers(
  io: SocketIOServer,
  gameEngine: GameEngine
): void {
  // Analytics fan-out bridge uses the same io instance.
  realtimeBridge.attach(io);

  // Fix 1 (connection audit): bet-sync needs the engine's current round id
  setBetSyncEngine(gameEngine);

  // ---- Connection Middleware ----
  // Authenticate user if token is provided in connection auth
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (token) {
        const supabaseUser = await supabaseVerifyUser(token);
        
        // A PROVIDED-but-invalid token is a hard reject (audit M4): it used to
        // degrade to guest access, letting any garbage/forged token watch the
        // game anonymously. Guest mode is only for connections that present
        // NO token at all.
        if (supabaseUser?.code === 401 || supabaseUser?.error) {
          console.log(`[Socket] Connection rejected - token invalid`);
          return next(new Error('auth: invalid or expired token'));
        }

        const supabaseId = supabaseUser?.id;
        if (!supabaseId) {
          return next(new Error('auth: invalid token payload'));
        }

        // Find user in database
        let user = await prisma.user.findUnique({
          where: { id: supabaseId },
          select: { id: true, name: true, role: true },
        });

        if (!user && supabaseUser.email) {
          user = await prisma.user.findUnique({
            where: { email: supabaseUser.email },
            select: { id: true, name: true, role: true },
          });
        }

        if (user) {
          socket.data = {
            userId: user.id,
            username: user.name,
            role: user.role,
          };

          // Admins join the admin room on auto-auth too
          if (user.role === 'ADMIN') {
            socket.join('admin');
          }

          console.log(`[Socket] Auto-authenticated user on connection: ${socket.data.userId}`);
        }
      }
      next();
    } catch (error: any) {
      // Middleware threw while verifying a provided token — reject (audit M4).
      console.log(`[Socket] Connection rejected - auth error:`, error.message);
      return next(new Error('auth: verification failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Initialize socket.data if not already done
    if (!socket.data) {
      socket.data = {};
    }

    // ---- Guest admission (audit M4) ----
    // Tokenless connections are guests; cap them per client IP. (Authenticated
    // sockets were admitted by the connection middleware above and skip this.)
    if (!socket.data.userId) {
      const ip = guestIpOf(socket);
      if (!tryAdmitGuest(ip)) {
        console.log(`[Socket] Guest connection rejected - IP over cap: ${ip}`);
        socket.emit('connection:rejected', {
          code: 'GUEST_IP_CAP',
          message: 'Too many guest connections from this network. Please sign in.',
          retryAfterSeconds: 60,
        });
        socket.disconnect(true);
        return;
      }
      socket.data.guestIp = ip;
      socket.on('disconnect', () => releaseGuest(ip));
    }

    // ---- Authentication ----
    socket.on('auth:authenticate', async (data: { token: string }, callback) => {
      try {
        console.log(`[Socket] Authenticating user with token...`);
        const supabaseUser = await supabaseVerifyUser(data.token);
        
        if (supabaseUser?.code === 401 || supabaseUser?.error) {
          callback({
            success: false,
            error: 'Invalid or expired token',
          });
          return;
        }

        const supabaseId = supabaseUser?.id;
        if (!supabaseId) {
          callback({
            success: false,
            error: 'Invalid token',
          });
          return;
        }

        console.log(`[Socket] Token verified for user: ${supabaseId}`);
        
        // Find user in database
        let user = await prisma.user.findUnique({
          where: { id: supabaseId },
          select: { id: true, name: true, role: true },
        });

        if (!user && supabaseUser.email) {
          user = await prisma.user.findUnique({
            where: { email: supabaseUser.email },
            select: { id: true, name: true, role: true },
          });
        }

        if (!user) {
          callback({
            success: false,
            error: 'User not found',
          });
          return;
        }

        // Join user-specific room
        socket.join(`user:${user.id}`);

        // ── SESSION TRACKING ──
        await sessionTracker.startSession(user.id, socket.id);
        trackEvent({
          eventType: 'USER_LOGIN',
          userId: user.id,
          sessionId: sessionTracker.getSessionId(socket.id),
        });

        // Ensure socket.data is initialized
        if (!socket.data) {
          socket.data = {};
        }

        const socketData = socket.data as SocketData;
        socketData.userId = user.id;
        socketData.username = user.name;
        socketData.role = user.role;

        // Admin room membership is handled ONCE by the connection middleware
        // (auto-auth path above; audit L3). This handler deliberately does not
        // re-join: sockets are recreated per token on the web client, so the
        // middleware join always covers the same socket, and the separate
        // admin-events socket (useSocketAdminEvents) never emits
        // auth:authenticate at all — removing the join here cannot strand it.

        console.log(`[Socket] User authenticated: ${socketData.userId}, Username: ${socketData.username}`);

        callback({
          success: true,
          user: {
            id: user.id,
            username: user.name,
            role: user.role,
          },
        });

        // Send current round state
        const currentRound = gameEngine.getRoundId();
        if (currentRound) {
          // Get round state from database
          const round = await prisma.gameRound.findUnique({
            where: { id: currentRound },
          });
          if (round) {
            socket.emit('round:state', {
              roundId: round.id,
              roundNumber: round.roundNumber,
              phase: round.phase,
              crashPoint: null, // Never send crash point
              maxMultiplier: Number(round.maxMultiplier),
              startedAt: round.startedAt?.toISOString() || null,
              bettingEndsAt: round.bettingEndsAt?.toISOString() || null,
              countdown: null,
            });
          }
        }

        // Send recent chat messages
        const recentMessages = await chatService.getRecentMessages(20);
        recentMessages.forEach((msg) => {
          socket.emit('chat:message', msg);
        });

        // Fix 1 (connection audit): authoritative bet/wallet sync. Sent on
        // EVERY auth (fresh connect and reconnect) — a client that missed a
        // broadcast (ack lost, disconnect during settlement) resyncs its own
        // bet rows and balance from the DB instead of trusting stale local
        // state. C1 guarantees the DB row is the truth; this makes the
        // client reflect it. Emitted AFTER round:state because a BETTING
        // round:state resets client bet slots — sync must win that race.
        try {
          const sync = await betSyncService.getSyncPayload(user.id);
          socket.emit('bet:sync', sync);
        } catch (syncErr) {
          // Sync is a resync-correctness feature, never an auth gate.
          console.error('[Socket] bet:sync failed:', syncErr);
        }
      } catch (error: any) {
        console.error(`[Socket] Auth error:`, error);
        callback({
          success: false,
          error: 'Authentication failed',
        });
      }
    });
    
    // Send game state to all connections (guest or authenticated)
    const sendGameState = async () => {
      const currentRound = gameEngine.getRoundId();
      if (currentRound) {
        const round = await prisma.gameRound.findUnique({
          where: { id: currentRound },
        });
        if (round) {
          socket.emit('round:state', {
            roundId: round.id,
            roundNumber: round.roundNumber,
            phase: round.phase,
            crashPoint: null,
            maxMultiplier: Number(round.maxMultiplier),
            startedAt: round.startedAt?.toISOString() || null,
            bettingEndsAt: round.bettingEndsAt?.toISOString() || null,
            countdown: null,
          });
        }
      }
    };
    
    // Send initial game state to guests too
    sendGameState();

    // ---- Bet Placement ----
    socket.on('bet:place', async (data, callback) => {
      const socketData = socket.data as SocketData;
      console.log(`[Socket] bet:place received - SocketData:`, socketData);
      
      if (!socketData || !socketData.userId) {
        console.log(`[Socket] Bet rejected - Not authenticated. socketData:`, socketData);
        callback({ success: false, error: 'Not authenticated', code: 'NOT_AUTH' });
        return;
      }

      // H3: per-user rate limit (5 bets / 2 s — see lib/bet-rate-limits.ts).
      // Excess requests are rejected with a clear code, never silently
      // dropped, and reported to the risk engine so burst patterns are
      // observable, not just blocked.
      if (!betLimiters.place.tryConsume(socketData.userId)) {
        const retryAfter = betLimiters.place.retryAfterSeconds(socketData.userId);
        void riskEngine.recordUserAction(socketData.userId, 'RATE_LIMITED_BET_PLACE');
        callback({ success: false, error: `Too many bet requests, retry in ${retryAfter}s`, code: RATE_LIMIT_CODE, retryAfter });
        return;
      }

      console.log(`[Socket] Placing bet for user: ${socketData.userId}, Amount: ${data.amount}, Slot: ${data.slot}`);

      try {
        const roundId = gameEngine.getRoundId();
        console.log(`[Socket] Current round ID: ${roundId}`);
        
        if (!roundId) {
          console.log(`[Socket] Bet rejected - No active round`);
          callback({ success: false, error: 'No active round', code: 'NO_ROUND' });
          return;
        }

        // M7: the bet amount crosses the socket boundary as a string and is
        // parsed strictly into a Decimal here — JSON numbers can be binary-
        // float imprecise before validation ever runs.
        const amountDecimal = money.fromAmountString(data.amount);
        if (!amountDecimal) {
          callback({
            success: false,
            error: 'Amount must be a decimal string with at most 2 decimals',
            code: 'INVALID_AMOUNT',
          });
          return;
        }

        const result = await betManager.placeBet(
          socketData.userId,
          roundId,
          amountDecimal,
          data.slot as 1 | 2,
          data.autoCashout
        );

        console.log(`[Socket] Bet placed successfully:`, result);

        // Get updated wallet balance
        const wallet = await walletService.getBalance(socketData.userId);

        callback({
          success: true,
          bet: {
            id: result.betId,
            slot: result.slot,
            amount: result.amount,
            status: result.status,
          },
        });

        // Notify user of wallet update
        socket.emit('wallet:updated', {
          balance: wallet.balance,
          transaction: null,
        });

        // Broadcast bet placement
        io.emit('bet:placed', {
          betId: result.betId,
          userId: socketData.userId,
          username: socketData.username || 'Unknown',
          amount: result.amount,
          slot: result.slot,
        });
      } catch (error: any) {
        console.log(`[Socket] Bet error:`, error);
        if (error instanceof BetError) {
          callback({
            success: false,
            error: error.message,
            code: error.code,
          });
        } else {
          callback({
            success: false,
            error: 'Failed to place bet',
            code: 'UNKNOWN_ERROR',
          });
        }
      }
    });

    // ---- Cancel Bet ----
    socket.on('bet:cancel', async (data: { betId: string }, callback) => {
      const socketData = socket.data as SocketData;
      if (!socketData.userId) {
        callback({ success: false, error: 'Not authenticated', code: 'NOT_AUTH' });
        return;
      }

      // H3: per-user rate limit (5 cancels / 2 s) — separate budget from
      // places by design (rapid place/cancel/re-place is legitimate play).
      if (!betLimiters.cancel.tryConsume(socketData.userId)) {
        const retryAfter = betLimiters.cancel.retryAfterSeconds(socketData.userId);
        void riskEngine.recordUserAction(socketData.userId, 'RATE_LIMITED_BET_CANCEL');
        callback({ success: false, error: `Too many cancel requests, retry in ${retryAfter}s`, code: RATE_LIMIT_CODE, retryAfter });
        return;
      }

      try {
        const result = await betManager.cancelBet(socketData.userId, data.betId);

        callback({ success: true, balance: result.balance });

        // Notify user of wallet update
        socket.emit('wallet:updated', {
          balance: result.balance,
          transaction: null,
        });

        // Broadcast cancel
        io.emit('bet:cancelled', {
          betId: data.betId,
          userId: socketData.userId,
          username: socketData.username || 'Unknown',
        });
      } catch (error: any) {
        if (error instanceof BetError) {
          callback({
            success: false,
            error: error.message,
            code: error.code,
          });
        } else {
          callback({
            success: false,
            error: 'Failed to cancel bet',
            code: 'UNKNOWN_ERROR',
          });
        }
      }
    });

    // ---- Cashout ----
    socket.on('bet:cashout', async (data, callback) => {
      const socketData = socket.data as SocketData;
      if (!socketData.userId) {
        callback({ success: false, error: 'Not authenticated', code: 'NOT_AUTH' });
        return;
      }

      // H3: per-user rate limit (10 cashouts / 2 s) — generous on purpose:
      // legitimate auto-cashouts plus manual clicks must never be throttled.
      if (!betLimiters.cashout.tryConsume(socketData.userId)) {
        const retryAfter = betLimiters.cashout.retryAfterSeconds(socketData.userId);
        void riskEngine.recordUserAction(socketData.userId, 'RATE_LIMITED_CASHOUT');
        callback({ success: false, error: `Too many cashout requests, retry in ${retryAfter}s`, code: RATE_LIMIT_CODE, retryAfter });
        return;
      }

      try {
        // Get server-authoritative multiplier
        const currentMultiplier = gameEngine.getCurrentMultiplier();
        const roundId = gameEngine.getRoundId();

        if (!roundId) {
          callback({ success: false, error: 'No active round', code: 'NO_ROUND' });
          return;
        }

        const result = await betManager.processCashout(
          socketData.userId,
          data.betId,
          currentMultiplier
        );

        callback({
          success: true,
          multiplier: result.multiplier,
          payout: result.payout,
        });

        // Notify user of wallet update
        socket.emit('wallet:updated', {
          balance: result.balance,
          transaction: null,
        });

        // Broadcast cashout
        io.emit('bet:cashed_out', {
          betId: data.betId,
          userId: socketData.userId,
          username: socketData.username || 'Unknown',
          roundId,
          multiplier: result.multiplier,
          payout: result.payout,
        });
      } catch (error: any) {
        if (error instanceof BetError) {
          callback({
            success: false,
            error: error.message,
            code: error.code,
          });
        } else {
          callback({
            success: false,
            error: 'Failed to cash out',
            code: 'UNKNOWN_ERROR',
          });
        }
      }
    });

    // ---- Chat ----
    socket.on('chat:send', async (data, callback) => {
      const socketData = socket.data as SocketData;
      if (!socketData.userId) {
        callback({ success: false, error: 'Not authenticated' });
        return;
      }

      try {
        const message = await chatService.sendMessage(socketData.userId, data.message);
        callback({ success: true, message });

        // Broadcast to all clients
        io.emit('chat:message', message);
      } catch (error: any) {
        if (error instanceof ChatError) {
          callback({ success: false, error: error.message });
          if (error.retryAfter) {
            socket.emit('chat:rate_limited', { retryAfter: error.retryAfter });
          }
        } else {
          callback({ success: false, error: 'Failed to send message' });
        }
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const socketData = socket.data as SocketData;
      console.log(`[Socket] Client disconnected: ${socket.id} (user: ${socketData.userId || 'unknown'})`);

      // ── SESSION TRACKING ──
      if (socketData.userId) {
        void sessionTracker.endSession(socket.id, 'DISCONNECT');
        trackEvent({
          eventType: 'USER_LOGOUT',
          userId: socketData.userId,
          sessionId: sessionTracker.getSessionId(socket.id),
          metadata: { reason: 'DISCONNECT' },
        });
      }
    });
  });
}

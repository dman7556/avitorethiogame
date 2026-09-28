// ==========================================
// Aviator Shared Types
// ==========================================

// ---- Enums ----

export enum GamePhase {
  WAITING = 'WAITING',
  BETTING = 'BETTING',
  FLYING = 'FLYING',
  CRASHED = 'CRASHED',
  SETTLED = 'SETTLED',
}

export enum BetStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PLACED = 'PLACED',
  ACTIVE = 'ACTIVE',
  CASHED_OUT = 'CASHED_OUT',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export enum BetSlot {
  FIRST = 1,
  SECOND = 2,
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  BET = 'BET',
  WIN = 'WIN',
  REFUND = 'REFUND',
  ADMIN_CREDIT = 'ADMIN_CREDIT',
  ADMIN_DEBIT = 'ADMIN_DEBIT',
  INITIAL_BALANCE = 'INITIAL_BALANCE',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum DepositStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  /** Flagged by the risk engine (HIGH/CRITICAL) — held for admin review. Funds stay reserved. */
  HELD = 'HELD',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export enum PaymentMethod {
  TELEBIRR = 'TELEBIRR',
  CBE = 'CBE',
}

export enum AuditAction {
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  USER_SUSPENDED = 'USER_SUSPENDED',
  USER_REACTIVATED = 'USER_REACTIVATED',
  DEPOSIT_APPROVED = 'DEPOSIT_APPROVED',
  DEPOSIT_REJECTED = 'DEPOSIT_REJECTED',
  DEPOSIT_OVERRIDE_REQUESTED = 'DEPOSIT_OVERRIDE_REQUESTED',
  DEPOSIT_OVERRIDE_APPROVED = 'DEPOSIT_OVERRIDE_APPROVED',
  DEPOSIT_OVERRIDE_REJECTED = 'DEPOSIT_OVERRIDE_REJECTED',
  WITHDRAWAL_HELD = 'WITHDRAWAL_HELD',
  WITHDRAWAL_RELEASED_FROM_HOLD = 'WITHDRAWAL_RELEASED_FROM_HOLD',
  WITHDRAWAL_APPROVED = 'WITHDRAWAL_APPROVED',
  WITHDRAWAL_REJECTED = 'WITHDRAWAL_REJECTED',
  BALANCE_CREDITED = 'BALANCE_CREDITED',
  BALANCE_DEBITED = 'BALANCE_DEBITED',
  USER_ROLE_CHANGED = 'USER_ROLE_CHANGED',
  SETTINGS_CHANGED = 'SETTINGS_CHANGED',
}

export enum NotificationType {
  DEPOSIT_SUBMITTED = 'DEPOSIT_SUBMITTED',
  DEPOSIT_APPROVED = 'DEPOSIT_APPROVED',
  DEPOSIT_REJECTED = 'DEPOSIT_REJECTED',
  WITHDRAWAL_SUBMITTED = 'WITHDRAWAL_SUBMITTED',
  WITHDRAWAL_APPROVED = 'WITHDRAWAL_APPROVED',
  WITHDRAWAL_REJECTED = 'WITHDRAWAL_REJECTED',
  ADMIN_CREDIT = 'ADMIN_CREDIT',
  ADMIN_DEBIT = 'ADMIN_DEBIT',
}

// ---- User ----

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  phone: string | null; // null = profile incomplete (audit M5)
  username?: string;
  email: string;
  role: string;
  balance: number;
  createdAt: string;
}

export interface UserStatistics {
  totalDeposits: number;
  totalWithdrawals: number;
  totalBets: number;
  totalWinnings: number;
  totalLosses: number;
  netProfit: number;
}

// ---- Wallet ----

export interface Wallet {
  id: string;
  userId: string;
  balance: number;
  reserved: number;
  currency: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  status: TransactionStatus;
  description: string;
  referenceId?: string;
  processedBy?: string;
  createdAt: string;
}

// ---- Deposit ----

export interface Deposit {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  screenshotUrl?: string;
  status: DepositStatus;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepositWithUser extends Deposit {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

// ---- Withdrawal ----

export interface Withdrawal {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  destination: string;
  status: WithdrawalStatus;
  rejectionReason?: string;
  processedBy?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalWithUser extends Withdrawal {
  user: {
    id: string;
    name: string;
    email: string;
    wallet: {
      balance: number;
      reserved: number;
    };
  };
}

// ---- Admin Audit Log ----

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: AuditAction;
  targetUserId?: string;
  targetId?: string;
  metadata?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

export interface AdminAuditLogWithDetails extends AdminAuditLog {
  admin: {
    id: string;
    name: string;
    email: string;
  };
  targetUser?: {
    id: string;
    name: string;
    email: string;
  };
}

// ---- Notification ----

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  metadata?: string;
  createdAt: string;
}

// ---- System Settings ----

export interface SystemSettings {
  minimumDeposit: number;
  maximumDeposit: number;
  minimumRemainingBalance: number;
  paymentMethods: {
    [key in PaymentMethod]: {
      enabled: boolean;
      displayName: string;
      instructions: string;
      accountInfo?: string;
    };
  };
}

// ---- Game Round ----

export interface GameRound {
  id: string;
  roundNumber: number;
  phase: GamePhase;
  crashPoint: number | null;
  maxMultiplier: number;
  startedAt: string | null;
  bettingEndsAt: string | null;
  crashedAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface RoundHistoryItem {
  id: string;
  roundNumber: number;
  crashPoint: number;
}

// ---- Bet ----

export interface Bet {
  id: string;
  userId: string;
  roundId: string;
  slot: BetSlot;
  amount: number;
  status: BetStatus;
  cashoutMultiplier: number | null;
  payout: number | null;
  autoCashout: number | null;
  placedAt: string | null;
  cashedOutAt: string | null;
  createdAt: string;
}

export interface PublicBet {
  betId: string;
  username: string;
  amount: number;
  multiplier: number | null;
  payout: number | null;
  status: BetStatus;
  slot: BetSlot;
}

// ---- Socket Events ----

// Server -> Client
export interface ServerToClientEvents {
  // Round events
  'round:state': (data: RoundStateEvent) => void;
  'round:tick': (data: RoundTickEvent) => void;
  'round:crashed': (data: RoundCrashedEvent) => void;
  'round:settled': (data: RoundSettledEvent) => void;
  'round:history': (data: RoundHistoryEvent) => void;
  'round:countdown': (data: CountdownEvent) => void;

  // Bet events
  'bet:placed': (data: BetPlacedEvent) => void;
  'bet:accepted': (data: BetAcceptedEvent) => void;
  'bet:rejected': (data: BetRejectedEvent) => void;
  'bet:cashed_out': (data: BetCashedOutEvent) => void;
  'bet:cancelled': (data: BetCancelledEvent) => void;
  'bet:update': (data: BetUpdateEvent) => void;

  // Wallet events
  'wallet:updated': (data: WalletUpdatedEvent) => void;

  // Public bets
  'public_bets:update': (data: PublicBetsUpdateEvent) => void;

  // Chat events
  'chat:message': (data: ChatMessageEvent) => void;
  'chat:rate_limited': (data: { retryAfter: number }) => void;

  // System
  'error': (data: ErrorEvent) => void;
}

// Client -> Server
export interface ClientToServerEvents {
  // Auth
  'auth:authenticate': (data: { token: string }, callback: (response: AuthResponse) => void) => void;

  // Bet events
  'bet:place': (data: PlaceBetRequest, callback: (response: BetResponse) => void) => void;
  'bet:cashout': (data: CashoutRequest, callback: (response: CashoutResponse) => void) => void;
  'bet:cancel': (data: { betId: string }, callback: (response: { success: boolean; balance?: number; error?: string; code?: string }) => void) => void;

  // Chat
  'chat:send': (data: { message: string }, callback: (response: ChatSendResponse) => void) => void;
}

// ---- Event Data Types ----

export interface RoundStateEvent {
  roundId: string;
  roundNumber: number;
  phase: GamePhase;
  crashPoint: number | null;
  maxMultiplier: number;
  startedAt: string | null;
  bettingEndsAt: string | null;
  countdown: number | null;
}

export interface RoundTickEvent {
  roundId: string;
  multiplier: number;
  elapsed: number;
  curveData: CurvePoint[];
}

export interface CurvePoint {
  x: number;
  y: number;
}

export interface RoundCrashedEvent {
  roundId: string;
  crashPoint: number;
  crashedAt: string;
}

export interface RoundSettledEvent {
  roundId: string;
  totalBets: number;
  totalPayouts: number;
}

export interface RoundHistoryEvent {
  history: RoundHistoryItem[];
}

export interface CountdownEvent {
  roundId: string;
  phase: GamePhase;
  countdown: number;
}

export interface BetPlacedEvent {
  betId: string;
  userId: string;
  username: string;
  amount: number;
  slot: number;
}

export interface BetAcceptedEvent {
  betId: string;
  roundId: string;
  slot: number;
  amount: number;
  status: BetStatus;
}

export interface BetRejectedEvent {
  reason: string;
  code: string;
}

export interface BetCashedOutEvent {
  betId: string;
  userId: string;
  username: string;
  roundId: string;
  multiplier: number;
  payout: number;
}

export interface BetCancelledEvent {
  betId: string;
  userId: string;
  username: string;
}

export interface BetUpdateEvent {
  betId: string;
  status: BetStatus;
  cashoutMultiplier: number | null;
  payout: number | null;
}

export interface WalletUpdatedEvent {
  balance: number;
  transaction: WalletTransaction;
}

export interface PublicBetsUpdateEvent {
  roundId: string;
  bets: PublicBet[];
}

export interface ChatMessageEvent {
  id: string;
  username: string;
  message: string;
  timestamp: string;
}

export interface ErrorEvent {
  code: string;
  message: string;
}

// ---- Request/Response Types ----

export interface PlaceBetRequest {
  amount: number;
  slot: 1 | 2;
  autoCashout?: number;
}

export interface CashoutRequest {
  betId: string;
}

export interface AuthResponse {
  success: boolean;
  user?: UserProfile;
  token?: string;
  error?: string;
}

export interface BetResponse {
  success: boolean;
  bet?: {
    id: string;
    slot: number;
    amount: number;
    status: BetStatus;
  };
  error?: string;
  code?: string;
}

export interface CashoutResponse {
  success: boolean;
  multiplier?: number;
  payout?: number;
  error?: string;
  code?: string;
}

export interface ChatSendResponse {
  success: boolean;
  message?: ChatMessageEvent;
  error?: string;
}

// ---- API Types ----

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthTokenPayload {
  userId: string;
  name: string;
  username?: string;
  role: 'USER' | 'ADMIN';
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// ---- Admin API Types ----

export interface AdminDashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingDeposits: number;
  pendingWithdrawals: number;
  totalDeposited: number;
  totalWithdrawn: number;
  totalBetVolume: number;
  totalPayouts: number;
  platformBalance: number;
}

export interface ApproveDepositRequest {
  creditAmount: number;
}

export interface RejectDepositRequest {
  reason: string;
}

export interface ApproveWithdrawalRequest {
  // No additional fields needed, amount already set
}

export interface RejectWithdrawalRequest {
  reason: string;
}

export interface AdminCreditRequest {
  amount: number;
  reason: string;
}

export interface AdminDebitRequest {
  amount: number;
  reason: string;
}

export interface CreateDepositRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  screenshot: File;
}

export interface CreateWithdrawalRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  destination: string;
}

// ---- Constants ----

export const GAME_CONSTANTS = {
  MIN_BET: 1,
  MAX_BET: 10000,
  MAX_MULTIPLIER: 10000,
  QUICK_BET_AMOUNTS: [1, 2, 5, 10] as const,
  BETTING_DURATION_MS: 10000,
  // Post-crash pause before the next round's betting phase opens. Set to the
  // same 1s the client holds the "FLEW AWAY!" display, so the countdown
  // starts the moment the crash text clears — no dead air.
  ROUND_INTERVAL_MS: 1000,
  TICK_INTERVAL_MS: 50,
  MIN_MULTIPLIER: 1.0,
  HOUSE_EDGE: 0.03, // 3% house edge
  // Financial constants
  MINIMUM_DEPOSIT: 200, // 200 ETB
  DEFAULT_MAXIMUM_DEPOSIT: 50000, // 50,000 ETB default
  MINIMUM_REMAINING_BALANCE: 200, // 200 ETB must remain after withdrawal
  MINIMUM_WITHDRAWAL: 100, // 100 ETB minimum withdrawal

  // H4 — withdrawal abuse guardrails (confirmed by product owner, 2026-09-15)
  MAX_CONCURRENT_PENDING_WITHDRAWALS: 3, // 4th PENDING request is rejected
  WITHDRAWAL_COOLDOWN_MS: 15 * 60_000, // 15 min between submissions (any outcome)
} as const;

export const SOCKET_EVENTS = {
  // Server -> Client
  ROUND_STATE: 'round:state',
  ROUND_TICK: 'round:tick',
  ROUND_CRASHED: 'round:crashed',
  ROUND_SETTLED: 'round:settled',
  ROUND_HISTORY: 'round:history',
  ROUND_COUNTDOWN: 'round:countdown',
  BET_PLACED: 'bet:placed',
  BET_ACCEPTED: 'bet:accepted',
  BET_REJECTED: 'bet:rejected',
  BET_CASHED_OUT: 'bet:cashed_out',
  BET_UPDATE: 'bet:update',
  WALLET_UPDATED: 'wallet:updated',
  PUBLIC_BETS_UPDATE: 'public_bets:update',
  CHAT_MESSAGE: 'chat:message',
  ERROR: 'error',

  // Client -> Server
  AUTHENTICATE: 'auth:authenticate',
  BET_PLACE: 'bet:place',
  BET_CASHOUT: 'bet:cashout',
  CHAT_SEND: 'chat:send',
} as const;

// ---- Ack timeout helper (Fix 2, connection-interruption audit) ----
//
// Money-movement socket calls (bet:place / bet:cashout / bet:cancel) are
// raw emit-with-callback. If the ack is lost to a disconnect, the promise
// never settles and the button stays stuck ("Placing…" forever). This
// helper wraps any ack-style emit so the promise ALWAYS settles: a normal
// ack resolves/rejects as before; after the timeout it rejects with a
// neutral "connection issue — your bet state will resync" error.
//
// The job of the timeout is ONLY to unstick the UI — it never guesses the
// real outcome. Fix 1's authoritative bet:sync corrects the actual state
// once the socket reconnects.

/** Default ack window for money-movement calls. Long enough for slow
 * mobile networks, short enough that a stuck button is obviously broken. */
export const ACK_TIMEOUT_MS = 8_000;

/** Thrown by emitWithTimeout when the server ack does not arrive in time.
 * `code: 'ACK_TIMEOUT'` lets callers distinguish it from server rejections. */
export class AckTimeoutError extends Error {
  code = 'ACK_TIMEOUT';
  constructor(event: string, timeoutMs: number) {
    super(`Connection issue — your bet state will resync (no response to "${event}" within ${timeoutMs}ms)`);
    this.name = 'AckTimeoutError';
  }
}

/**
 * Wraps an ack-style socket emit so the returned promise always settles.
 *
 * @param emitFn Invokes the actual emit; receives its own callback that
 *   must be passed to socket.emit as the ack callback.
 * @param timeoutMs Window to wait for the ack (default 8s).
 * @param event Event name, only used for error text.
 *
 * Guarantees:
 * - The first settlement (ack OR timeout) wins; the loser is ignored.
 * - A late ack after the timeout is DROPPED — it can never cause a second,
 *   conflicting state update (the `settled` guard makes the callback a
 *   no-op once the timeout has fired).
 */
export function emitWithTimeout<T = any>(
  emitFn: (ack: (response: T) => void) => void,
  timeoutMs: number = ACK_TIMEOUT_MS,
  event = 'request',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const settle = (fn: typeof resolve | typeof reject, value: T | Error) => {
      if (settled) return; // first settlement wins — late acks are dropped
      settled = true;
      clearTimeout(timer);
      fn(value as never);
    };

    const timer = setTimeout(() => {
      settle(reject, new AckTimeoutError(event, timeoutMs));
    }, timeoutMs);

    emitFn((response: T) => {
      settle(resolve, response);
    });
  });
}
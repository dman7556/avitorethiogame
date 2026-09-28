// ==========================================
// Aviator Shared Types - Server Copy
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

// ---- Constants ----

export const GAME_CONSTANTS = {
  MIN_BET: 1,
  MAX_BET: 10000,
  MAX_MULTIPLIER: 10000,
  QUICK_BET_AMOUNTS: [1, 2, 5, 10] as const,
  BETTING_DURATION_MS: 10000,
  ROUND_INTERVAL_MS: 1000,
  TICK_INTERVAL_MS: 50,
  MIN_MULTIPLIER: 1.0,
  HOUSE_EDGE: 0.03,
  MINIMUM_DEPOSIT: 200,
  DEFAULT_MAXIMUM_DEPOSIT: 50000,
  MINIMUM_REMAINING_BALANCE: 200,
  MINIMUM_WITHDRAWAL: 100,
  MAX_CONCURRENT_PENDING_WITHDRAWALS: 3,
  WITHDRAWAL_COOLDOWN_MS: 15 * 60_000,
} as const;

// ---- Basic Interfaces ----

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
  phone: string | null;
  username?: string;
  email: string;
  role: string;
  balance: number;
  createdAt: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

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

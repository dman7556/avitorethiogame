-- Fix 6 (perf audit): composite indexes for user-scoped, newest-first listings.
-- bet.routes.ts (user's bets), deposit.service getUserDeposits and the
-- withdrawal equivalent all run `where userId = ? order by createdAt desc`.
-- The single-column userId/createdAt indexes force a post-lookup sort of the
-- user's whole history; the composite lets the engine seek straight into the
-- user's range in the requested order.

CREATE INDEX "Bet_userId_createdAt_idx" ON "Bet"("userId", "createdAt");

CREATE INDEX "Deposit_userId_createdAt_idx" ON "Deposit"("userId", "createdAt");

CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "Withdrawal"("userId", "createdAt");

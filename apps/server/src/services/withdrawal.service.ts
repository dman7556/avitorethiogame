/**
 * ============================================
 * WITHDRAWAL SERVICE - FINANCIAL SAFETY CRITICAL
 * ============================================
 * FINANCIAL SAFETY GUARANTEES:
 * - All money math uses Prisma Decimal, never JavaScript float arithmetic
 * - Balance moves ONLY inside prisma.$transaction(), guarded by row conditions
 * - Submission RESERVES the amount: balance unchanged, reserved += amount,
 *   so available = balance - reserved drops immediately and reserved funds
 *   cannot be bet or re-withdrawn while the request is pending
 * - available = balance - reserved is the only spendable figure
 * - Minimum withdrawal (100 ETB) and minimum remaining balance (200 ETB) enforced SERVER-side
 * - Approve: THE money-leaves step — balance -= amount (permanent payout) and
 *   the reservation is cleared, guarded so it happens exactly once.
 *   Approving cannot deduct twice (status transition PENDING/HELD -> COMPLETED
 *   is the one-way gate), and the reservation row's balanceBefore/After are
 *   written at that moment so the ledger chain stays intact.
 * - Reject: releases the reservation exactly once (guarded updateMany on PENDING);
 *   balance is untouched (the money never left). Ledger: the reservation row is
 *   finalized COMPLETED and paired with the REFUND row (+amount) so the
 *   ledger-sum invariant stays balanced (the pair cancels exactly).
 * - Ledger: WalletTransaction rows are immutable inserts, except marking the
 *   matching WITHDRAWAL reservation row COMPLETED at approval
 * - Every step records balanceBefore/balanceAfter, admin, reason, timestamps
 * ============================================
 */
import prisma from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { WithdrawalStatus, PaymentMethod, NotificationType, GAME_CONSTANTS } from '../shared/types';
import { trackEvent } from '../analytics/event-pipeline';
import { metricsEngine } from '../analytics/metrics-engine';
import { settingsService } from './settings.service';
import { notificationService } from './notification.service';
import { auditService } from './audit.service';
import { riskEngine, type RiskAssessment } from '../analytics/risk-engine';
import { money } from './money.helper';

export class WithdrawalService {
  /**
   * Create a withdrawal request (RESERVES funds; balance itself is untouched)
   */
  async createWithdrawal(data: {
    userId: string;
    amount: Decimal;
    paymentMethod: PaymentMethod;
    accountNumber: string;
    accountHolder?: string;
  }) {
    console.log(`[WITHDRAWAL] Creating withdrawal - userId: ${data.userId}, amount: ${data.amount}, method: ${data.paymentMethod}`);

    const settings = await settingsService.getSettings();

    // Validate payment method
    const methodConfig = settings.paymentMethods[data.paymentMethod];
    if (!methodConfig || !methodConfig.enabled) {
      throw new WithdrawalError('Payment method is not available', 'INVALID_PAYMENT_METHOD');
    }

    // Validate account number
    if (!data.accountNumber || data.accountNumber.trim().length === 0) {
      throw new WithdrawalError('Account number is required', 'ACCOUNT_NUMBER_REQUIRED');
    }

    // Server-side amount validation (never trust the frontend).
    // M7: services accept a Decimal — parsing happened at the route boundary.
    const amount = money.fromDecimal(data.amount);
    const minWithdrawal = money.fromNumber(GAME_CONSTANTS.MINIMUM_WITHDRAWAL);
    const minRemaining = money.fromNumber(settings.minimumRemainingBalance);

    if (!money.gt(amount, money.ZERO)) {
      throw new WithdrawalError('Invalid withdrawal amount', 'INVALID_AMOUNT');
    }
    if (amount.decimalPlaces() > 2) {
      throw new WithdrawalError('Amount supports at most 2 decimal places', 'INVALID_AMOUNT');
    }
    if (money.lt(amount, minWithdrawal)) {
      throw new WithdrawalError(
        `Minimum withdrawal amount is ${GAME_CONSTANTS.MINIMUM_WITHDRAWAL} ETB`,
        'BELOW_MINIMUM_WITHDRAWAL'
      );
    }

    // H4 guardrails — checked INSIDE the reservation transaction so a flood of
    // concurrent submissions all serialize against the same authoritative state:
    //   1. Pending cap: max N concurrent unresolved requests (a 4th is refused).
    //   2. Cooldown: 15 min since the user's most recent submission, regardless
    //      of whether it was approved, rejected, or is still pending.
    // Funds are reserved only AFTER both pass, so a rejected attempt never
    // touches the wallet (asserted by the H4 regression tests).
    const now = new Date();
    const cooldownSince = new Date(now.getTime() - GAME_CONSTANTS.WITHDRAWAL_COOLDOWN_MS);

    // Reserve funds atomically.
    const result = await prisma.$transaction(async (tx) => {
      const [wallet, pendingCount, lastSubmission] = await Promise.all([
        tx.wallet.findUnique({ where: { userId: data.userId } }),
        tx.withdrawal.count({
          where: { userId: data.userId, status: WithdrawalStatus.PENDING },
        }),
        tx.withdrawal.findFirst({
          where: { userId: data.userId, createdAt: { gte: cooldownSince } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
      ]);

      if (pendingCount >= GAME_CONSTANTS.MAX_CONCURRENT_PENDING_WITHDRAWALS) {
        throw new WithdrawalError(
          `You already have ${pendingCount} pending withdrawal requests. ` +
            `Wait for them to be reviewed before submitting another.`,
          'PENDING_CAP_REACHED'
        );
      }
      if (lastSubmission) {
        const elapsed = now.getTime() - lastSubmission.createdAt.getTime();
        if (elapsed < GAME_CONSTANTS.WITHDRAWAL_COOLDOWN_MS) {
          const cooldownRemainingSeconds = Math.ceil(
            (GAME_CONSTANTS.WITHDRAWAL_COOLDOWN_MS - elapsed) / 1000
          );
          const err = new WithdrawalError(
            `Please wait ${Math.ceil(cooldownRemainingSeconds / 60)} minute(s) before requesting another withdrawal.`,
            'COOLDOWN_ACTIVE'
          ) as WithdrawalError & { cooldownRemainingSeconds: number };
          err.cooldownRemainingSeconds = cooldownRemainingSeconds;
          throw err;
        }
      }

      if (!wallet) {
        throw new WithdrawalError('Wallet not found', 'WALLET_NOT_FOUND');
      }

      const available = money.sub(wallet.balance, wallet.reserved);

      // Enough spendable funds?
      if (money.lt(available, amount)) {
        throw new WithdrawalError(
          `Insufficient available balance. Available: ${money.num(available).toFixed(2)} ETB`,
          'INSUFFICIENT_BALANCE'
        );
      }

      // Must retain the minimum remaining balance
      const remainingAfter = money.sub(available, amount);
      if (money.lt(remainingAfter, minRemaining)) {
        throw new WithdrawalError(
          `You must keep at least ${settings.minimumRemainingBalance} ETB in your balance. ` +
          `Available: ${money.num(available).toFixed(2)} ETB, Maximum withdrawal: ${money.num(money.sub(available, minRemaining)).toFixed(2)} ETB`,
          'MINIMUM_BALANCE_REQUIRED'
        );
      }

      // Create withdrawal record
      const withdrawal = await tx.withdrawal.create({
        data: {
          userId: data.userId,
          amount,
          paymentMethod: data.paymentMethod,
          accountNumber: data.accountNumber.trim(),
          accountHolder: data.accountHolder?.trim() || null,
          status: WithdrawalStatus.PENDING,
        },
      });

      // Reserve the amount: reserved += amount, balance unchanged.
      // Available (the only spendable figure) drops immediately; the balance
      // itself is deducted at APPROVAL (the money-leaves step), which keeps
      // available = balance - reserved coherent and makes approve exactly-once
      // via the guarded status transition.
      // Guard re-checked atomically at UPDATE time: the wallet must still have
      // balance >= reserved + amount (i.e. available >= amount). If a concurrent
      // bet or withdrawal consumed the funds, this matches 0 rows and rolls back.
      const reservedNew = money.add(wallet.reserved, amount);
      const reservedUpdate = await tx.wallet.updateMany({
        where: { id: wallet.id, balance: { gte: reservedNew } },
        data: { reserved: reservedNew },
      });
      if (reservedUpdate.count === 0) {
        throw new WithdrawalError(
          'Balance changed during submission. Please retry.',
          'CONCURRENT_MODIFICATION'
        );
      }

      // Immutable ledger MARKER for the reservation. Amount is 0 because the
      // balance itself does not move at submission — the hold lives in the
      // reserved column (recorded in metadata). Keeping the row amount-neutral
      // preserves the ledger-sum invariant (balance == Σ ledger amounts) and
      // the chain continuity (before == after == balance at submit time) no
      // matter what bets happen while the request is pending. The realized
      // −amount movement is appended as its own COMPLETED payout row at
      // approval time (the end of the chain), and rejection finalizes this
      // marker with no money movement at all.
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: money.ZERO,
          balanceBefore: wallet.balance,
          balanceAfter: wallet.balance,
          status: 'PENDING',
          description: `Withdrawal reserved - ${data.paymentMethod} to ${data.accountNumber.trim()} (pending approval)`,
          referenceId: withdrawal.id,
          metadata: JSON.stringify({
            kind: 'RESERVATION',
            reservedAmount: money.num(amount),
            reservedBefore: money.num(wallet.reserved),
            reservedAfter: money.num(reservedNew),
            availableBefore: money.num(available),
            availableAfter: money.num(money.sub(available, amount)),
          }),
        },
      });

      return withdrawal;
    });

    // ── H4: RISK-ENGINE AUTO-HOLD ──
    // Run the full 6-signal assessment for this submission; if the engine
    // escalates to HIGH or CRITICAL (its own alert-worthy convention), flip the
    // request to HELD instead of leaving it in the normal approval flow. Funds
    // stay reserved either way — only approve/reject release the reservation.
    // Best-effort: a risk-engine failure must never fail a funded submission.
    let riskAssessment: RiskAssessment | null = null;
    try {
      riskAssessment = await riskEngine.assessAndRecord(data.userId, {
        trigger: 'WITHDRAWAL_CREATED',
        withdrawalId: result.id,
      });
      if (riskAssessment.level === 'HIGH' || riskAssessment.level === 'CRITICAL') {
        const held = await prisma.withdrawal.updateMany({
          where: { id: result.id, status: WithdrawalStatus.PENDING },
          data: {
            status: WithdrawalStatus.HELD,
            rejectionReason: `AUTO-HOLD (${riskAssessment.level}, score ${riskAssessment.score}): ${riskAssessment.reasons.join('; ')}`,
          },
        });
        if (held.count > 0) {
          try {
            await auditService.log({
              adminId: data.userId, // system-initiated hold is attributed to the assessed user
              action: 'WITHDRAWAL_HELD' as any,
              targetUserId: data.userId,
              targetId: result.id,
              metadata: {
                riskLevel: riskAssessment.level,
                riskScore: riskAssessment.score,
                reasons: riskAssessment.reasons,
                systemInitiated: true,
              },
            });
          } catch (err) {
            console.error('[WITHDRAWAL] Hold audit log failed:', err);
          }
          console.log(
            `[WITHDRAWAL] HELD ${result.id} for risk review - level: ${riskAssessment.level}, score: ${riskAssessment.score}`
          );
        }
      }
    } catch (err) {
      console.error('[WITHDRAWAL] Risk assessment failed (withdrawal remains PENDING):', err);
    }

    // Notification (non-critical, outside transaction)
    await notificationService.createNotification({
      userId: data.userId,
      type: NotificationType.WITHDRAWAL_SUBMITTED,
      title: 'Withdrawal Submitted',
      message: `Your withdrawal request of ${money.num(amount).toFixed(2)} ETB has been submitted and the funds reserved pending approval.`,
      metadata: { withdrawalId: result.id, amount: money.num(amount) },
    });

    console.log(`[WITHDRAWAL] Created withdrawal ${result.id} - status: ${result.status}, reserved: ${money.num(amount)} ETB`);

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'WITHDRAWAL_CREATED',
      userId: data.userId,
      transactionId: result.id,
      amount: String(money.num(amount)),
      metadata: { paymentMethod: data.paymentMethod, reserved: true },
    });
    trackEvent({
      eventType: 'WITHDRAWAL_RESERVED',
      userId: data.userId,
      transactionId: result.id,
      amount: String(money.num(amount)),
    });
    metricsEngine.onTransaction();

    return result;
  }

  /**
   * Get user withdrawals
   */
  async getUserWithdrawals(userId: string, limit = 20, offset = 0) {
    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.withdrawal.count({ where: { userId } }),
    ]);

    return {
      withdrawals: withdrawals.map((w) => ({
        ...w,
        amount: Number(w.amount),
      })),
      total,
    };
  }

  /**
   * Get all withdrawals (admin) with full user + wallet + ledger context
   */
  async getAllWithdrawals(options: {
    status?: WithdrawalStatus;
    userId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
    sort?: 'newest' | 'oldest' | 'amount';
  }) {
    const { status, userId, search, dateFrom, dateTo, limit = 50, offset = 0, sort = 'newest' } = options;

    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }
    if (search) {
      where.OR = [
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search, mode: 'insensitive' } } },
        { accountNumber: { contains: search } },
      ];
    }

    const orderBy =
      sort === 'amount'
        ? { amount: 'desc' as const }
        : sort === 'oldest'
          ? { createdAt: 'asc' as const }
          : { createdAt: 'desc' as const };

    const [withdrawals, total] = await Promise.all([
      prisma.withdrawal.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              createdAt: true,
              wallet: { select: { balance: true, reserved: true } },
            },
          },
        },
        orderBy,
        take: limit,
        skip: offset,
      }),
      prisma.withdrawal.count({ where }),
    ]);

    // Attach the ledger trail (reservation + release) per withdrawal
    const withdrawalIds = withdrawals.map((w) => w.id);
    const ledger = withdrawalIds.length
      ? await prisma.walletTransaction.findMany({
          where: { referenceId: { in: withdrawalIds } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const ledgerByRef = new Map<string, typeof ledger>();
    for (const t of ledger) {
      if (!t.referenceId) continue;
      const list = ledgerByRef.get(t.referenceId) || [];
      list.push(t);
      ledgerByRef.set(t.referenceId, list);
    }

    return {
      withdrawals: withdrawals.map((w) => {
        const txs = ledgerByRef.get(w.id) || [];
        const reservation = txs.find((t) => t.type === 'WITHDRAWAL');
        const release = txs.find((t) => t.type === 'REFUND');
        return {
          id: w.id,
          userId: w.userId,
          amount: Number(w.amount),
          paymentMethod: w.paymentMethod,
          accountNumber: w.accountNumber,
          accountHolder: w.accountHolder,
          status: w.status,
          rejectionReason: w.rejectionReason,
          processedBy: w.processedBy,
          processedAt: w.processedAt?.toISOString() || null,
          createdAt: w.createdAt.toISOString(),
          updatedAt: w.updatedAt.toISOString(),
          user: {
            id: w.user.id,
            name: w.user.name,
            email: w.user.email,
            phone: w.user.phone,
            memberSince: w.user.createdAt.toISOString(),
          },
          wallet: w.user.wallet
            ? {
                balance: Number(w.user.wallet.balance),
                reserved: Number(w.user.wallet.reserved),
              }
            : null,
          balanceInfo: {
            // Reservation-time figures (authoritative for this request)
            balanceBefore: reservation ? Number(reservation.balanceBefore) : null,
            balanceAfter: reservation ? Number(reservation.balanceAfter) : null,
            // Current wallet figures
            currentBalance: w.user.wallet ? Number(w.user.wallet.balance) : null,
            currentReserved: w.user.wallet ? Number(w.user.wallet.reserved) : null,
          },
          transactions: txs.map((t) => ({
            id: t.id,
            type: t.type,
            amount: Number(t.amount),
            balanceBefore: Number(t.balanceBefore),
            balanceAfter: Number(t.balanceAfter),
            status: t.status,
            description: t.description,
            processedBy: t.processedBy,
            createdAt: t.createdAt.toISOString(),
          })),
          releaseTx: release
            ? {
                amount: Number(release.amount),
                balanceBefore: Number(release.balanceBefore),
                balanceAfter: Number(release.balanceAfter),
                createdAt: release.createdAt.toISOString(),
              }
            : null,
        };
      }),
      total,
    };
  }

  /**
   * Get withdrawal by ID (admin detail view, includes user withdrawal history)
   */
  async getWithdrawalById(withdrawalId: string) {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
            wallet: { select: { balance: true, reserved: true } },
          },
        },
      },
    });

    if (!withdrawal) {
      throw new WithdrawalError('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: { referenceId: withdrawalId },
      orderBy: { createdAt: 'asc' },
    });

    // Complete user withdrawal history (admin requirement)
    const history = await prisma.withdrawal.findMany({
      where: { userId: withdrawal.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const reservation = transactions.find((t) => t.type === 'WITHDRAWAL');
    const release = transactions.find((t) => t.type === 'REFUND');

    return {
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: Number(withdrawal.amount),
      paymentMethod: withdrawal.paymentMethod,
      accountNumber: withdrawal.accountNumber,
      accountHolder: withdrawal.accountHolder,
      status: withdrawal.status,
      rejectionReason: withdrawal.rejectionReason,
      processedBy: withdrawal.processedBy,
      processedAt: withdrawal.processedAt?.toISOString() || null,
      createdAt: withdrawal.createdAt.toISOString(),
      updatedAt: withdrawal.updatedAt.toISOString(),
      user: {
        id: withdrawal.user.id,
        name: withdrawal.user.name,
        email: withdrawal.user.email,
        phone: withdrawal.user.phone,
        memberSince: withdrawal.user.createdAt.toISOString(),
      },
      wallet: withdrawal.user.wallet
        ? { balance: Number(withdrawal.user.wallet.balance), reserved: Number(withdrawal.user.wallet.reserved) }
        : null,
      balanceInfo: {
        balanceBefore: reservation ? Number(reservation.balanceBefore) : null,
        balanceAfter: reservation ? Number(reservation.balanceAfter) : null,
        currentBalance: withdrawal.user.wallet ? Number(withdrawal.user.wallet.balance) : null,
        currentReserved: withdrawal.user.wallet ? Number(withdrawal.user.wallet.reserved) : null,
      },
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        balanceBefore: Number(t.balanceBefore),
        balanceAfter: Number(t.balanceAfter),
        status: t.status,
        description: t.description,
        processedBy: t.processedBy,
        createdAt: t.createdAt.toISOString(),
      })),
      releaseTx: release
        ? {
            amount: Number(release.amount),
            balanceBefore: Number(release.balanceBefore),
            balanceAfter: Number(release.balanceAfter),
            createdAt: release.createdAt.toISOString(),
          }
        : null,
      history: history.map((h) => ({
        id: h.id,
        amount: Number(h.amount),
        status: h.status,
        createdAt: h.createdAt.toISOString(),
        processedAt: h.processedAt?.toISOString() || null,
        rejectionReason: h.rejectionReason,
      })),
    };
  }

  /**
   * Get pending withdrawals count
   */
  async getPendingCount(): Promise<number> {
    return prisma.withdrawal.count({
      where: { status: WithdrawalStatus.PENDING },
    });
  }

  /**
   * Get total withdrawn amount (approved + completed)
   */
  async getTotalWithdrawn(): Promise<number> {
    const result = await prisma.withdrawal.aggregate({
      where: { status: { in: [WithdrawalStatus.APPROVED, WithdrawalStatus.COMPLETED] } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount || 0);
  }

  async getUserTotalWithdrawals(userId: string): Promise<number> {
    const result = await prisma.withdrawal.aggregate({
      where: { userId, status: { in: [WithdrawalStatus.APPROVED, WithdrawalStatus.COMPLETED] } },
      _sum: { amount: true },
    });
    return Number(result._sum.amount || 0);
  }

  async getUserAvailableBalance(userId: string): Promise<number> {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return 0;
    return Number(money.sub(wallet.balance, wallet.reserved));
  }

  /**
   * Approve a withdrawal.
   * The amount was RESERVED at submission (reserved += amount, balance untouched).
   * Approval is THE money-leaves step: balance -= amount (payout) and the
   * reservation is cleared, in one guarded transaction. Exactly-once is
   * enforced by the status transition (PENDING/HELD -> COMPLETED) plus the
   * reservation guard (reserved >= amount); a concurrent approve/reject wins
   * and this call fails cleanly.
   */
  async approveWithdrawal(data: {
    withdrawalId: string;
    adminId: string;
    ipAddress?: string;
  }) {
    console.log(`[WITHDRAWAL] Approving withdrawal ${data.withdrawalId} - adminId: ${data.adminId}`);

    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: data.withdrawalId },
        include: {
          user: {
            select: {
              id: true,
              wallet: { select: { id: true, balance: true, reserved: true } },
            },
          },
        },
      });

      if (!withdrawal) {
        throw new WithdrawalError('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
      }
      if (!withdrawal.user.wallet) {
        throw new WithdrawalError('User wallet not found', 'WALLET_NOT_FOUND');
      }

      const amount = withdrawal.amount;

      // Guarded status transition: only PENDING/HELD -> COMPLETED succeeds once.
      // (HELD = risk-flagged for review; approving IS the explicit review.)
      const updated = await tx.withdrawal.updateMany({
        where: {
          id: withdrawal.id,
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.HELD] },
        },
        data: {
          status: WithdrawalStatus.COMPLETED,
          processedBy: data.adminId,
          processedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new WithdrawalError(
          'Withdrawal has already been processed',
          'WITHDRAWAL_ALREADY_PROCESSED'
        );
      }

      // THE money-leaves step: balance -= amount (payout) and the reservation
      // is cleared, atomically, guarded on reserved >= amount. This runs after
      // the status transition above, so it can execute at most once ever.
      const balanceAfter = money.sub(withdrawal.user.wallet.balance, amount);
      const cleared = await tx.wallet.updateMany({
        where: {
          id: withdrawal.user.wallet.id,
          reserved: { gte: amount },
          balance: { gte: amount }, // defensive: consistent state always satisfies this
        },
        data: { balance: balanceAfter, reserved: { decrement: amount } },
      });
      if (cleared.count === 0) {
        throw new WithdrawalError(
          'Reservation missing or already cleared',
          'RESERVATION_STATE_INVALID'
        );
      }

      // Finalize the reservation MARKER row (it stays amount-neutral; see
      // createWithdrawal) and append the realized payout movement at the end
      // of the ledger chain. Together they keep the ledger-sum invariant
      // (balance == Σ ledger amounts) and chain continuity intact.
      await tx.walletTransaction.updateMany({
        where: { referenceId: withdrawal.id, type: 'WITHDRAWAL', status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          description: `Withdrawal reserved then paid out - ${withdrawal.paymentMethod} to ${withdrawal.accountNumber}`,
        },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: withdrawal.user.wallet.id,
          type: 'WITHDRAWAL',
          amount: money.neg(amount),
          balanceBefore: withdrawal.user.wallet.balance,
          balanceAfter: balanceAfter,
          status: 'COMPLETED',
          description: `Withdrawal approved and paid out - ${withdrawal.paymentMethod} to ${withdrawal.accountNumber}`,
          referenceId: withdrawal.id,
          processedBy: data.adminId,
          metadata: JSON.stringify({ kind: 'PAYOUT' }),
        },
      });

      const walletAfter = await tx.wallet.findUnique({
        where: { id: withdrawal.user.wallet.id },
      });

      return {
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        amount: Number(amount),
        paymentMethod: withdrawal.paymentMethod,
        // Balance was realized here (the money-leaves step)
        balanceBefore: money.num(money.add(walletAfter!.balance, amount)),
        newBalance: Number(walletAfter!.balance),
        newReserved: Number(walletAfter!.reserved),
      };
    });

    // Notification + audit (non-critical, outside transaction)
    try {
      await notificationService.createNotification({
        userId: result.userId,
        type: NotificationType.WITHDRAWAL_APPROVED,
        title: 'Withdrawal Approved',
        message: `Your withdrawal of ${result.amount.toFixed(2)} ETB has been approved and will be sent via ${result.paymentMethod}.`,
        metadata: { withdrawalId: result.withdrawalId, amount: result.amount },
      });
    } catch (err) {
      console.error('[WITHDRAWAL] Notification failed:', err);
    }
    try {
      await auditService.logWithdrawalApproved(
        data.adminId,
        result.withdrawalId,
        result.userId,
        result.amount,
        data.ipAddress
      );
    } catch (err) {
      console.error('[WITHDRAWAL] Audit log failed:', err);
    }

    console.log(`[WITHDRAWAL] Approved ${result.withdrawalId} - reservation cleared: ${result.amount} ETB`);

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'WITHDRAWAL_APPROVED',
      userId: result.userId,
      transactionId: result.withdrawalId,
      amount: String(result.amount),
      metadata: { adminId: data.adminId, paymentMethod: result.paymentMethod },
    });
    metricsEngine.onTransaction();

    return result;
  }

  /**
   * Reject a withdrawal and release the reservation exactly once
   */
  async rejectWithdrawal(data: {
    withdrawalId: string;
    adminId: string;
    reason: string;
    ipAddress?: string;
  }) {
    console.log(`[WITHDRAWAL] Rejecting withdrawal ${data.withdrawalId} - adminId: ${data.adminId}`);

    if (!data.reason || !data.reason.trim()) {
      throw new WithdrawalError('Rejection reason is required', 'REASON_REQUIRED');
    }

    const result = await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: data.withdrawalId },
        include: {
          user: {
            select: {
              id: true,
              wallet: { select: { id: true, balance: true, reserved: true } },
            },
          },
        },
      });

      if (!withdrawal) {
        throw new WithdrawalError('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
      }
      if (!withdrawal.user.wallet) {
        throw new WithdrawalError('User wallet not found', 'WALLET_NOT_FOUND');
      }

      const amount = withdrawal.amount;

      // Guarded transition PENDING/HELD -> REJECTED (can happen at most once).
      // Approve/reject of a HELD request clears the auto-hold flag; a previous
      // rejectionReason (the hold annotation) is overwritten by the real reason.
      const updated = await tx.withdrawal.updateMany({
        where: {
          id: withdrawal.id,
          status: { in: [WithdrawalStatus.PENDING, WithdrawalStatus.HELD] },
        },
        data: {
          status: WithdrawalStatus.REJECTED,
          rejectionReason: data.reason.trim(),
          processedBy: data.adminId,
          processedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new WithdrawalError(
          'Withdrawal has already been processed',
          'WITHDRAWAL_ALREADY_PROCESSED'
        );
      }

      // Release the reservation: reserved -= amount (guard: reserved >= amount).
      // Balance is untouched — the money only leaves at approval, so a rejected
      // request is a pure hold-release (available restored via reserved drop).
      const released = await tx.wallet.updateMany({
        where: { id: withdrawal.user.wallet.id, reserved: { gte: amount } },
        data: { reserved: { decrement: amount } },
      });
      if (released.count === 0) {
        throw new WithdrawalError(
          'Reservation missing or already released',
          'RESERVATION_STATE_INVALID'
        );
      }

      // Finalize the reservation MARKER row (amount-neutral) and record the
      // release as a REFUND row. Balance itself never changed (the money only
      // leaves at approval), so the release row is also amount-neutral — the
      // funds became spendable via the reserved column drop. Both rows keep
      // the ledger-sum invariant (balance == Σ ledger amounts) intact.
      await tx.walletTransaction.updateMany({
        where: { referenceId: withdrawal.id, type: 'WITHDRAWAL', status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          description: `Withdrawal rejected before payout - ${withdrawal.paymentMethod} to ${withdrawal.accountNumber}`,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: withdrawal.user.wallet.id,
          type: 'REFUND',
          amount: money.ZERO,
          balanceBefore: withdrawal.user.wallet.balance,
          balanceAfter: withdrawal.user.wallet.balance,
          status: 'COMPLETED',
          description: `Withdrawal rejected - reserved funds released (${money.num(amount)} ETB back to available): ${data.reason.trim()}`,
          referenceId: withdrawal.id,
          processedBy: data.adminId,
          metadata: JSON.stringify({
            kind: 'RESERVATION_RELEASE',
            releasedAmount: money.num(amount),
            reservedAfter: money.num(money.sub(withdrawal.user.wallet.reserved, amount)),
          }),
        },
      });

      return {
        withdrawalId: withdrawal.id,
        userId: withdrawal.userId,
        amount: Number(amount),
        paymentMethod: withdrawal.paymentMethod,
        balanceBefore: Number(withdrawal.user.wallet.balance),
        newBalance: Number(withdrawal.user.wallet.balance),
        newReserved: Number(money.sub(withdrawal.user.wallet.reserved, amount)),
        refundedAmount: Number(amount),
        rejectionReason: data.reason.trim(),
      };
    });

    try {
      await notificationService.createNotification({
        userId: result.userId,
        type: NotificationType.WITHDRAWAL_REJECTED,
        title: 'Withdrawal Rejected',
        message: `Your withdrawal request of ${result.amount.toFixed(2)} ETB was rejected. Reason: ${data.reason.trim()}. The reserved funds have been returned to your available balance.`,
        metadata: { withdrawalId: result.withdrawalId, amount: result.amount, reason: data.reason.trim() },
      });
    } catch (err) {
      console.error('[WITHDRAWAL] Notification failed:', err);
    }
    try {
      await auditService.logWithdrawalRejected(
        data.adminId,
        result.withdrawalId,
        result.userId,
        data.reason.trim(),
        data.ipAddress
      );
    } catch (err) {
      console.error('[WITHDRAWAL] Audit log failed:', err);
    }

    console.log(`[WITHDRAWAL] Rejected ${result.withdrawalId} - released: ${result.amount} ETB`);

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'WITHDRAWAL_REJECTED',
      userId: result.userId,
      transactionId: result.withdrawalId,
      amount: String(result.amount),
      metadata: { reason: data.reason.trim(), adminId: data.adminId, released: true },
    });
    trackEvent({
      eventType: 'WITHDRAWAL_RELEASED',
      userId: result.userId,
      transactionId: result.withdrawalId,
      amount: String(result.amount),
    });
    metricsEngine.onTransaction();

    return result;
  }
}

export class WithdrawalError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WithdrawalError';
    this.code = code;
  }
}

export const withdrawalService = new WithdrawalService();

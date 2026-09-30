/**
 * ============================================
 * DEPOSIT SERVICE - FINANCIAL SAFETY CRITICAL
 * ============================================
 * FINANCIAL SAFETY GUARANTEES:
 * - All money math uses Prisma Decimal via the money helper (no float arithmetic)
 * - Approval credits the wallet inside prisma.$transaction() with a guarded
 *   PENDING -> APPROVED updateMany: concurrent double-approval is impossible
 * - Balance never changes at submission; only admin approval credits funds
 * - Immutable ledger: WalletTransaction rows are created, never updated
 * - Every approval records balanceBefore/balanceAfter, admin, timestamps
 * ============================================
 */
import prisma from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditAction, DepositStatus, PaymentMethod, NotificationType } from '../shared/types';
import { settingsService } from './settings.service';
import { notificationService } from './notification.service';
import { auditService } from './audit.service';
import { money } from './money.helper';
import { cloudinaryService } from './cloudinary.service';
import { trackEvent } from '../analytics/event-pipeline';
import { metricsEngine } from '../analytics/metrics-engine';
import { responsibleGaming } from '../analytics/responsible-gaming';

export class DepositService {
  /**
   * Create a deposit request (no balance change; funds credited only on approval)
   */
  async createDeposit(data: {
    userId: string;
    amount: Decimal | undefined; // Decimal since M7; undefined = not self-declared
    paymentMethod: PaymentMethod;
    screenshotUrl: string;
    screenshotPublicId?: string;
    isAmountUnverified?: boolean;
  }) {
    console.log(`[DEPOSIT] Creating deposit - userId: ${data.userId}, amount: ${data.amount}, method: ${data.paymentMethod}, unverified: ${data.isAmountUnverified}`);

    const settings = await settingsService.getSettings();

    // Validate amount only if provided (undefined means the user left it unverified).
    // M7: services accept a Decimal — parsing happened at the route boundary.
    const amount = data.amount === undefined ? money.ZERO : money.fromDecimal(data.amount);
    if (money.gt(amount, money.ZERO)) {
      if (amount.decimalPlaces() > 2) {
        throw new DepositError('Amount supports at most 2 decimal places', 'INVALID_AMOUNT');
      }
      if (money.lt(amount, money.fromNumber(settings.minimumDeposit))) {
        throw new DepositError(
          `Minimum deposit amount is ${settings.minimumDeposit} ETB`,
          'DEPOSIT_BELOW_MINIMUM'
        );
      }
      if (money.gt(amount, money.fromNumber(settings.maximumDeposit))) {
        throw new DepositError(
          `Maximum deposit amount is ${settings.maximumDeposit} ETB`,
          'DEPOSIT_ABOVE_MAXIMUM'
        );
      }
    }

    // Validate payment method
    const methodConfig = settings.paymentMethods[data.paymentMethod];
    if (!methodConfig || !methodConfig.enabled) {
      throw new DepositError('Payment method is not available', 'INVALID_PAYMENT_METHOD');
    }

    // Validate screenshot (Cloudinary reference is mandatory)
    if (!data.screenshotUrl) {
      throw new DepositError('Transaction screenshot is required', 'SCREENSHOT_REQUIRED');
    }

    // Create deposit (PENDING; balance untouched)
    const deposit = await prisma.deposit.create({
      data: {
        userId: data.userId,
        submittedAmount: amount,
        paymentMethod: data.paymentMethod,
        screenshotUrl: data.screenshotUrl,
        screenshotPublicId: data.screenshotPublicId,
        status: DepositStatus.PENDING,
      },
    });

    // Notification (non-critical)
    await notificationService.createNotification({
      userId: data.userId,
      type: NotificationType.DEPOSIT_SUBMITTED,
      title: 'Deposit Submitted',
      message: money.gt(amount, money.ZERO)
        ? `Your deposit of ${money.num(amount).toFixed(2)} ETB has been submitted and is awaiting admin approval.`
        : 'Your deposit screenshot has been submitted and is awaiting verification by an admin.',
      metadata: { depositId: deposit.id, amount: money.num(amount) },
    });

    console.log(`[DEPOSIT] Created deposit ${deposit.id} - status: PENDING`);

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'DEPOSIT_CREATED',
      userId: data.userId,
      transactionId: deposit.id,
      amount: String(deposit.submittedAmount),
      metadata: { paymentMethod: data.paymentMethod },
    });
    metricsEngine.onTransaction();
    void responsibleGaming.checkDepositEscalation(data.userId, Number(deposit.submittedAmount)).catch(() => undefined);

    return deposit;
  }

  /**
   * Get user deposits
   */
  async getUserDeposits(userId: string, limit = 20, offset = 0) {
    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.deposit.count({ where: { userId } }),
    ]);

    return {
      deposits: deposits.map((d) => ({
        ...d,
        submittedAmount: Number(d.submittedAmount),
        verifiedAmount: d.verifiedAmount ? Number(d.verifiedAmount) : null,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        processedAt: d.processedAt?.toISOString() || null,
      })),
      total,
    };
  }

  /**
   * Get all deposits (admin) with full user context, search/filter/sort
   */
  async getAllDeposits(options: {
    status?: DepositStatus;
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
      ];
    }

    const orderBy =
      sort === 'amount'
        ? { submittedAmount: 'desc' as const }
        : sort === 'oldest'
          ? { createdAt: 'asc' as const }
          : { createdAt: 'desc' as const };

    const [deposits, total] = await Promise.all([
      prisma.deposit.findMany({
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
      prisma.deposit.count({ where }),
    ]);

    // Ledger trail per deposit (credit transactions reference deposit id)
    const depositIds = deposits.map((d) => d.id);
    const ledger = depositIds.length
      ? await prisma.walletTransaction.findMany({
          where: { referenceId: { in: depositIds } },
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
      deposits: deposits.map((d) => {
        const txs = ledgerByRef.get(d.id) || [];
        const creditTx = txs.find((t) => t.type === 'DEPOSIT');
        return {
          id: d.id,
          userId: d.userId,
          submittedAmount: Number(d.submittedAmount),
          verifiedAmount: d.verifiedAmount ? Number(d.verifiedAmount) : null,
          paymentMethod: d.paymentMethod,
          screenshotUrl: cloudinaryService.normalizeStoredUrl(d.screenshotUrl),
          screenshotPublicId: d.screenshotPublicId,
          status: d.status,
          rejectionReason: d.rejectionReason,
          processedBy: d.processedBy,
          processedAt: d.processedAt?.toISOString() || null,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
          user: {
            id: d.user.id,
            name: d.user.name,
            email: d.user.email,
            phone: d.user.phone,
            memberSince: d.user.createdAt.toISOString(),
          },
          wallet: d.user.wallet
            ? {
                balance: Number(d.user.wallet.balance),
                reserved: Number(d.user.wallet.reserved),
              }
            : null,
          balanceInfo: {
            // Balance before this deposit's approval (from the ledger row)
            balanceBefore: creditTx ? Number(creditTx.balanceBefore) : null,
            balanceAfter: creditTx ? Number(creditTx.balanceAfter) : null,
            // Current wallet
            currentBalance: d.user.wallet ? Number(d.user.wallet.balance) : null,
            currentReserved: d.user.wallet ? Number(d.user.wallet.reserved) : null,
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
        };
      }),
      total,
    };
  }

  /**
   * Get deposit by ID with full admin detail
   */
  async getDepositById(depositId: string) {
    const deposit = await prisma.deposit.findUnique({
      where: { id: depositId },
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

    if (!deposit) {
      throw new DepositError('Deposit not found', 'DEPOSIT_NOT_FOUND');
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: { referenceId: depositId },
      orderBy: { createdAt: 'asc' },
    });

    const creditTx = transactions.find((t) => t.type === 'DEPOSIT');

    return {
      id: deposit.id,
      userId: deposit.userId,
      submittedAmount: Number(deposit.submittedAmount),
      verifiedAmount: deposit.verifiedAmount ? Number(deposit.verifiedAmount) : null,
      paymentMethod: deposit.paymentMethod,
      screenshotUrl: cloudinaryService.normalizeStoredUrl(deposit.screenshotUrl),
      screenshotPublicId: deposit.screenshotPublicId,
      status: deposit.status,
      rejectionReason: deposit.rejectionReason,
      processedBy: deposit.processedBy,
      processedAt: deposit.processedAt?.toISOString() || null,
      createdAt: deposit.createdAt.toISOString(),
      updatedAt: deposit.updatedAt.toISOString(),
      user: {
        id: deposit.user.id,
        name: deposit.user.name,
        email: deposit.user.email,
        phone: deposit.user.phone,
        memberSince: deposit.user.createdAt.toISOString(),
      },
      wallet: deposit.user.wallet
        ? {
            balance: Number(deposit.user.wallet.balance),
            reserved: Number(deposit.user.wallet.reserved),
          }
        : null,
      balanceInfo: {
        balanceBefore: creditTx ? Number(creditTx.balanceBefore) : null,
        balanceAfter: creditTx ? Number(creditTx.balanceAfter) : null,
        currentBalance: deposit.user.wallet ? Number(deposit.user.wallet.balance) : null,
        currentReserved: deposit.user.wallet ? Number(deposit.user.wallet.reserved) : null,
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
    };
  }

  /**
   * Get pending deposits count
   */
  async getPendingCount(): Promise<number> {
    return prisma.deposit.count({
      where: { status: DepositStatus.PENDING },
    });
  }

  /**
   * Get total deposited amount (approved)
   */
  async getTotalDeposited(): Promise<number> {
    const result = await prisma.deposit.aggregate({
      where: { status: DepositStatus.APPROVED },
      _sum: { verifiedAmount: true },
    });
    return Number(result._sum.verifiedAmount || 0);
  }

  async getUserTotalDeposits(userId: string): Promise<number> {
    const result = await prisma.deposit.aggregate({
      where: { userId, status: DepositStatus.APPROVED },
      _sum: { verifiedAmount: true },
    });
    return Number(result._sum.verifiedAmount || 0);
  }

  /**
   * Approve a deposit and credit the user's wallet.
   * CRITICAL: atomic; the PENDING -> APPROVED transition is a guarded updateMany
   * so a concurrent approval (or rejection) makes this call fail cleanly instead
   * of double-crediting.
   */
  async approveDeposit(data: {
    depositId: string;
    adminId: string;
    creditAmount: number;
    ipAddress?: string;
    reason?: string; // H1: mandatory — no approval without a recorded reason
  }) {
    console.log(`[DEPOSIT] Approving deposit ${data.depositId} - creditAmount: ${data.creditAmount}, adminId: ${data.adminId}`);

    // ── H1: reason is mandatory for every approval ──
    const reason = (data.reason ?? '').trim();
    if (reason.length < 4) {
      throw new DepositError('An approval reason is required', 'REASON_REQUIRED');
    }

    const creditAmount = money.fromNumber(data.creditAmount);
    if (!money.gt(creditAmount, money.ZERO)) {
      throw new DepositError('Credit amount must be greater than zero', 'INVALID_CREDIT_AMOUNT');
    }
    if (creditAmount.decimalPlaces() > 2) {
      throw new DepositError('Credit amount supports at most 2 decimal places', 'INVALID_CREDIT_AMOUNT');
    }

    // ── Approval envelope (product decision, 2026-09-30) ──
    //
    // The envelope is the maximumDeposit setting — a HARD ceiling any single
    // admin may credit, including deposits where the user left the amount
    // blank (submittedAmount 0). The earlier min(10 × submittedAmount, cap)
    // rule wedged every blank-amount deposit in PENDING forever wherever only
    // one admin account exists: envelope 0 ⇒ any credit threw
    // OVERRIDE_REQUIRED and only a second, different admin could release it.
    // Credits ABOVE the cap still require dual control via the override
    // machinery below — the fraud guard survives, it just starts where a
    // single admin's authority ends.
    const settings = await settingsService.getSettings();
    {
      const pre = await prisma.deposit.findUnique({
        where: { id: data.depositId },
        select: { userId: true, status: true, submittedAmount: true, overrideRequestedBy: true },
      });
      if (!pre) {
        throw new DepositError('Deposit not found', 'DEPOSIT_NOT_FOUND');
      }
      const envelope = money.fromNumber(settings.maximumDeposit);

      if (money.gt(creditAmount, envelope) && !pre.overrideRequestedBy) {
        const claimed = await prisma.deposit.updateMany({
          where: { id: data.depositId, status: DepositStatus.PENDING, overrideRequestedBy: null },
          data: {
            overrideRequestedBy: data.adminId,
            overrideRequestedAt: new Date(),
            overrideAmount: creditAmount,
            overrideReason: reason,
          },
        });
        if (claimed.count > 0) {
          // Audit here — the transaction's .catch below never sees a
          // pre-transaction throw.
          try {
            await auditService.log({
              adminId: data.adminId,
              action: AuditAction.DEPOSIT_OVERRIDE_REQUESTED,
              targetUserId: pre.userId,
              targetId: data.depositId,
              metadata: {
                requestedAmount: money.num(creditAmount),
                submittedAmount: money.num(pre.submittedAmount),
                reason,
              },
              ipAddress: data.ipAddress,
            });
          } catch (auditErr) {
            console.error('[DEPOSIT] Override audit log failed:', auditErr);
          }
          throw new DepositError(
            `Credit of ${money.num(creditAmount)} ETB exceeds the approval envelope (${money.num(envelope)} ETB). ` +
            'Request recorded — a second admin must approve it before the credit is applied.',
            'OVERRIDE_REQUIRED'
          );
        }
        // Lost the claim race (another admin recorded first, or the deposit
        // left PENDING). Fall through — the transaction below re-reads fresh
        // state and surfaces the exact dual-control error.
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({
        where: { id: data.depositId },
        include: {
          user: {
            select: {
              id: true,
              wallet: { select: { id: true, balance: true } },
            },
          },
        },
      });

      if (!deposit) {
        throw new DepositError('Deposit not found', 'DEPOSIT_NOT_FOUND');
      }

      // Envelope = the maximumDeposit setting (see the pre-transaction block
      // above for why the old min(10 × submittedAmount, cap) rule was
      // dropped). Credits above the cap still demand dual control.
      const envelope = money.fromNumber(settings.maximumDeposit);

      let dualControl: { requestedBy: string } | null = null;
      if (money.gt(creditAmount, envelope)) {
        // ── out of envelope: DUAL CONTROL — no single admin can apply this ──
        // (First-admin request recording happens BEFORE this transaction —
        // see the pre-transaction block above. Reaching here with no request
        // on record means the pre-transaction claim lost a race; record it
        // here as a fallback. If this throws, the rollback only loses the
        // fallback record — the credit is still never applied without a
        // second admin.)
        if (!deposit.overrideRequestedBy) {
          const claimed = await tx.deposit.updateMany({
            where: { id: deposit.id, status: DepositStatus.PENDING, overrideRequestedBy: null },
            data: {
              overrideRequestedBy: data.adminId,
              overrideRequestedAt: new Date(),
              overrideAmount: creditAmount,
              overrideReason: reason,
            },
          });
          throw new DepositError(
            `Credit of ${money.num(creditAmount)} ETB exceeds the approval envelope (${money.num(envelope)} ETB). ` +
            (claimed.count > 0
              ? 'Request recorded — a second admin must approve it before the credit is applied.'
              : 'A concurrent request is being recorded — retry to surface its state.'),
            'OVERRIDE_REQUIRED'
          );
        }

        // A request already exists — only a DIFFERENT admin, for the SAME
        // amount, can approve it.
        if (deposit.overrideRequestedBy === data.adminId) {
          throw new DepositError(
            'Dual control: the requesting admin cannot approve their own override — a second admin must approve it',
            'DUAL_CONTROL_SAME_ADMIN'
          );
        }
        if (deposit.overrideAmount && !money.fromDecimal(deposit.overrideAmount).eq(creditAmount)) {
          throw new DepositError(
            `Amount mismatch: the override was requested for ${money.num(deposit.overrideAmount)} ETB`,
            'OVERRIDE_AMOUNT_MISMATCH'
          );
        }
        const decided = await tx.deposit.updateMany({
          where: { id: deposit.id, status: DepositStatus.PENDING, overrideApprovedBy: null },
          data: { overrideApprovedBy: data.adminId, overrideApprovedAt: new Date() },
        });
        if (decided.count === 0) {
          throw new DepositError('Override was already decided by another admin', 'OVERRIDE_ALREADY_DECIDED');
        }
        dualControl = { requestedBy: deposit.overrideRequestedBy };
      }

      // Guarded status transition: only PENDING -> APPROVED succeeds, exactly once
      const updated = await tx.deposit.updateMany({
        where: { id: deposit.id, status: DepositStatus.PENDING },
        data: {
          status: DepositStatus.APPROVED,
          verifiedAmount: creditAmount,
          processedBy: data.adminId,
          processedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new DepositError(
          'Deposit has already been processed',
          'DEPOSIT_ALREADY_PROCESSED'
        );
      }

      // Ensure wallet exists
      let wallet = deposit.user.wallet;
      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { userId: deposit.userId, balance: money.ZERO },
        });
        console.log(`[DEPOSIT] Created wallet ${wallet.id} for user ${deposit.userId}`);
      }

      // Credit EXACTLY the approved amount (Decimal math)
      const balanceBefore = wallet.balance;
      const balanceAfter = money.add(balanceBefore, creditAmount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      // Immutable ledger entry
      const dualSuffix = dualControl
        ? ` | dual control: requested by ${dualControl.requestedBy}, approved by ${data.adminId}`
        : '';
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          amount: creditAmount,
          balanceBefore,
          balanceAfter,
          status: 'COMPLETED',
          description: `Deposit approved - ${deposit.paymentMethod} (submitted: ${money.num(deposit.submittedAmount)}, credited: ${money.num(creditAmount)}) | reason: ${reason}${dualSuffix}`,
          referenceId: deposit.id,
          processedBy: data.adminId,
        },
      });

      console.log(`[DEPOSIT] Approved ${deposit.id} - balance: ${money.num(balanceBefore)} → ${money.num(balanceAfter)}`);

      return {
        depositId: deposit.id,
        userId: deposit.userId,
        paymentMethod: deposit.paymentMethod,
        creditAmount: money.num(creditAmount),
        balanceBefore: money.num(balanceBefore),
        newBalance: money.num(balanceAfter),
        dualControl,
      };
    }).catch(async (err: any) => {
      // H1: the dual-control lifecycle itself must hit the audit trail.
      // The request was RECORDED inside the (rolled-back-for-credit) tx, so
      // audit it here — then rethrow for the route to surface.
      if (err instanceof DepositError && err.code === 'OVERRIDE_REQUIRED') {
        try {
          const d = await prisma.deposit.findUnique({
            where: { id: data.depositId },
            select: { userId: true, submittedAmount: true, overrideAmount: true },
          });
          if (d) {
            await auditService.log({
              adminId: data.adminId,
              action: AuditAction.DEPOSIT_OVERRIDE_REQUESTED,
              targetUserId: d.userId,
              targetId: data.depositId,
              metadata: {
                requestedAmount: money.num(d.overrideAmount ?? 0),
                submittedAmount: money.num(d.submittedAmount),
                reason,
              },
              ipAddress: data.ipAddress,
            });
          }
        } catch (auditErr) {
          console.error('[DEPOSIT] Override audit log failed:', auditErr);
        }
      }
      if (err instanceof DepositError && err.code === 'DUAL_CONTROL_SAME_ADMIN') {
        try {
          await auditService.log({
            adminId: data.adminId,
            action: AuditAction.DEPOSIT_OVERRIDE_REJECTED,
            targetId: data.depositId,
            metadata: { detail: 'self-approval attempt by the requesting admin', creditAmount: data.creditAmount, reason },
            ipAddress: data.ipAddress,
          });
        } catch (auditErr) {
          console.error('[DEPOSIT] Override audit log failed:', auditErr);
        }
      }
      throw err;
    });

    // Notification (non-critical)
    try {
      await notificationService.createNotification({
        userId: result.userId,
        type: NotificationType.DEPOSIT_APPROVED,
        title: 'Deposit Approved',
        message: `Your deposit has been approved and ${result.creditAmount.toFixed(2)} ETB has been credited to your account.`,
        metadata: { depositId: result.depositId, creditedAmount: result.creditAmount },
      });
    } catch (err) {
      console.error('[DEPOSIT] Notification failed:', err);
    }

    // Audit log (non-critical) — reason + dual-control detail always recorded
    try {
      await auditService.logDepositApproved(
        data.adminId,
        result.depositId,
        result.userId,
        result.creditAmount,
        data.ipAddress,
        reason,
        result.dualControl
      );
      if (result.dualControl) {
        await auditService.log({
          adminId: data.adminId,
          action: AuditAction.DEPOSIT_OVERRIDE_APPROVED,
          targetUserId: result.userId,
          targetId: result.depositId,
          metadata: {
            requestedBy: result.dualControl.requestedBy,
            approvedBy: data.adminId,
            creditAmount: result.creditAmount,
            reason,
          },
          ipAddress: data.ipAddress,
        });
      }
    } catch (err) {
      console.error('[DEPOSIT] Audit log failed:', err);
    }

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'DEPOSIT_APPROVED',
      userId: result.userId,
      transactionId: result.depositId,
      amount: String(result.creditAmount),
      metadata: { balanceAfter: result.newBalance, adminId: data.adminId },
    });
    metricsEngine.onTransaction();

    return result;
  }

  /**
   * Reject a deposit with reason (no balance change).
   * Guarded PENDING -> REJECTED transition prevents double rejection and
   * rejection-after-approval.
   */
  async rejectDeposit(data: {
    depositId: string;
    adminId: string;
    reason: string;
    ipAddress?: string;
  }) {
    console.log(`[DEPOSIT] Rejecting deposit ${data.depositId} - reason: ${data.reason}, adminId: ${data.adminId}`);

    if (!data.reason || !data.reason.trim()) {
      throw new DepositError('Rejection reason is required', 'REASON_REQUIRED');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({
        where: { id: data.depositId },
        select: { id: true, userId: true, submittedAmount: true },
      });

      if (!deposit) {
        throw new DepositError('Deposit not found', 'DEPOSIT_NOT_FOUND');
      }

      const result = await tx.deposit.updateMany({
        where: { id: deposit.id, status: DepositStatus.PENDING },
        data: {
          status: DepositStatus.REJECTED,
          rejectionReason: data.reason.trim(),
          processedBy: data.adminId,
          processedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new DepositError(
          'Deposit has already been processed',
          'DEPOSIT_ALREADY_PROCESSED'
        );
      }

      return deposit;
    });

    try {
      await notificationService.createNotification({
        userId: updated.userId,
        type: NotificationType.DEPOSIT_REJECTED,
        title: 'Deposit Rejected',
        message: `Your deposit of ${money.num(updated.submittedAmount).toFixed(2)} ETB was rejected. Reason: ${data.reason.trim()}`,
        metadata: { depositId: updated.id, reason: data.reason.trim() },
      });
    } catch (err) {
      console.error('[DEPOSIT] Notification failed:', err);
    }

    try {
      await auditService.logDepositRejected(
        data.adminId,
        updated.id,
        updated.userId,
        data.reason.trim(),
        data.ipAddress
      );
    } catch (err) {
      console.error('[DEPOSIT] Audit log failed:', err);
    }

    console.log(`[DEPOSIT] Rejected ${updated.id}`);

    // ── ASYNC ANALYTICS (post-commit) ──
    trackEvent({
      eventType: 'DEPOSIT_REJECTED',
      userId: updated.userId,
      transactionId: updated.id,
      amount: String(updated.submittedAmount),
      metadata: { reason: data.reason.trim(), adminId: data.adminId },
    });
    metricsEngine.onTransaction();

    return {
      depositId: updated.id,
      userId: updated.userId,
      status: 'REJECTED',
      rejectionReason: data.reason.trim(),
    };
  }
}

export class DepositError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'DepositError';
    this.code = code;
  }
}

export const depositService = new DepositService();

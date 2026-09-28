import prisma from '../lib/prisma';

/**
 * FINANCIAL RECONCILIATION SERVICE.
 *
 * Verifies the core financial invariant for every wallet:
 *
 *     balance == Σ(COMPLETED ledger amounts)   AND   balance >= 0   AND   reserved >= 0
 *
 * WalletTransaction rows are immutable and record balanceBefore/balanceAfter
 * for every change, so any drift between the ledger sum and the wallet row
 * indicates a bug or tampering. This service DETECTS and REPORTS — it never
 * silently repairs. Discrepancies raise FINANCIAL admin alerts for
 * investigation, per the production-audit requirement.
 */
class ReconciliationService {
  /**
   * Verify one wallet: ledger-sum invariant + negative-value checks + a
   * chain check that the last ledger row's balanceAfter matches the wallet.
   */
  async checkWallet(walletId: string): Promise<{
    walletId: string;
    balance: number;
    reserved: number;
    ledgerSum: number;
    consistent: boolean;
    issues: string[];
  }> {
    const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) {
      return { walletId, balance: 0, reserved: 0, ledgerSum: 0, consistent: false, issues: ['WALLET_NOT_FOUND'] };
    }

    // Ledger-sum invariant over COMPLETED rows only. PENDING rows are holds,
    // not realized movements: a withdrawal reservation carries −amount while
    // the balance is untouched, so counting it would false-flag every wallet
    // with a pending withdrawal. The reservation row is finalized (and its
    // balanceAfter written) when the withdrawal is approved or rejected, at
    // which point it enters the sum exactly when the balance actually moved.
    const agg = await prisma.walletTransaction.aggregate({
      where: { walletId, status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const ledgerSum = Number(agg._sum.amount ?? 0);
    const balance = Number(wallet.balance);
    const reserved = Number(wallet.reserved);

    const issues: string[] = [];
    if (Math.abs(ledgerSum - balance) > 0.005) {
      issues.push(`LEDGER_MISMATCH: ledger sum ${ledgerSum.toFixed(2)} != balance ${balance.toFixed(2)}`);
    }
    if (balance < 0) issues.push(`NEGATIVE_BALANCE: ${balance.toFixed(2)}`);
    if (reserved < 0) issues.push(`NEGATIVE_RESERVED: ${reserved.toFixed(2)}`);
    if (reserved > balance) {
      issues.push(`RESERVED_EXCEEDS_BALANCE: reserved ${reserved.toFixed(2)} > balance ${balance.toFixed(2)}`);
    }

    // Chain integrity: latest ledger row must reflect the current balance.
    const last = await prisma.walletTransaction.findFirst({
      where: { walletId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, balanceAfter: true },
    });
    if (last && Math.abs(Number(last.balanceAfter) - balance) > 0.005) {
      issues.push(`CHAIN_BREAK: last ledger balanceAfter ${Number(last.balanceAfter).toFixed(2)} != balance ${balance.toFixed(2)}`);
    }

    return { walletId, balance, reserved, ledgerSum, consistent: issues.length === 0, issues };
  }

  /**
   * Full sweep (bounded): check every wallet, raise FINANCIAL alerts for any
   * inconsistent one. Intended for a periodic job — cheap enough on SQLite
   * at thousands of wallets; on Postgres at scale, run off-hours or shard.
   */
  async reconcileAll(maxWallets = 5000): Promise<{
    checked: number;
    inconsistent: number;
    flagged: string[];
  }> {
    const wallets = await prisma.wallet.findMany({
      select: { id: true },
      take: maxWallets,
    });

    const flagged: string[] = [];
    for (const w of wallets) {
      const report = await this.checkWallet(w.id);
      if (!report.consistent) {
        flagged.push(report.walletId);
        await prisma.adminAlert.upsert({
          where: { dedupeKey: `fin:reconcile:${report.walletId}` },
          create: {
            dedupeKey: `fin:reconcile:${report.walletId}`,
            category: 'FINANCIAL',
            severity: 'CRITICAL',
            title: `Financial inconsistency: wallet ${report.walletId}`,
            message: report.issues.join(' • '),
            metadata: JSON.stringify(report),
          },
          update: {
            message: report.issues.join(' • '),
            metadata: JSON.stringify(report),
          },
        }).catch(() => undefined);
      } else {
        // Consistent again? Resolve any prior flag (recurrence-safe).
        await prisma.adminAlert.updateMany({
          where: { dedupeKey: `fin:reconcile:${report.walletId}`, isResolved: false },
          data: { isResolved: true, resolvedAt: new Date(), resolvedBy: 'reconciliation' },
        });
      }
    }

    return { checked: wallets.length, inconsistent: flagged.length, flagged };
  }
}

export const reconciliationService = new ReconciliationService();

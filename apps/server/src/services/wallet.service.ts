import prisma from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType } from '../shared/types';

export class WalletService {
  async getWallet(userId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: Number(wallet.balance),
      reserved: Number(wallet.reserved),
      currency: wallet.currency,
      createdAt: wallet.createdAt.toISOString(),
      updatedAt: wallet.updatedAt.toISOString(),
    };
  }

  async getBalance(userId: string): Promise<{ balance: number; currency: string }> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return {
      balance: Number(wallet.balance),
      currency: wallet.currency,
    };
  }

  async getWalletId(userId: string): Promise<string> {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return wallet.id;
  }

  async debit(
    userId: string,
    amount: number,
    type: TransactionType,
    description: string,
    referenceId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const currentBalance = Number(wallet.balance);
      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      const newBalance = new Decimal(currentBalance).sub(new Decimal(amount));

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: new Decimal(-amount),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description,
          referenceId,
        },
      });

      return {
        balance: Number(updatedWallet.balance),
        transaction: {
          id: transaction.id,
          type: transaction.type,
          amount: Number(transaction.amount),
          balanceBefore: Number(transaction.balanceBefore),
          balanceAfter: Number(transaction.balanceAfter),
          description: transaction.description,
          createdAt: transaction.createdAt.toISOString(),
        },
      };
    });
  }

  async credit(
    userId: string,
    amount: number,
    type: TransactionType,
    description: string,
    referenceId?: string
  ) {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
      });

      if (!wallet) {
        throw new Error('Wallet not found');
      }

      const currentBalance = Number(wallet.balance);
      const newBalance = new Decimal(currentBalance).add(new Decimal(amount));

      const updatedWallet = await tx.wallet.update({
        where: { userId },
        data: { balance: newBalance },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type,
          amount: new Decimal(amount),
          balanceBefore: new Decimal(currentBalance),
          balanceAfter: newBalance,
          description,
          referenceId,
        },
      });

      return {
        balance: Number(updatedWallet.balance),
        transaction: {
          id: transaction.id,
          type: transaction.type,
          amount: Number(transaction.amount),
          balanceBefore: Number(transaction.balanceBefore),
          balanceAfter: Number(transaction.balanceAfter),
          description: transaction.description,
          createdAt: transaction.createdAt.toISOString(),
        },
      };
    });
  }

  async getTransactions(userId: string, limit = 20, offset = 0) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return transactions.map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      balanceBefore: t.balanceBefore,
      balanceAfter: t.balanceAfter,
      description: t.description,
      referenceId: t.referenceId,
      createdAt: t.createdAt.toISOString(),
    }));
  }
}

export const walletService = new WalletService();

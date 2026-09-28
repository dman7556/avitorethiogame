import prisma from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export class PaymentMethodsService {
  /**
   * Get all payment methods
   */
  async getAllPaymentMethods(includeDisabled = false) {
    const where = includeDisabled ? {} : { enabled: true };

    const methods = await prisma.paymentMethod.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return methods.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      enabled: m.enabled,
      account: m.account,
      instructions: m.instructions,
      minAmount: Number(m.minAmount),
      maxAmount: Number(m.maxAmount),
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    }));
  }

  /**
   * Get payment method by ID
   */
  async getPaymentMethodById(id: string) {
    const method = await prisma.paymentMethod.findUnique({
      where: { id },
    });

    if (!method) {
      throw new Error('Payment method not found');
    }

    return {
      id: method.id,
      name: method.name,
      type: method.type,
      enabled: method.enabled,
      account: method.account,
      instructions: method.instructions,
      minAmount: Number(method.minAmount),
      maxAmount: Number(method.maxAmount),
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }

  /**
   * Get payment method by type (TELEBIRR, CBE, etc.)
   */
  async getPaymentMethodByType(type: string, enabledOnly = true) {
    const where: any = { type };
    if (enabledOnly) {
      where.enabled = true;
    }

    const method = await prisma.paymentMethod.findFirst({
      where,
    });

    if (!method) {
      return null;
    }

    return {
      id: method.id,
      name: method.name,
      type: method.type,
      enabled: method.enabled,
      account: method.account,
      instructions: method.instructions,
      minAmount: Number(method.minAmount),
      maxAmount: Number(method.maxAmount),
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }

  /**
   * Create payment method
   */
  async createPaymentMethod(data: {
    name: string;
    type: string;
    account: string;
    instructions: string;
    minAmount?: number;
    maxAmount?: number;
    enabled?: boolean;
    createdBy?: string;
  }) {
    // Check if type already exists
    const existing = await prisma.paymentMethod.findFirst({
      where: { type: data.type },
    });

    if (existing) {
      throw new Error(`Payment method type '${data.type}' already exists`);
    }

    const method = await prisma.paymentMethod.create({
      data: {
        name: data.name,
        type: data.type,
        account: data.account,
        instructions: data.instructions,
        minAmount: new Decimal(data.minAmount || 200),
        maxAmount: new Decimal(data.maxAmount || 10000),
        enabled: data.enabled !== false,
        updatedBy: data.createdBy,
      },
    });

    return {
      id: method.id,
      name: method.name,
      type: method.type,
      enabled: method.enabled,
      account: method.account,
      instructions: method.instructions,
      minAmount: Number(method.minAmount),
      maxAmount: Number(method.maxAmount),
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }

  /**
   * Update payment method
   */
  async updatePaymentMethod(
    id: string,
    data: {
      account?: string;
      instructions?: string;
      minAmount?: number;
      maxAmount?: number;
      enabled?: boolean;
      updatedBy?: string;
    }
  ) {
    const updateData: any = {};

    if (data.account) updateData.account = data.account;
    if (data.instructions) updateData.instructions = data.instructions;
    if (data.minAmount) updateData.minAmount = new Decimal(data.minAmount);
    if (data.maxAmount) updateData.maxAmount = new Decimal(data.maxAmount);
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.updatedBy) updateData.updatedBy = data.updatedBy;

    const method = await prisma.paymentMethod.update({
      where: { id },
      data: updateData,
    });

    return {
      id: method.id,
      name: method.name,
      type: method.type,
      enabled: method.enabled,
      account: method.account,
      instructions: method.instructions,
      minAmount: Number(method.minAmount),
      maxAmount: Number(method.maxAmount),
      createdAt: method.createdAt.toISOString(),
      updatedAt: method.updatedAt.toISOString(),
    };
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(id: string) {
    await prisma.paymentMethod.delete({
      where: { id },
    });
  }

  /**
   * Seed default payment methods (admin helper)
   */
  async seedDefaultPaymentMethods() {
    const existing = await prisma.paymentMethod.count();
    if (existing > 0) {
      console.log('[PAYMENT_METHODS] Default methods already exist');
      return;
    }

    const methods = [
      {
        name: 'Telebirr',
        type: 'TELEBIRR',
        account: '09XXXXXXXX',
        instructions: 'Send the exact amount to the Telebirr account below. Use your phone to send via Telebirr app.',
        minAmount: new Decimal(200),
        maxAmount: new Decimal(10000),
        enabled: true,
      },
      {
        name: 'CBE Bank',
        type: 'CBE',
        account: 'XXXXXXXXXX',
        instructions: 'Transfer the exact amount to the CBE bank account below. Include your username in the transfer note.',
        minAmount: new Decimal(200),
        maxAmount: new Decimal(10000),
        enabled: true,
      },
    ];

    for (const method of methods) {
      await prisma.paymentMethod.create({ data: method });
      console.log(`[PAYMENT_METHODS] Created: ${method.name}`);
    }
  }
}

export const paymentMethodsService = new PaymentMethodsService();

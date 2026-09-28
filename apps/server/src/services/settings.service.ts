import prisma from '../lib/prisma';
import { GAME_CONSTANTS, PaymentMethod, SystemSettings } from '@sky-rush/shared';

const DEFAULT_SETTINGS: SystemSettings = {
  minimumDeposit: GAME_CONSTANTS.MINIMUM_DEPOSIT,
  maximumDeposit: GAME_CONSTANTS.DEFAULT_MAXIMUM_DEPOSIT,
  minimumRemainingBalance: GAME_CONSTANTS.MINIMUM_REMAINING_BALANCE,
  paymentMethods: {
    [PaymentMethod.TELEBIRR]: {
      enabled: true,
      displayName: 'Telebirr',
      instructions: 'Send payment to the account below and upload your transaction screenshot.',
      accountInfo: 'Please configure Telebirr account information in admin settings.',
    },
    [PaymentMethod.CBE]: {
      enabled: true,
      displayName: 'Commercial Bank of Ethiopia (CBE)',
      instructions: 'Transfer to the account below and upload your transaction screenshot.',
      accountInfo: 'Please configure CBE account information in admin settings.',
    },
  },
};

export class SettingsService {
  /**
   * Get system settings
   */
  async getSettings(): Promise<SystemSettings> {
    try {
      const settings = await prisma.systemSetting.findMany();
      
      if (settings.length === 0) {
        // Initialize default settings
        await this.initializeDefaultSettings();
        return DEFAULT_SETTINGS;
      }

      // Parse settings from database
      const parsed: any = { ...DEFAULT_SETTINGS };
      
      for (const setting of settings) {
        try {
          const value = JSON.parse(setting.value);
          
          if (setting.key === 'minimumDeposit') parsed.minimumDeposit = value;
          else if (setting.key === 'maximumDeposit') parsed.maximumDeposit = value;
          else if (setting.key === 'minimumRemainingBalance') parsed.minimumRemainingBalance = value;
          else if (setting.key === 'paymentMethods') parsed.paymentMethods = value;
        } catch (error) {
          console.error(`[SETTINGS] Failed to parse setting ${setting.key}:`, error);
        }
      }

      return parsed;
    } catch (error) {
      console.error('[SETTINGS] Failed to get settings:', error);
      return DEFAULT_SETTINGS;
    }
  }

  /**
   * Initialize default settings
   */
  private async initializeDefaultSettings() {
    try {
      const settingPromises = [
        {
          key: 'minimumDeposit',
          value: JSON.stringify(DEFAULT_SETTINGS.minimumDeposit),
        },
        {
          key: 'maximumDeposit',
          value: JSON.stringify(DEFAULT_SETTINGS.maximumDeposit),
        },
        {
          key: 'minimumRemainingBalance',
          value: JSON.stringify(DEFAULT_SETTINGS.minimumRemainingBalance),
        },
        {
          key: 'paymentMethods',
          value: JSON.stringify(DEFAULT_SETTINGS.paymentMethods),
        },
      ];

      for (const setting of settingPromises) {
        await prisma.systemSetting.upsert({
          where: { key: setting.key },
          update: { value: setting.value },
          create: setting,
        });
      }

      console.log('[SETTINGS] Initialized default settings');
    } catch (error) {
      console.error('[SETTINGS] Failed to initialize settings:', error);
    }
  }

  /**
   * Update a setting
   */
  async updateSetting(key: string, value: any, updatedBy: string) {
    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedBy,
      },
      create: {
        key,
        value: JSON.stringify(value),
        updatedBy,
      },
    });

    console.log(`[SETTINGS] Updated ${key} by ${updatedBy}`);

    return setting;
  }

  /**
   * Update multiple settings
   */
  async updateSettings(updates: Partial<SystemSettings>, updatedBy: string) {
    const promises: Promise<any>[] = [];

    if (updates.minimumDeposit !== undefined) {
      promises.push(this.updateSetting('minimumDeposit', updates.minimumDeposit, updatedBy));
    }
    if (updates.maximumDeposit !== undefined) {
      promises.push(this.updateSetting('maximumDeposit', updates.maximumDeposit, updatedBy));
    }
    if (updates.minimumRemainingBalance !== undefined) {
      promises.push(this.updateSetting('minimumRemainingBalance', updates.minimumRemainingBalance, updatedBy));
    }
    if (updates.paymentMethods !== undefined) {
      promises.push(this.updateSetting('paymentMethods', updates.paymentMethods, updatedBy));
    }

    await Promise.all(promises);

    return this.getSettings();
  }

  /**
   * Get payment method configuration
   */
  async getPaymentMethodConfig(method: PaymentMethod) {
    const settings = await this.getSettings();
    return settings.paymentMethods[method];
  }

  /**
   * Check if payment method is enabled
   */
  async isPaymentMethodEnabled(method: PaymentMethod): Promise<boolean> {
    const config = await this.getPaymentMethodConfig(method);
    return (config?.enabled as boolean) || false;
  }
}

export const settingsService = new SettingsService();

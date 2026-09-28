import { env } from '../lib/env';
import bcrypt from 'bcryptjs';
import type { AuthTokenPayload, UserProfile } from '../shared/types';
import {
  supabaseSignIn,
  supabaseAdminCreateUser,
  supabaseAdminGetUserByEmail,
  supabaseAdminDeleteUser,
  supabaseAdminListUsers,
} from '../lib/supabase-auth';
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyCode,
  generateCodeExpiry,
  isCodeExpired,
} from '../lib/verification-code';
import { emailService } from './email.service';
import prisma from '../lib/prisma';

// Signup bonus credited to every new user's wallet at registration (ETB)
export const SIGNUP_BONUS = 20;

export class AuthService {
  /**
   * Register a new user via Supabase Admin API (no email verification)
   */
  async register(name: string, email: string, phone: string, password: string) {
    // Validate phone format
    const phoneDigitsOnly = phone.replace(/\D/g, '');
    if (phoneDigitsOnly.length < 9) {
      throw new Error('Phone number must have at least 9 digits');
    }

    // Check for existing user by phone in local DB
    const existingPhone = await prisma.user.findUnique({ where: { phone } });
    if (existingPhone) {
      throw new Error('Phone number already registered');
    }

    // Check for existing user by email in local DB
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new Error('A user with this email address has already been registered');
    }

    // Check if email exists in Supabase but not in local DB (orphaned user)
    // If so, delete it to allow re-registration
    const existingSupabaseUser = await supabaseAdminGetUserByEmail(email);
    if (existingSupabaseUser && existingSupabaseUser.id) {
      console.log('[AuthService] Found orphaned Supabase user for email:', email, '— deleting...');
      await supabaseAdminDeleteUser(existingSupabaseUser.id);
    }

    // Create user in Supabase via Admin API (email_confirm = true, no verification needed)
    // Supabase will return an error if the email already exists
    const result = await supabaseAdminCreateUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, phone, role: 'USER' },
    });

    console.log('[AuthService] Supabase signup result:', JSON.stringify(result, null, 2));

    if (result?.error || result?.code) {
      const rawMsg = result.error?.message || result.msg || '';
      // Make Supabase duplicate-email errors user-friendly
      if (rawMsg.includes('already') || rawMsg.includes('already been registered') || result.code === '23505') {
        throw new Error('A user with this email address has already been registered');
      }
      throw new Error(rawMsg || 'Registration failed');
    }

    const supabaseUser = result?.user || result;
    const userId = supabaseUser?.id;

    if (!userId) {
      throw new Error('Registration failed — no user returned');
    }

    // Create local user (for our DB queries)
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: supabaseUser.user_metadata?.name || name,
        email: supabaseUser.email || email,
        phone,
        password: 'supabase-auth',
        role: 'USER',
        isActive: true,
        emailVerified: true,
        wallet: {
          create: { balance: SIGNUP_BONUS }, // signup bonus (20 ETB)
        },
      },
    });

    // Create transaction record for signup bonus
    const wallet = await prisma.wallet.findUnique({
      where: { userId: user.id },
    });

    if (wallet) {
      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'INITIAL_BALANCE',
          amount: SIGNUP_BONUS,
          balanceBefore: 0,
          balanceAfter: SIGNUP_BONUS,
          description: `Signup bonus - ${SIGNUP_BONUS} ETB`,
          status: 'COMPLETED',
        },
      });
    }

    // Login via Supabase to get token
    const loginResult = await supabaseSignIn({ email, password });
    const token = loginResult?.access_token;

    if (!token) {
      // User created but can't auto-login — return without token
      return {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      };
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      token,
    };
  }

  /**
   * Login via Supabase Auth
   */
  async login(email: string, password: string) {
    const result = await supabaseSignIn({ email, password });

    console.log('[AuthService] Supabase login result:', JSON.stringify({ ...result, access_token: result?.access_token ? '[REDACTED]' : null }));

    if (result?.error) {
      const msg = result.error?.message || result.msg || 'Invalid email or password';
      throw new Error(msg);
    }

    const accessToken = result?.access_token;
    const supabaseUser = result?.user;

    if (!accessToken || !supabaseUser?.id) {
      throw new Error('Invalid email or password');
    }

    // Find or create user in our DB
    let user = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    if (!user) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      
      if (existingUser) {
        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: { 
            emailVerified: true,
            lastLogin: new Date(),
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            id: supabaseUser.id,
            name: supabaseUser.user_metadata?.name || email.split('@')[0],
            email,
            phone: supabaseUser.user_metadata?.phone || `+${supabaseUser.id.slice(0, 12)}`,
            password: 'supabase-auth',
            role: supabaseUser.user_metadata?.role || 'USER',
            isActive: true,
            emailVerified: true,
            wallet: {
              create: { balance: 0 },
            },
          },
        });
      }
    }

    if (!user.isActive) {
      throw new Error('Account is suspended');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      token: accessToken,
    };
  }

  /**
   * Profile completion (audit M5): set the phone on an auto-created user whose
   * phone is still null. Refuses to overwrite an existing phone — changing
   * contact info needs its own verified flow, and the unique constraint backs
   * the "already registered" check at the storage layer.
   * @returns the normalized phone that was stored
   * @throws Error('PHONE_ALREADY_SET') / Error('PHONE_TAKEN') as coded failures
   */
  async setPhoneIfUnset(userId: string, rawPhone: string): Promise<string> {
    const digits = rawPhone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('251')
      ? `+${digits}`
      : `+251${digits.replace(/^0/, '')}`;

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    if (!existing) throw new Error('User not found');
    if (existing.phone) throw new Error('PHONE_ALREADY_SET');

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { phone: normalizedPhone },
      });
    } catch (updateError: any) {
      if (updateError?.code === 'P2002' && updateError?.meta?.target?.includes('phone')) {
        throw new Error('PHONE_TAKEN');
      }
      throw updateError;
    }
    return normalizedPhone;
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      balance: wallet ? Number(wallet.balance) : 0,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Verify email with 6-digit code
   */
  async verifyEmail(email: string, code: string) {
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: {
        id: true, name: true, email: true, role: true,
        emailVerified: true, verificationCode: true,
        verificationCodeExpiry: true, createdAt: true, updatedAt: true,
      }
    });

    if (!user) throw new Error('User not found');
    if (user.emailVerified) throw new Error('Email already verified');
    if (!user.verificationCode || !user.verificationCodeExpiry) {
      throw new Error('No verification code found. Please request a new one.');
    }
    if (isCodeExpired(user.verificationCodeExpiry)) {
      throw new Error('Verification code has expired. Please request a new one.');
    }

    const isValid = await verifyCode(code, user.verificationCode);
    if (!isValid) throw new Error('Invalid verification code');

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verificationCode: null, verificationCodeExpiry: null },
    });

    return {
      user: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        emailVerified: true, createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      message: 'Email verified successfully.',
    };
  }

  /**
   * Resend verification code
   */
  async resendVerificationCode(email: string) {
    const user = await prisma.user.findUnique({ 
      where: { email },
      select: { id: true, name: true, email: true, emailVerified: true }
    });

    if (!user) throw new Error('User not found');
    if (user.emailVerified) throw new Error('Email already verified');

    const verificationCode = generateVerificationCode();
    const hashedCode = await hashVerificationCode(verificationCode);
    const codeExpiry = generateCodeExpiry();

    await prisma.user.update({
      where: { id: user.id },
      data: { verificationCode: hashedCode, verificationCodeExpiry: codeExpiry },
    });

    try {
      await emailService.sendVerificationCode(email, verificationCode, user.name);
    } catch (error) {
      console.error('[AuthService] Failed to send verification email:', error);
      throw new Error('Failed to send verification email. Please try again.');
    }

    return { sent: true };
  }

  /**
   * Request password reset via 6-digit code
   */
  async requestPasswordReset(email: string) {
    // Check if user exists in Supabase first
    const supabaseUser = await supabaseAdminGetUserByEmail(email.toLowerCase());
    if (!supabaseUser) {
      throw new Error('NO_ACCOUNT');
    }

    // Also ensure local DB record exists
    let user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) {
      throw new Error('NO_ACCOUNT');
    }

    const code = generateVerificationCode();
    const hashedCode = await hashVerificationCode(code);
    const expiry = generateCodeExpiry();

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode: hashedCode, resetCodeExpiry: expiry }
    });

    try {
      await emailService.sendPasswordResetCode(email, code, user.name);
    } catch (error) {
      console.error('[Auth Service] Failed to send password reset email:', error);
      await prisma.user.update({
        where: { id: user.id },
        data: { resetCode: null, resetCodeExpiry: null }
      });
      throw new Error('Failed to send reset code');
    }

    return { sent: true };
  }

  /**
   * Verify password reset code
   */
  async verifyResetCode(email: string, code: string) {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.resetCode || !user.resetCodeExpiry) {
      throw new Error('Invalid or expired reset code');
    }

    if (isCodeExpired(user.resetCodeExpiry)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { resetCode: null, resetCodeExpiry: null }
      });
      throw new Error('Reset code has expired');
    }

    const isValid = await verifyCode(code, user.resetCode);
    if (!isValid) throw new Error('Invalid reset code');

    return { valid: true, userId: user.id };
  }

  /**
   * Reset password with verified code
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    const verification = await this.verifyResetCode(email, code);
    if (!verification.valid) throw new Error('Invalid reset code');

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    });

    if (!user) throw new Error('User not found');

    // Hash the new password for local storage
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetCode: null,
        resetCodeExpiry: null,
        updatedAt: new Date()
      }
    });

    return { success: true };
  }
}

export const authService = new AuthService();

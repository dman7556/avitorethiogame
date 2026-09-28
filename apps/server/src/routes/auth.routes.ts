import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth.service';
import { depositService } from '../services/deposit.service';
import { withdrawalService } from '../services/withdrawal.service';
import { authenticate, AuthRequest } from '../middleware/auth';
import { friendlyError } from '../lib/format-error';
import prisma from '../lib/prisma';
import { trackEvent } from '../analytics/event-pipeline';

const router = Router();

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(60, 'Name too long')
    // Unicode letters, spaces, apostrophes, hyphens, periods; no control chars
    .regex(/^[\p{L}\p{M} '.-]+$/u, 'Name contains invalid characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Invalid email')
    .max(254, 'Email too long'),
  // Ethiopian format: +2519XXXXXXXX / 09XXXXXXXX / +2517XXXXXXXX / 07XXXXXXXX
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+251|251|0)?(9|7)\d{8}$/, 'Invalid Ethiopian phone number'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long')
    .regex(/[a-zA-Z]/, 'Password must contain a letter')
    .regex(/\d/, 'Password must contain a number'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email'),
  password: z.string().min(1, 'Password is required').max(128),
});

// Profile completion (audit M5): users auto-created from Supabase without a
// phone number must supply a real one before phone-based flows can run.
const completeProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+251|251|0)?(9|7)\d{8}$/, 'Invalid Ethiopian phone number'),
});

const verifyEmailSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

const resendCodeSchema = z.object({
  email: z.string().email('Invalid email'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
});

const verifyResetCodeSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email'),
  code: z.string().length(6, 'Code must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const body = registerSchema.parse(req.body);
    // Normalize phone to +2519XXXXXXXX / +2517XXXXXXXX before uniqueness checks
    const digits = body.phone.replace(/\D/g, '');
    const normalizedPhone = digits.startsWith('251')
      ? `+${digits}`
      : `+251${digits.replace(/^0/, '')}`;
    const result = await authService.register(body.name, body.email, normalizedPhone, body.password);
    trackEvent({
      eventType: 'USER_REGISTERED',
      userId: result?.user?.id ?? null,
      requestId: (req as any).requestId ?? null,
      metadata: { hasToken: !!result?.token },
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.email, body.password);
    trackEvent({
      eventType: 'USER_LOGIN',
      userId: result?.user?.id ?? null,
      requestId: (req as any).requestId ?? null,
      metadata: { channel: 'password' },
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    // Handle EMAIL_NOT_VERIFIED specially
    if (error.code === 'EMAIL_NOT_VERIFIED') {
      res.status(403).json({ 
        success: false, 
        error: 'Please verify your email first. Check your inbox for the verification code.',
        code: 'EMAIL_NOT_VERIFIED',
        email: error.email,
      });
      return;
    }
    const message = friendlyError(error);
    // ── SECURITY ANALYTICS: failed-login signal (no password/token logged) ──
    trackEvent({
      eventType: 'AUTH_FAILED_LOGIN',
      requestId: (req as any).requestId ?? null,
      metadata: { ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? null },
    });
    res.status(401).json({ success: false, error: message });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const profile = await authService.getUserProfile(req.user.userId);
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

// Complete profile with a real phone number (audit M5). Auto-created users
// have phone = null; this is the only path that sets it. Phone-based flows
// (withdrawals to phone accounts, phone lookup) should treat null phone as
// profile-incomplete and direct the user here first.
router.put('/me/phone', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const body = completeProfileSchema.parse(req.body);

    // Setting a phone is profile completion, not phone-changing (see
    // authService.setPhoneIfUnset). Map coded failures to 409s.
    let normalizedPhone: string;
    try {
      normalizedPhone = await authService.setPhoneIfUnset(req.user.userId, body.phone);
    } catch (phoneError: any) {
      if (phoneError?.message === 'PHONE_ALREADY_SET' || phoneError?.message === 'PHONE_TAKEN') {
        res.status(409).json({
          success: false,
          error:
            phoneError.message === 'PHONE_ALREADY_SET'
              ? 'Phone number already set'
              : 'This phone number is already registered',
          code: phoneError.message,
        });
        return;
      }
      throw phoneError;
    }

    res.json({ success: true, data: { phone: normalizedPhone } });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

// ---- Email Verification Routes ----

// Verify email with 6-digit code
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const body = verifyEmailSchema.parse(req.body);
    const result = await authService.verifyEmail(body.email, body.code);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

// Resend verification code
router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const body = resendCodeSchema.parse(req.body);
    const result = await authService.resendVerificationCode(body.email);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

// ---- Password Reset Routes ----

// Request password reset code
router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(body.email);
    res.json({ 
      success: true, 
      message: 'A reset code has been sent to your email.' 
    });
  } catch (error: any) {
    if (error.message === 'NO_ACCOUNT') {
      res.status(404).json({ 
        success: false, 
        error: 'NO_ACCOUNT',
        message: 'No account found with this email. Please sign up first.' 
      });
      return;
    }
    const message = friendlyError(error);
    res.status(500).json({ success: false, error: message });
  }
});

// Verify password reset code
router.post('/verify-reset-code', async (req: Request, res: Response) => {
  try {
    const body = verifyResetCodeSchema.parse(req.body);
    const result = await authService.verifyResetCode(body.email, body.code);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

// Reset password with verified code
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(body.email, body.code, body.newPassword);
    res.json({ success: true, data: result });
  } catch (error: any) {
    const message = friendlyError(error);
    res.status(400).json({ success: false, error: message });
  }
});

// Get user profile with statistics
router.get('/me/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const userId = req.user.userId;

    // Get user with wallet
    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    // Ensure user has a wallet (create if missing)
    if (!user.wallet) {
      console.log(`[AUTH] User ${userId} has no wallet - creating one now`);
      const wallet = await prisma.wallet.create({
        data: {
          userId,
          balance: 0,
        },
      });
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
        },
      });
    }

    if (!user) {
      res.status(500).json({ success: false, error: 'Failed to load user' });
      return;
    }

    // Get statistics
    const [totalDeposits, totalWithdrawals, bets, winnings] = await Promise.all([
      await depositService.getUserTotalDeposits(userId),
      await withdrawalService.getUserTotalWithdrawals(userId),
      prisma.bet.aggregate({
        where: { userId, status: { in: ['ACTIVE', 'CASHED_OUT', 'LOST'] } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.bet.aggregate({
        where: { userId, status: 'CASHED_OUT' },
        _sum: { payout: true },
      }),
    ]);

    const totalWagered = Number(bets._sum.amount) || 0;
    const totalWinnings = Number(winnings._sum.payout) || 0;
    const totalLosses = totalWagered - totalWinnings;

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          lastLogin: user.lastLogin?.toISOString(),
        },
        wallet: user.wallet
          ? {
              balance: Number(user.wallet.balance),
              reserved: Number(user.wallet.reserved),
              currency: user.wallet.currency,
            }
          : null,
        statistics: {
          totalDeposits,
          totalWithdrawals,
          totalBets: bets._count,
          totalWagered,
          totalWinnings,
          totalLosses,
          netProfit: totalWinnings - totalWagered,
        },
      },
    });
  } catch (error: any) {
    console.error('[AUTH] Get profile error:', error);
    res.status(500).json({ success: false, error: 'Failed to get profile' });
  }
});

export default router;

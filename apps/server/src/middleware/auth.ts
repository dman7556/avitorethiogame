import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { supabaseVerifyUser } from '../lib/supabase-auth';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    name: string;
    role: string;
  };
}

/**
 * Authentication middleware — verifies Supabase access token
 * and loads the user profile from our database.
 */
export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Browsers cannot attach Authorization headers to <img src="...">, so
    // IMAGE endpoints may accept the token as ?token= — but only on safe GET
    // requests, so a leaked URL token can never mutate state. All other
    // endpoints MUST use the Authorization header.
    const queryToken =
      req.method === 'GET' && typeof req.query.token === 'string'
        ? req.query.token
        : undefined;
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ') && !queryToken) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : queryToken!;

    // Verify token with Supabase
    const supabaseUser = await supabaseVerifyUser(token);

    if (supabaseUser?.code === 401 || supabaseUser?.error) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    const supabaseId = supabaseUser?.id;
    if (!supabaseId) {
      res.status(401).json({ success: false, error: 'Invalid token' });
      return;
    }

    // Find or create user in our database
    // First try to find by Supabase ID
    let user = await prisma.user.findUnique({
      where: { id: supabaseId },
      select: { id: true, name: true, role: true, isActive: true },
    });

    // If not found by ID, try to find by email (for pre-existing users created before Supabase migration)
    if (!user && supabaseUser.email) {
      user = await prisma.user.findUnique({
        where: { email: supabaseUser.email },
        select: { id: true, name: true, role: true, isActive: true },
      });
    }

    if (!user) {
      // Auto-create user in our DB from Supabase Auth data
      // SECURITY: role is ALWAYS 'USER' at creation. It is never taken from
      // user_metadata, which the client can influence. Elevation to ADMIN
      // happens only via a direct, audited database operation.
      const email = supabaseUser.email;
      const metadata = supabaseUser.user_metadata || {};

      try {
        user = await prisma.user.create({
          data: {
            id: supabaseId,
            name: metadata.name || email?.split('@')[0] || 'User',
            email: email || `${supabaseId}@supabase.local`,
            // No fabricated numbers (audit M5): if Supabase metadata has no
            // phone, store null. A real number is required via the
            // profile-completion endpoint before any phone-based flow runs.
            phone: metadata.phone || null,
            password: 'supabase-auth',
            role: 'USER',
            isActive: true,
            emailVerified: supabaseUser.confirmed_at ? true : false,
            wallet: {
              create: {
                balance: 0,
                reserved: 0,
              },
            },
          },
          select: { id: true, name: true, role: true, isActive: true },
        });
      } catch (createError: any) {
        // Handle unique constraint on email - user might exist with different ID
        if (createError?.code === 'P2002' && createError?.meta?.target?.includes('email')) {
          // Try to find user by email as last resort
          const existingUser = await prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, role: true, isActive: true },
          });
          if (existingUser) {
            user = existingUser;
          } else {
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, error: 'Account is suspended' });
      return;
    }

    req.user = {
      userId: user.id,
      name: user.name,
      role: user.role,
    };

    next();
  } catch (error) {
    console.error('[AUTH] Middleware error:', error);
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Admin access required' });
    return;
  }
  next();
}

export function requireRole(...roles: ('USER' | 'ADMIN')[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as 'USER' | 'ADMIN')) {
      res.status(403).json({ success: false, error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Maps technical errors to user-friendly messages.
 * Handles Zod validation errors, Prisma errors, and common auth errors.
 */

export function friendlyError(err: any): string {
  // ─── Zod validation errors ───────────────────────────
  if (err?.issues && Array.isArray(err.issues)) {
    const first = err.issues[0];
    const field = first.path?.[0] || 'field';

    const fieldNames: Record<string, string> = {
      email: 'Email',
      password: 'Password',
      name: 'Full name',
      phone: 'Phone number',
      code: 'Verification code',
      newPassword: 'New password',
    };

    const fieldName = fieldNames[field] || capitalize(String(field));

    switch (first.code) {
      case 'too_small':
        if (first.type === 'string') {
          return `${fieldName} must be at least ${first.minimum} characters`;
        }
        return `${fieldName} is too short`;
      case 'too_big':
        return `${fieldName} is too long`;
      case 'invalid_string':
        if (first.validation === 'email') return `Please enter a valid email address`;
        if (first.validation === 'url') return `Please enter a valid URL`;
        return `${fieldName} is invalid`;
      case 'invalid_type':
        if (first.received === 'undefined' || first.received === 'null') {
          return `${fieldName} is required`;
        }
        return `${fieldName} is invalid`;
      case 'custom':
        return first.message || `${fieldName} is invalid`;
      default:
        return `${fieldName} is invalid`;
    }
  }

  // ─── Supabase / Auth errors ──────────────────────────
  const msg = err?.message || String(err);

  if (msg.includes('Email already registered') || msg.includes('already registered')) {
    return 'This email is already registered. Try signing in instead.';
  }
  if (msg.includes('Phone number already registered')) {
    return 'This phone number is already registered.';
  }
  if (msg.includes('Invalid email or password') || msg.includes('Invalid login')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (msg.includes('Email not verified') || msg.includes('email_not_confirmed')) {
    return 'Please verify your email first. Check your inbox for the verification code.';
  }
  if (msg.includes('rate limit') || msg.includes('rate_limit')) {
    // Distinguish between our rate limiter and Supabase rate limiter
    if (msg.includes('email') || msg.includes('over_email')) {
      return 'Email service is temporarily busy. Please try again in a few minutes.';
    }
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (msg.includes('Password must')) {
    return msg; // Already friendly
  }
  if (msg.includes('Phone number must')) {
    return msg; // Already friendly
  }
  if (msg.includes('at least 2 characters')) {
    return 'Name must be at least 2 characters long.';
  }

  // ─── Fallback ────────────────────────────────────────
  if (msg.length < 100 && !msg.includes('{') && !msg.includes('[')) {
    return msg; // Short, simple message — pass through
  }

  return 'Something went wrong. Please try again.';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

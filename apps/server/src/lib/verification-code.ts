import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Generate a secure 6-digit verification code
 */
export function generateVerificationCode(): string {
  // Generate a cryptographically secure random number between 100000 and 999999
  const randomBytes = crypto.randomBytes(4);
  const randomNumber = randomBytes.readUInt32BE(0);
  const code = (randomNumber % 900000) + 100000; // Ensures 6 digits
  return code.toString();
}

/**
 * Hash a verification code for secure storage
 */
export async function hashVerificationCode(code: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(code, salt);
}

/**
 * Verify a code against its hash
 */
export async function verifyCode(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

/**
 * Generate code expiry time (10 minutes from now)
 */
export function generateCodeExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry;
}

/**
 * Check if a code has expired
 */
export function isCodeExpired(expiry: Date | null): boolean {
  if (!expiry) return true;
  return new Date() > expiry;
}

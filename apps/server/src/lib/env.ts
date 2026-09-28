import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Find .env by walking up from cwd
function findEnvFile(): string {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), '.env');
}

dotenv.config({ path: findEnvFile() });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  // Supabase
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: requireEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_KEY: requireEnv('SUPABASE_SERVICE_KEY'),
  SUPABASE_DB_URL: requireEnv('SUPABASE_DB_URL'),

  // Legacy (kept for Prisma)
  DATABASE_URL: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || process.env.SUPABASE_ANON_KEY || '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  PORT: parseInt(process.env.PORT || '8080', 10), // Use PORT from env or default to 8080
  NODE_ENV: process.env.NODE_ENV || 'development',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
  // CORS allow-list: CLIENT_URL plus any extra origins in CLIENT_URLS
  // (comma-separated). Production needs this because a Vercel frontend is
  // reachable under several origins (apex, www, preview deployments); the
  // default stays the single localhost dev origin. Socket.IO and Express CORS
  // must use the same list.
  CLIENT_URLS: [
    process.env.CLIENT_URL || 'http://localhost:5173',
    ...(process.env.CLIENT_URLS ? process.env.CLIENT_URLS.split(',').map((s) => s.trim()).filter(Boolean) : []),
  ],
  // Public origin of THIS backend (e.g. https://api.example.com). Used only to
  // absolutize legacy server-relative /uploads/... screenshot URLs so browsers
  // on the separately-hosted Vercel frontend load them from here instead of
  // 404ing against the Vercel filesystem. Empty = same-origin (local dev).
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  
  // Email configuration (optional — Supabase handles email)
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: process.env.EMAIL_PORT,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASSWORD: process.env.EMAIL_PASSWORD,
  EMAIL_FROM: process.env.EMAIL_FROM,

  // Cloudinary (screenshot storage)
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, ''),
};

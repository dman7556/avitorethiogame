import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './lib/env';
import { GameEngine } from './game/GameEngine';
import { setupSocketHandlers } from './socket/handler';
import { realtimeBridge } from './analytics/realtime-bridge';
import { metricsEngine } from './analytics/metrics-engine';
import { eventPipeline } from './analytics/event-pipeline';
import { requestObservability } from './middleware/observability';
import { cloudinaryService, LOCAL_UPLOADS_ROOT } from './services/cloudinary.service';

// Routes
import authRoutes from './routes/auth.routes';
import walletRoutes from './routes/wallet.routes';
import roundRoutes from './routes/round.routes';
import betRoutes from './routes/bet.routes';
import adminRoutes from './routes/admin.routes';
import depositRoutes from './routes/deposit.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import notificationRoutes from './routes/notifications.routes';

async function main() {
  const app = express();
  const httpServer = createServer(app);

  // Behind exactly one reverse proxy in production (nginx on the Oracle VM
  // terminating TLS). Required so express-rate-limit keys on the real client
  // IP (X-Forwarded-For) instead of the proxy IP — without it, every client
  // shares the proxy's bucket and the API throttles everyone as one user.
  // Express 5 validates this against the socket chain, so spoofed headers
  // from direct connections can't poison it.
  app.set('trust proxy', 1);

  // CORS allow-list: CLIENT_URL + CLIENT_URLS (comma-separated extras). Needed
  // because the Vercel frontend is legitimately reachable under several
  // origins (production domain, www, preview deployments). Still a strict
  // allow-list — no wildcards, unknown origins are rejected.
  const corsOrigin = (origin: string | undefined, cb: (err: Error | null, ok?: boolean) => void) => {
    if (!origin) return cb(null, true); // curl / server-to-server / health checks
    if (env.CLIENT_URLS.includes(origin)) return cb(null, true);
    cb(new Error(`Origin not allowed by CORS: ${origin}`));
  };

  // Socket.IO
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Middleware
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
  }));
  // 1MB JSON cap — the API has no legitimate use for larger bodies; uploads
  // are multipart and capped separately by multer.
  app.use(express.json({ limit: '1mb' }));
  app.use(requestObservability);

  // Make io available on app (for routes to access)
  app.locals.io = io;

  // Analytics realtime bridge + metrics engine
  realtimeBridge.attach(io);
  metricsEngine.start();

  // Rate limiting (skip registration endpoint)
  const limiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests' },
    skip: (req) => {
      // Skip rate limiting for registration
      if (req.method === 'POST' && req.path === '/api/auth/register') return true;
      return false;
    },
  });
  app.use('/api/', limiter);

  // Minimal security headers (helmet covers the rest). XCTO blocks naive
  // file-upload-then-browse XSS; frameguard is already in helmet's defaults.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/rounds', roundRoutes);
  app.use('/api/bets', betRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/deposits', depositRoutes);
  app.use('/api/withdrawals', withdrawalRoutes);
  app.use('/api/notifications', notificationRoutes);

  // Serve uploaded files
  // ── Legacy local uploads (audit L4) ──
  // Cloudinary now stores new deposit screenshots, but this route is NOT dead:
  // (a) legacy DB rows still reference /uploads/... URLs, and (b)
  // cloudinary.service's no-credentials fallback writes files into
  // <cwd>/uploads/deposits and returns /uploads/... URLs that rely on it.
  // Hardened: rooted at the app directory via __dirname (immune to a drifting
  // cwd), immutable+indexless, and dotfile-blind. express.static already
  // normalizes and rejects .. traversal outside the root — this only pins the
  // root and the RFC 6648 dotfile behavior.
  // Rooted at the directory the uploader actually writes to (see
  // cloudinary.service) rather than a second, independently-resolved
  // __dirname path — write and read must not be able to disagree.
  app.use(
    '/uploads',
    express.static(LOCAL_UPLOADS_ROOT, {
      index: false,
      dotfiles: 'ignore',
      immutable: true,
      maxAge: '1d',
    })
  );

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Unknown /api route → structured 404 (never a SPA fallback leaking stack traces)
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Not found', code: 'NOT_FOUND' });
  });

  // ── Global error handler — LAST middleware. ──
  // Converts thrown errors (multer, body-parser, unexpected) into structured
  // responses without leaking stack traces or internal details.
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status =
      err?.type === 'entity.too.large' ? 413
      : err?.type === 'entity.parse.failed' ? 400
      : err?.message?.includes('Invalid file type') ? 400
      : err?.code === 'LIMIT_FILE_SIZE' ? 413
      : 500;
    if (status >= 500) {
      console.error('[ERROR]', req.requestId ?? '-', err?.stack || err);
    }
    res.status(status).json({
      success: false,
      error:
        status === 413 ? 'Payload too large'
        : status === 400 && err?.type === 'entity.parse.failed' ? 'Malformed JSON body'
        : status === 400 ? err?.message || 'Invalid request'
        : 'Internal server error',
      requestId: req.requestId,
    });
  });

  // Game engine
  const gameEngine = new GameEngine(io);

  try {
    await gameEngine.initialize();
    setupSocketHandlers(io, gameEngine);

    // Where deposit evidence will be stored. Printed once at boot so a
    // misconfigured host is obvious in the logs instead of showing up later as
    // "the admin can't see the screenshot". Never logs the credentials.
    const storageMode = cloudinaryService.storageMode;
    console.log(`[STORAGE] Deposit screenshots → ${storageMode}`);
    if (storageMode === 'local-disk') {
      console.warn(
        `[STORAGE] Cloudinary is NOT configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / ` +
          `CLOUDINARY_API_SECRET). Uploads will be written to ${LOCAL_UPLOADS_ROOT} and served from ` +
          `/uploads. On an ephemeral host like Render these files can disappear on redeploy.`
      );
    }

    // Start HTTP server first
    httpServer.listen(env.PORT, '0.0.0.0', async () => {
      console.log(`🚀 Aviator server running on http://localhost:${env.PORT}`);
      console.log(`📡 Socket.IO ready`);
      console.log(`🎮 Game engine starting...`);

      // Start the game loop (non-blocking — runs in background)
      gameEngine.start().catch((err) => {
        console.error('[GameEngine] Fatal error:', err);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    gameEngine.stop();
    metricsEngine.stop();
    void eventPipeline.shutdown().finally(() => {
      io.close();
      httpServer.close(() => {
        process.exit(0);
      });
    });
  });
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

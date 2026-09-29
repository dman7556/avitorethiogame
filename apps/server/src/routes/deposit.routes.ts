import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { finLog } from '../lib/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { authenticate, AuthRequest } from '../middleware/auth';
import { depositService, DepositError } from '../services/deposit.service';
import { uploadService, UploadError } from '../services/upload.service';
import { cloudinaryService } from '../services/cloudinary.service';
import { money } from '../services/money.helper';
import { PaymentMethod } from '../shared/types';

// Extend AuthRequest to include multer file
interface AuthRequestWithFile extends AuthRequest {
  file?: Express.Multer.File;
}

// Configure multer for file uploads (memory storage)
// 5MB cap — payment screenshots don't need more; memory storage means an
// oversized/unbounded upload would otherwise buffer entirely in RAM.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
    }
  },
});

// Multer failures happen inside the middleware, before the route body runs, so
// translate them here: the client needs a stable `code` to show the right
// guidance (the generic global handler only says "Payload too large").
const uploadScreenshot = (req: Request, res: Response, next: NextFunction) => {
  upload.single('screenshot')(req, res, (err: any) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: 'Screenshot is too large — the maximum size is 5MB.',
        code: 'FILE_TOO_LARGE',
      });
      return;
    }
    if (typeof err.message === 'string' && err.message.includes('Invalid file type')) {
      res.status(400).json({ success: false, error: err.message, code: 'INVALID_FILE_TYPE' });
      return;
    }
    next(err);
  });
};

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create deposit
const createDepositSchema = z.object({
  amount: z.string().optional(),
  paymentMethod: z.enum([PaymentMethod.TELEBIRR, PaymentMethod.CBE]),
});

router.post('/', uploadScreenshot, async (req: AuthRequestWithFile, res: Response) => {
  try {
    finLog.deposit({ requestId: req.requestId, event: 'request_received', userId: req.user?.userId, hasFile: !!req.file });
    
    const body = createDepositSchema.parse({
      amount: req.body.amount,
      paymentMethod: req.body.paymentMethod?.toUpperCase(),
    });

    // Parse amount if provided
    let amountDecimal: Decimal | undefined;
    if (body.amount !== undefined && body.amount !== null && body.amount.trim() !== '') {
      const parsed = money.fromAmountString(body.amount);
      if (!parsed) {
        res.status(400).json({
          success: false,
          error: 'Amount must be a decimal string with at most 2 decimals',
          code: 'INVALID_AMOUNT',
        });
        return;
      }
      amountDecimal = parsed;
    }

    // Validate screenshot file
    if (!req.file) {
      finLog.deposit({ requestId: req.requestId, event: 'missing_screenshot', userId: req.user?.userId });
      res.status(400).json({ 
        success: false, 
        error: 'Transaction screenshot is required', 
        code: 'SCREENSHOT_REQUIRED' 
      });
      return;
    }

    finLog.deposit({ requestId: req.requestId, event: 'creating', userId: req.user!.userId, amount: amountDecimal ? String(amountDecimal) : 'UNVERIFIED', method: body.paymentMethod, fileName: req.file.originalname });

    // Save screenshot to Cloudinary
    const { url: screenshotUrl, publicId: screenshotPublicId } = await uploadService.saveFile(req.file);
    finLog.deposit({ requestId: req.requestId, event: 'screenshot_saved', userId: req.user!.userId });

    // Create deposit - amount can be null if user didn't provide it.
    // On upload failure nothing is persisted, so the asset is orphan-free.
    // On DB failure after a successful upload we delete the uploaded asset.
    let deposit;
    try {
      deposit = await depositService.createDeposit({
        userId: req.user!.userId,
        amount: amountDecimal ?? undefined, // undefined = amount not self-declared; admin verifies
        paymentMethod: body.paymentMethod,
        screenshotUrl,
        screenshotPublicId,
        isAmountUnverified: !amountDecimal, // Flag to indicate amount needs manual verification
      });
    } catch (dbError: any) {
      // Failure/recovery: don't leak orphaned Cloudinary assets when the DB
      // insert fails after the upload succeeded.
      try { await uploadService.deleteFile(screenshotPublicId); } catch { /* best-effort */ }
      throw dbError;
    }

    finLog.deposit({ requestId: req.requestId, event: 'created', userId: req.user!.userId, depositId: deposit.id });

    // Real-time: admins see the new pending deposit immediately
    const io = req.app.locals.io;
    if (io) {
      io.to('admin').emit('admin:deposit_new', {
        depositId: deposit.id,
        userId: req.user!.userId,
        amount: Number(deposit.submittedAmount),
        paymentMethod: deposit.paymentMethod,
        timestamp: new Date().toISOString(),
      });
      io.to('admin').emit('admin:stats_updated');
    }

    res.json({
      success: true,
      data: {
        id: deposit.id,
        submittedAmount: Number(deposit.submittedAmount),
        paymentMethod: deposit.paymentMethod,
        status: deposit.status,
        createdAt: deposit.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    finLog.depositError({ requestId: req.requestId, event: 'create_error', userId: req.user?.userId, errorName: error.name, errorMessage: error.message, errorCode: error.code });
    if (error instanceof DepositError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error instanceof UploadError) {
      res.status(400).json({ success: false, error: error.message, code: error.code });
    } else if (error.name === 'ZodError') {
      res.status(400).json({ success: false, error: 'Invalid request data' });
    } else {
      finLog.depositError({ requestId: req.requestId, event: 'create_error_unhandled', userId: req.user?.userId, errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to create deposit' });
    }
  }
});

// Get user's deposits
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await depositService.getUserDeposits(req.user!.userId, limit, offset);

    res.json({ success: true, data: result });
  } catch (error: any) {
    finLog.depositError({ requestId: req.requestId, event: 'list_error', userId: req.user?.userId, errorMessage: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to get deposits' });
  }
});

// Get specific deposit
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.getDepositById(req.params.id);

    // Verify deposit belongs to user
    if (deposit.userId !== req.user!.userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    res.json({ success: true, data: deposit });
  } catch (error: any) {
    if (error.code === 'DEPOSIT_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      finLog.depositError({ requestId: req.requestId, event: 'get_error', userId: req.user?.userId, depositId: req.params['id'], errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to get deposit' });
    }
  }
});

// Get deposit screenshot (secure download)
router.get('/:id/screenshot', async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.getDepositById(req.params.id);

    // Verify ownership
    if (deposit.userId !== req.user!.userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    if (!deposit.screenshotUrl) {
      res.status(404).json({ success: false, error: 'Screenshot not found', code: 'SCREENSHOT_NOT_FOUND' });
      return;
    }

    // Normalize and redirect (Cloudinary absolute URL or origin-relative /uploads path)
    res.redirect(cloudinaryService.normalizeStoredUrl(deposit.screenshotUrl)!);
  } catch (error: any) {
    if (error.code === 'DEPOSIT_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      finLog.depositError({ requestId: req.requestId, event: 'screenshot_error', userId: req.user?.userId, depositId: req.params['id'], errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to get screenshot' });
    }
  }
});

// Serve the deposit screenshot BYTES (admin or owner) with auth.
// Browsers cannot send Authorization headers on <img src>, so this endpoint
// also accepts ?token= (used only as a fallback by the admin UI) and streams
// the image with strict sanitization.
router.get('/:id/screenshot/raw', async (req: AuthRequest, res: Response) => {
  try {
    const deposit = await depositService.getDepositById(req.params.id);

    // Admin OR owner access
    const isAdmin = req.user!.role === 'ADMIN';
    if (!isAdmin && deposit.userId !== req.user!.userId) {
      res.status(403).json({ success: false, error: 'Access denied', code: 'FORBIDDEN' });
      return;
    }

    if (!deposit.screenshotUrl) {
      res.status(404).json({ success: false, error: 'Screenshot not found', code: 'SCREENSHOT_NOT_FOUND' });
      return;
    }

    // Cloudinary-hosted: redirect to the CDN
    if (!deposit.screenshotUrl.includes('/uploads/')) {
      res.redirect(cloudinaryService.normalizeStoredUrl(deposit.screenshotUrl)!);
      return;
    }

    // Locally-hosted: stream the file bytes
    const filePath = cloudinaryService.resolveLocalPath(
      deposit.screenshotPublicId || deposit.screenshotUrl
    );
    if (!filePath) {
      res.status(404).json({ success: false, error: 'File missing', code: 'FILE_NOT_FOUND' });
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(filePath);
  } catch (error: any) {
    if (error.code === 'DEPOSIT_NOT_FOUND') {
      res.status(404).json({ success: false, error: error.message, code: error.code });
    } else {
      finLog.depositError({ requestId: req.requestId, event: 'screenshot_error_raw', userId: req.user?.userId, depositId: req.params['id'], errorMessage: error instanceof Error ? error.message : String(error) });
      res.status(500).json({ success: false, error: 'Failed to get screenshot' });
    }
  }
});

export default router;

import { Router, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { finLog } from '../lib/logger';
import { Decimal } from '@prisma/client/runtime/library';
import { authenticate, AuthRequest } from '../middleware/auth';
import { depositService, DepositError } from '../services/deposit.service';
import { uploadService, UploadError } from '../services/upload.service';
import { cloudinaryService } from '../services/cloudinary.service';
import { money } from '../services/money.helper';
import { PaymentMethod } from '../../shared/types';

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

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create deposit
const createDepositSchema = z.object({
  amount: z.custom<Decimal>((v) => v instanceof Decimal).optional(),
  paymentMethod: z.enum([PaymentMethod.TELEBIRR, PaymentMethod.CBE]),
});

router.post('/', upload.single('screenshot'), async (req: AuthRequest, res: Response) => {
  try {
    finLog.deposit({ requestId: req.requestId, event: 'request_received', userId: req.user?.userId, hasFile: !!req.file });
    
    // Parse and validate request body. Amount arrives as a string from the
    // multipart form and is parsed STRICTLY into a decimal at the boundary
    // (audit M7) — parseFloat used to accept garbage like "10.999" and
    // exponent forms before validation could see them.
    let amountDecimal: Decimal | undefined;
    if (req.body.amount !== undefined && req.body.amount !== null && String(req.body.amount).trim() !== '') {
      const parsed = money.fromAmountString(String(req.body.amount));
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
    const body = createDepositSchema.parse({
      amount: amountDecimal,
      paymentMethod: req.body.paymentMethod?.toUpperCase(),
    });

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

    finLog.deposit({ requestId: req.requestId, event: 'creating', userId: req.user!.userId, amount: body.amount ? String(body.amount) : 'UNVERIFIED', method: body.paymentMethod, fileName: req.file.originalname });

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
        amount: body.amount ?? undefined, // undefined = amount not self-declared; admin verifies
        paymentMethod: body.paymentMethod,
        screenshotUrl,
        screenshotPublicId,
        isAmountUnverified: !body.amount, // Flag to indicate amount needs manual verification
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

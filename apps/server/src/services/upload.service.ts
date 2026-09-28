import { cloudinaryService, CloudinaryError } from './cloudinary.service';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB — payment screenshots don't need more

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Content-based file-type detection (magic bytes). The declared MIME type is
 * client-controlled and untrustworthy; these signatures are checked instead:
 *   JPEG  FF D8 FF
 *   PNG   89 50 4E 47 0D 0A 1A 0A
 *   WEBP  RIFF....WEBP
 */
export function detectImageMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSig.every((b, i) => buffer[i] === b)) return 'image/png';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export class UploadError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export class UploadService {
  /**
   * Validate declared file type (first line of defense; magic bytes are the
   * authoritative check below).
   */
  validateFileType(mimetype: string): boolean {
    return ALLOWED_MIME_TYPES.includes(mimetype.toLowerCase());
  }

  /**
   * Validate file size
   */
  validateFileSize(size: number): boolean {
    return size > 0 && size <= MAX_FILE_SIZE;
  }

  /**
   * Upload file to Cloudinary
   * Returns the Cloudinary URL and public_id
   */
  async saveFile(file: Express.Multer.File): Promise<UploadResult> {
    // Validate declared type
    if (!this.validateFileType(file.mimetype)) {
      throw new UploadError(
        'Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed.',
        'INVALID_FILE_TYPE'
      );
    }

    if (!this.validateFileSize(file.size)) {
      throw new UploadError(
        'File size must be less than 5MB',
        'INVALID_FILE_SIZE'
      );
    }

    // Validate ACTUAL content — a renamed .exe must not pass as an image.
    const detected = detectImageMime(file.buffer);
    if (!detected) {
      throw new UploadError(
        'File content is not a valid JPG, PNG, or WEBP image.',
        'INVALID_FILE_CONTENT'
      );
    }

    // Upload to Cloudinary
    const result = await cloudinaryService.uploadScreenshot(
      file.buffer,
      file.originalname,
      detected
    );

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  }

  /**
   * Delete file from Cloudinary
   */
  async deleteFile(publicId: string): Promise<void> {
    await cloudinaryService.deleteScreenshot(publicId);
  }
}

export const uploadService = new UploadService();

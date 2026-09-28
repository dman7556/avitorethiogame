import { v2 as cloudinary } from 'cloudinary';
import { env } from '../lib/env';
import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'deposits');

// Configure Cloudinary (if credentials available)
if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  format: string;
  bytes: number;
}

export class CloudinaryService {
  private useCloudinary = !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

  /**
   * Upload a buffer to Cloudinary or local storage
   */
  async uploadScreenshot(
    fileBuffer: Buffer,
    originalName: string,
    mimetype: string
  ): Promise<CloudinaryUploadResult> {
    // Validate file type
    if (!ALLOWED_TYPES.includes(mimetype.toLowerCase())) {
      throw new CloudinaryError(
        'Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed.',
        'INVALID_FILE_TYPE'
      );
    }

    // Validate file size
    if (fileBuffer.length > MAX_SIZE) {
      throw new CloudinaryError(
        'File size must be less than 10MB',
        'INVALID_FILE_SIZE'
      );
    }

    // If Cloudinary is configured, use it
    if (this.useCloudinary) {
      return this.uploadToCloudinary(fileBuffer, originalName, mimetype);
    } else {
      // Fallback to local storage
      return this.uploadToLocal(fileBuffer, originalName, mimetype);
    }
  }

  /**
   * Upload to Cloudinary
   */
  private async uploadToCloudinary(
    fileBuffer: Buffer,
    originalName: string,
    mimetype: string
  ): Promise<CloudinaryUploadResult> {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const public_id = `deposit_${timestamp}_${random}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'skyrush/deposits/screenshots',
          public_id,
          resource_type: 'image',
          // NOTE: no forced `format` — let Cloudinary detect the real format.
          // Forcing the original filename's extension causes broken delivery
          // when the extension lies (e.g. a .png saved as .jpg).
          transformation: [
            { quality: 'auto:good', fetch_format: 'auto' },
          ],
        },
        (error, result) => {
          if (error) {
            console.error('[CLOUDINARY] Upload error:', error);
            reject(new CloudinaryError(
              'Failed to upload screenshot',
              'UPLOAD_FAILED'
            ));
            return;
          }

          if (!result) {
            reject(new CloudinaryError(
              'Upload returned no result',
              'UPLOAD_FAILED'
            ));
            return;
          }

          console.log(`[CLOUDINARY] Uploaded: ${result.public_id} (${result.bytes} bytes)`);

          resolve({
            public_id: result.public_id,
            secure_url: result.secure_url,
            format: result.format,
            bytes: result.bytes,
          });
        }
      );

      uploadStream.end(fileBuffer);
    });
  }

  /**
   * Upload to local storage (fallback)
   */
  private uploadToLocal(
    fileBuffer: Buffer,
    originalName: string,
    mimetype: string
  ): CloudinaryUploadResult {
    try {
      // Ensure directory exists
      if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
        fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
      }

      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const ext = originalName.split('.').pop() || 'jpg';
      const filename = `deposit_${timestamp}_${random}.${ext}`;
      const filepath = path.join(LOCAL_UPLOAD_DIR, filename);

      // Write file
      fs.writeFileSync(filepath, fileBuffer);

      // Store a RELATIVE URL so it works from any origin:
      // - production: same-origin express.static('/uploads')
      // - dev: vite proxies /uploads -> server
      const localUrl = `/uploads/deposits/${filename}`;
      const public_id = filename.replace(/\.\w+$/, '');

      console.log(`[LOCAL_STORAGE] Uploaded: ${filename} (${fileBuffer.length} bytes)`);

      return {
        public_id,
        secure_url: localUrl,
        format: ext,
        bytes: fileBuffer.length,
      };
    } catch (error) {
      console.error('[LOCAL_STORAGE] Upload error:', error);
      throw new CloudinaryError(
        'Failed to save screenshot',
        'UPLOAD_FAILED'
      );
    }
  }

  /**
   * Delete a screenshot from Cloudinary or local storage
   */
  async deleteScreenshot(publicId: string): Promise<void> {
    if (this.useCloudinary) {
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log(`[CLOUDINARY] Deleted: ${publicId}`);
      } catch (error) {
        console.error('[CLOUDINARY] Delete error:', error);
      }
    } else {
      try {
        const filepath = path.join(LOCAL_UPLOAD_DIR, `${publicId}.jpg`);
        if (fs.existsSync(filepath)) {
          fs.unlinkSync(filepath);
          console.log(`[LOCAL_STORAGE] Deleted: ${publicId}`);
        }
      } catch (error) {
        console.error('[LOCAL_STORAGE] Delete error:', error);
      }
    }
  }

  /**
   * Generate a URL for viewing
   */
  getScreenshotUrl(publicId: string): string {
    if (this.useCloudinary) {
      return cloudinary.url(publicId, {
        secure: true,
        transformation: [
          { quality: 'auto:good', fetch_format: 'auto' },
        ],
      });
    } else {
      return `/uploads/deposits/${publicId}.jpg`;
    }
  }

  /**
   * Normalize any stored screenshot URL for display:
   * legacy rows may hold absolute http://localhost:4000/uploads/... URLs;
   * those are converted to origin-relative paths so they render from any host.
   */
  normalizeStoredUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    // Local uploads (possibly stored with an absolute host in old rows)
    const uploadsMatch = url.match(/\/uploads\//);
    if (uploadsMatch) {
      const idx = url.indexOf('/uploads/');
      const rel = url.substring(idx);
      // Split hosting (Vercel frontend / Oracle backend): the browser must
      // load legacy local files from THIS backend's origin, not the frontend's
      // — otherwise <img src="/uploads/..."> 404s against the Vercel
      // filesystem. PUBLIC_BASE_URL is the backend's public origin; empty in
      // local dev where same-origin relative paths are correct.
      return env.PUBLIC_BASE_URL ? `${env.PUBLIC_BASE_URL}${rel}` : rel;
    }
    return url;
  }

  /**
   * Resolve the on-disk path for a locally-stored screenshot (sanitized).
   * Returns null when the asset is not a local upload.
   */
  resolveLocalPath(publicIdOrUrl: string): string | null {
    const publicId = publicIdOrUrl.replace(/\\/g, '/').split('/').pop() || '';
    if (!/^deposit_[A-Za-z0-9_-]+$/.test(publicId)) return null;
    // try common extensions
    for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
      const p = path.join(LOCAL_UPLOAD_DIR, `${publicId}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
}


export class CloudinaryError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'CloudinaryError';
    this.code = code;
  }
}

export const cloudinaryService = new CloudinaryService();

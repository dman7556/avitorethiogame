/// <reference types="multer" />

declare global {
  namespace Express {
    // Re-export multer's File type as Express.Multer.File
    namespace Multer {
      type File = import('multer').File;
    }
  }
}

export {};

declare module 'multer' {
  import { Request } from 'express';

  namespace multer {
    interface File {
      /** Field name specified in the form */
      fieldname: string;
      /** Name of the file on the user's computer */
      originalname: string;
      /** Encoding type of the file */
      encoding: string;
      /** Mime type of the file */
      mimetype: string;
      /** Size of the file in bytes */
      size: number;
      /** The folder to which the file has been saved (DiskStorage) */
      destination?: string;
      /** The name of the file within the destination (DiskStorage) */
      filename?: string;
      /** Location of the uploaded file (DiskStorage) */
      path?: string;
      /** A Buffer of the entire file (MemoryStorage) */
      buffer?: Buffer;
    }

    interface Options {
      /** The destination directory for the uploaded files. */
      dest?: string;
      /** The storage engine to use for uploaded files. */
      storage?: StorageEngine;
      /** An object specifying the size limits of the following optional properties. */
      limits?: {
        /** Max field name size (Default: 100 bytes) */
        fieldNameSize?: number;
        /** Max field value size (Default: 1MB) */
        fieldSize?: number;
        /** Max number of non- file fields (Default: Infinity) */
        fields?: number;
        /** For multipart forms, the max file size (in bytes) (Default: Infinity) */
        fileSize?: number;
        /** For multipart forms, the max number of file fields (Default: Infinity) */
        files?: number;
        /** For multipart forms, the max number of parts (fields + files) (Default: Infinity) */
        parts?: number;
        /** For multipart forms, the max number of headers to parse (Default: 2000) */
        headerPairs?: number;
      };
      /** Keep the full path of files instead of just the base name (Default: false) */
      preservePath?: boolean;
      /** Optional function to control which files are uploaded. */
      fileFilter?: (req: Request, file: File, callback: FileFilterCallback) => void;
    }

    interface StorageEngine {
      _handleFile(req: Request, file: File, callback: (error?: any, info?: Partial<File>) => void): void;
      _removeFile(req: Request, file: File, callback: (error: Error | null) => void): void;
    }

    interface DiskStorageOptions {
      /** A function used to determine within which folder the uploaded files should be stored. */
      destination?: string | ((req: Request, file: File, callback: (error: Error | null, destination: string) => void) => void);
      /** A function used to determine what the file should be named inside the folder. */
      filename?: (req: Request, file: File, callback: (error: Error | null, filename: string) => void) => void;
    }

    interface MemoryStorageOptions {}

    type FileFilterCallback = (error: Error | null, acceptFile?: boolean) => void;

    interface Instance {
      /** Accept a single file with the name fieldname. */
      single(fieldname: string): RequestHandler;
      /** Accept an array of files, all with the name fieldname. */
      array(fieldname: string, maxCount?: number): RequestHandler;
      /** Accept a mix of files, specified by fields. */
      fields(fields: Field[]): RequestHandler;
      /** Accept only text fields. */
      none(): RequestHandler;
      /** Accept anything. */
      any(): RequestHandler;
    }

    interface Field {
      /** The field name. */
      name: string;
      /** Optional maximum number of files per field to accept. */
      maxCount?: number;
    }

    interface RequestHandler {
      (req: Request, res: any, next: (error?: any) => void): void;
    }

    function diskStorage(options: DiskStorageOptions): StorageEngine;
    function memoryStorage(): StorageEngine;
  }

  function multer(options?: multer.Options): multer.Instance;

  export = multer;
}
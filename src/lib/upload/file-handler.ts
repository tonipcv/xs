/**
 * File Handler Utility
 * Handles file uploads, validation, and processing
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export interface FileUploadConfig {
  maxSize: number;
  allowedTypes: string[];
  allowedExtensions?: string[];
  uploadDir: string;
}

export interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

export interface FileInfo {
  name: string;
  size: number;
  type: string;
  path: string;
  extension?: string;
}

export class FileHandler {
  private config: FileUploadConfig;

  constructor(config: FileUploadConfig) {
    this.config = config;
  }

  static validateFile(file: { size: number; type: string; name?: string }, options: FileValidationOptions): { valid: boolean; error?: string } {
    if (options.maxSize && file.size > options.maxSize) {
      return { valid: false, error: 'File size exceeds limit' };
    }

    if (options.allowedTypes && !options.allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Invalid file type' };
    }

    if (options.allowedExtensions && file.name) {
      const ext = path.extname(file.name).toLowerCase();
      if (!options.allowedExtensions.includes(ext)) {
        return { valid: false, error: 'Invalid file extension' };
      }
    }

    return { valid: true };
  }

  static getFileInfo(fileOrPath: string | { name: string; size: number; type: string }): FileInfo {
    if (typeof fileOrPath === 'string') {
      const stats = fs.statSync(fileOrPath);
      const ext = path.extname(fileOrPath).toLowerCase();
      return {
        name: path.basename(fileOrPath),
        size: stats.size,
        type: ext,
        path: fileOrPath,
        extension: ext,
      };
    } else {
      const ext = path.extname(fileOrPath.name).toLowerCase();
      return {
        name: fileOrPath.name,
        size: fileOrPath.size,
        type: fileOrPath.type,
        path: '',
        extension: ext,
      };
    }
  }

  async validate(file: FileInfo): Promise<{ valid: boolean; error?: string }> {
    if (file.size > this.config.maxSize) {
      return { valid: false, error: 'File too large' };
    }

    if (!this.config.allowedTypes.includes(file.type)) {
      return { valid: false, error: 'Invalid file type' };
    }

    return { valid: true };
  }

  async save(buffer: Buffer, filename: string): Promise<string> {
    const filePath = path.join(this.config.uploadDir, filename);
    await fsPromises.writeFile(filePath, buffer);
    return filePath;
  }

  async cleanup(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
    } catch {
      // Ignore errors
    }
  }

  static isImage(file: { type: string }): boolean {
    return file.type.startsWith('image/');
  }

  static isVideo(file: { type: string }): boolean {
    return file.type.startsWith('video/');
  }

  static isDocument(file: { type: string }): boolean {
    const docTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument', 'text/plain', 'text/csv'];
    return docTypes.some(type => file.type.includes(type));
  }
}

export function createFileHandler(config: FileUploadConfig): FileHandler {
  return new FileHandler(config);
}

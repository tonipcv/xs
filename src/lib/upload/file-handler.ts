/**
 * FILE UPLOAD HANDLER
 * Handle file uploads with validation and processing
 */

export interface UploadOptions {
  maxSize?: number
  allowedTypes?: string[]
  allowedExtensions?: string[]
  generateFilename?: boolean
  destination?: string
}

export interface UploadResult {
  success: boolean
  filename?: string
  path?: string
  size?: number
  mimetype?: string
  error?: string
}

export class FileHandler {
  private static readonly DEFAULT_MAX_SIZE = 10 * 1024 * 1024 // 10MB
  private static readonly DEFAULT_ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/csv',
    'application/json',
  ]

  /**
   * Validate file
   */
  static validateFile(
    file: File,
    options: UploadOptions = {}
  ): { valid: boolean; error?: string } {
    const maxSize = options.maxSize || this.DEFAULT_MAX_SIZE
    const allowedTypes = options.allowedTypes || this.DEFAULT_ALLOWED_TYPES

    // Check size
    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds ${this.formatBytes(maxSize)}`,
      }
    }

    // If specific extensions are required, validate extension first
    if (options.allowedExtensions) {
      const ext = this.getExtension(file.name)
      if (!options.allowedExtensions.includes(ext)) {
        return {
          valid: false,
          error: `File extension .${ext} not allowed`,
        }
      }
    }

    // Check type (after extension to provide clearer messaging when extensions are constrained)
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} not allowed`,
      }
    }

    return { valid: true }
  }

  /**
   * Process upload
   */
  static async processUpload(
    file: File,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    // Validate
    const validation = this.validateFile(file, options)
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      }
    }

    try {
      // Generate filename
      const filename = options.generateFilename
        ? this.generateFilename(file.name)
        : file.name

      // In production, would upload to storage (S3, etc)
      // For now, return metadata
      return {
        success: true,
        filename,
        path: `${options.destination || '/uploads'}/${filename}`,
        size: file.size,
        mimetype: file.type,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      }
    }
  }

  /**
   * Generate unique filename
   */
  private static generateFilename(originalName: string): string {
    const ext = this.getExtension(originalName)
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(7)
    return `${timestamp}_${random}.${ext}`
  }

  /**
   * Get file extension
   */
  private static getExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || ''
  }

  /**
   * Format bytes
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * Process multiple uploads
   */
  static async processMultiple(
    files: File[],
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = []

    for (const file of files) {
      const result = await this.processUpload(file, options)
      results.push(result)
    }

    return results
  }

  /**
   * Get file info
   */
  static getFileInfo(file: File): {
    name: string
    size: number
    type: string
    extension: string
    sizeFormatted: string
  } {
    return {
      name: file.name,
      size: file.size,
      type: file.type,
      extension: this.getExtension(file.name),
      sizeFormatted: this.formatBytes(file.size),
    }
  }

  /**
   * Check if image
   */
  static isImage(file: File): boolean {
    return file.type.startsWith('image/')
  }

  /**
   * Check if video
   */
  static isVideo(file: File): boolean {
    return file.type.startsWith('video/')
  }

  /**
   * Check if audio
   */
  static isAudio(file: File): boolean {
    return file.type.startsWith('audio/')
  }

  /**
   * Check if document
   */
  static isDocument(file: File): boolean {
    const docTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]
    return docTypes.includes(file.type)
  }

  /**
   * Read file as text
   */
  static async readAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  /**
   * Read file as data URL
   */
  static async readAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Read file as array buffer
   */
  static async readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }
}

/**
 * CRYPTO HELPER
 * Cryptographic utilities
 */

import crypto from 'crypto'

export class CryptoHelper {
  /**
   * Generate random string
   */
  static randomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex').substring(0, length)
  }

  /**
   * Generate UUID
   */
  static uuid(): string {
    return crypto.randomUUID()
  }

  /**
   * Hash string with SHA256
   */
  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  /**
   * Hash with salt
   */
  static hashWithSalt(data: string, salt?: string): {
    hash: string
    salt: string
  } {
    const useSalt = salt || this.randomString(16)
    const hash = crypto
      .createHash('sha256')
      .update(data + useSalt)
      .digest('hex')

    return { hash, salt: useSalt }
  }

  /**
   * Verify hash
   */
  static verifyHash(data: string, hash: string, salt: string): boolean {
    const computed = this.hashWithSalt(data, salt)
    return computed.hash === hash
  }

  /**
   * HMAC signature
   */
  static hmac(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex')
  }

  /**
   * Verify HMAC
   */
  static verifyHmac(data: string, signature: string, secret: string): boolean {
    const computed = this.hmac(data, secret)
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(signature)
    )
  }

  /**
   * Encrypt data (AES-256-GCM)
   */
  static encrypt(data: string, key: string): {
    encrypted: string
    iv: string
    tag: string
  } {
    const keyBuffer = crypto.scryptSync(key, 'salt', 32)
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv)

    let encrypted = cipher.update(data, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const tag = cipher.getAuthTag()

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
    }
  }

  /**
   * Decrypt data (AES-256-GCM)
   */
  static decrypt(
    encrypted: string,
    key: string,
    iv: string,
    tag: string
  ): string {
    const keyBuffer = crypto.scryptSync(key, 'salt', 32)
    const ivBuffer = Buffer.from(iv, 'hex')
    const tagBuffer = Buffer.from(tag, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer)
    decipher.setAuthTag(tagBuffer)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }

  /**
   * Generate API key
   */
  static generateApiKey(prefix: string = 'sk'): string {
    const random = this.randomString(32)
    return `${prefix}_${random}`
  }

  /**
   * Generate token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url')
  }

  /**
   * Hash password (bcrypt-style)
   */
  static async hashPassword(password: string): Promise<string> {
    const salt = this.randomString(16)
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    return `${salt}:${hash.toString('hex')}`
  }

  /**
   * Verify password
   */
  static async verifyPassword(
    password: string,
    hashedPassword: string
  ): Promise<boolean> {
    const [salt, hash] = hashedPassword.split(':')
    const computed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512')
    return computed.toString('hex') === hash
  }

  /**
   * Generate OTP
   */
  static generateOTP(length: number = 6): string {
    const digits = '0123456789'
    let otp = ''

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length)
      otp += digits[randomIndex]
    }

    return otp
  }

  /**
   * Constant time comparison
   */
  static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false

    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
    } catch {
      return false
    }
  }

  /**
   * Generate checksum
   */
  static checksum(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex')
  }

  /**
   * Encode base64
   */
  static base64Encode(data: string): string {
    return Buffer.from(data).toString('base64')
  }

  /**
   * Decode base64
   */
  static base64Decode(data: string): string {
    return Buffer.from(data, 'base64').toString('utf8')
  }

  /**
   * URL-safe base64 encode
   */
  static base64UrlEncode(data: string): string {
    return Buffer.from(data).toString('base64url')
  }

  /**
   * URL-safe base64 decode
   */
  static base64UrlDecode(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf8')
  }
}

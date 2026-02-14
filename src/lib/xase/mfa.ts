// @ts-nocheck
/**
 * MULTI-FACTOR AUTHENTICATION (MFA)
 * 
 * Supports TOTP (Time-based One-Time Password) and backup codes
 */

import * as crypto from 'crypto'
import { getRedisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export interface MFASetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export interface MFAVerification {
  valid: boolean
  method: 'TOTP' | 'BACKUP_CODE'
}

/**
 * MFA Manager
 */
export class MFAManager {
  private static readonly TOTP_WINDOW = 1 // Allow 1 step before/after
  private static readonly TOTP_PERIOD = 30 // 30 seconds
  private static readonly BACKUP_CODE_COUNT = 10
  private static readonly REDIS_PREFIX = 'mfa:'

  /**
   * Setup MFA for user
   */
  static async setupMFA(userId: string, tenantId: string, appName: string = 'Xase'): Promise<MFASetup> {
    // Generate secret
    const secret = this.generateSecret()

    // Generate backup codes
    const backupCodes = this.generateBackupCodes()

    // Store in database
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: secret,
        mfaBackupCodes: JSON.stringify(backupCodes),
      },
    })

    // Generate QR code URL
    const qrCodeUrl = this.generateQRCodeUrl(userId, secret, appName)

    // Log MFA setup
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'MFA_ENABLED',
        resourceType: 'USER',
        resourceId: userId,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    })

    return {
      secret,
      qrCodeUrl,
      backupCodes,
    }
  }

  /**
   * Verify TOTP code
   */
  static async verifyTOTP(userId: string, code: string): Promise<MFAVerification> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaEnabled: true },
    })

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return { valid: false, method: 'TOTP' }
    }

    // Check if code was recently used (prevent replay attacks)
    const redis = getRedisClient()
    const usedKey = `${this.REDIS_PREFIX}used:${userId}:${code}`
    const wasUsed = await redis.get(usedKey)

    if (wasUsed) {
      return { valid: false, method: 'TOTP' }
    }

    // Verify TOTP
    const valid = this.verifyTOTPCode(user.mfaSecret, code)

    if (valid) {
      // Mark code as used (TTL = 2 * TOTP_PERIOD)
      await redis.setex(usedKey, this.TOTP_PERIOD * 2, '1')
    }

    return { valid, method: 'TOTP' }
  }

  /**
   * Verify backup code
   */
  static async verifyBackupCode(userId: string, code: string): Promise<MFAVerification> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaBackupCodes: true, mfaEnabled: true, tenantId: true },
    })

    if (!user || !user.mfaEnabled || !user.mfaBackupCodes) {
      return { valid: false, method: 'BACKUP_CODE' }
    }

    const backupCodes: string[] = JSON.parse(user.mfaBackupCodes as string)
    const index = backupCodes.indexOf(code)

    if (index === -1) {
      return { valid: false, method: 'BACKUP_CODE' }
    }

    // Remove used backup code
    backupCodes.splice(index, 1)

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: JSON.stringify(backupCodes) },
    })

    // Log backup code usage
    await prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        userId,
        action: 'MFA_BACKUP_CODE_USED',
        resourceType: 'USER',
        resourceId: userId,
        status: 'SUCCESS',
        metadata: JSON.stringify({ remainingCodes: backupCodes.length }),
        timestamp: new Date(),
      },
    })

    return { valid: true, method: 'BACKUP_CODE' }
  }

  /**
   * Disable MFA for user
   */
  static async disableMFA(userId: string, tenantId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: null,
      },
    })

    // Log MFA disable
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'MFA_DISABLED',
        resourceType: 'USER',
        resourceId: userId,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    })
  }

  /**
   * Generate new backup codes
   */
  static async regenerateBackupCodes(userId: string, tenantId: string): Promise<string[]> {
    const backupCodes = this.generateBackupCodes()

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: JSON.stringify(backupCodes) },
    })

    // Log regeneration
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'MFA_BACKUP_CODES_REGENERATED',
        resourceType: 'USER',
        resourceId: userId,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    })

    return backupCodes
  }

  /**
   * Generate TOTP secret
   */
  private static generateSecret(): string {
    return crypto.randomBytes(20).toString('base64').replace(/[^A-Z2-7]/gi, '').substr(0, 32)
  }

  /**
   * Generate backup codes
   */
  private static generateBackupCodes(): string[] {
    const codes: string[] = []
    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase()
      codes.push(`${code.substr(0, 4)}-${code.substr(4, 4)}`)
    }
    return codes
  }

  /**
   * Generate QR code URL for TOTP
   */
  private static generateQRCodeUrl(userId: string, secret: string, appName: string): string {
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(appName)}:${encodeURIComponent(userId)}?secret=${secret}&issuer=${encodeURIComponent(appName)}`
    return `https://chart.googleapis.com/chart?chs=200x200&cht=qr&chl=${encodeURIComponent(otpauthUrl)}`
  }

  /**
   * Verify TOTP code
   */
  private static verifyTOTPCode(secret: string, code: string): boolean {
    const counter = Math.floor(Date.now() / 1000 / this.TOTP_PERIOD)

    // Check current window and adjacent windows
    for (let i = -this.TOTP_WINDOW; i <= this.TOTP_WINDOW; i++) {
      const expectedCode = this.generateTOTPCode(secret, counter + i)
      if (expectedCode === code) {
        return true
      }
    }

    return false
  }

  /**
   * Generate TOTP code for counter
   */
  private static generateTOTPCode(secret: string, counter: number): string {
    const buffer = Buffer.alloc(8)
    buffer.writeBigInt64BE(BigInt(counter))

    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base64'))
    hmac.update(buffer)
    const hash = hmac.digest()

    const offset = hash[hash.length - 1] & 0x0f
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff)

    const code = binary % 1000000
    return code.toString().padStart(6, '0')
  }
}

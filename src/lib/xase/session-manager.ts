// @ts-nocheck
/**
 * SESSION MANAGER
 * 
 * Secure session management with Redis
 * Supports multiple devices, session rotation, and automatic cleanup
 */

import { getRedisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export interface Session {
  sessionId: string
  userId: string
  tenantId: string
  deviceId: string
  deviceName: string
  ipAddress: string
  userAgent: string
  createdAt: Date
  lastActivityAt: Date
  expiresAt: Date
  refreshToken?: string
}

export interface SessionOptions {
  maxAge?: number // seconds, default 24 hours
  slidingExpiration?: boolean // extend on activity
  maxDevices?: number // max concurrent devices
}

/**
 * Session Manager
 */
export class SessionManager {
  private static readonly REDIS_PREFIX = 'session:'
  private static readonly USER_SESSIONS_PREFIX = 'user:sessions:'
  private static readonly DEFAULT_MAX_AGE = 86400 // 24 hours
  private static readonly DEFAULT_MAX_DEVICES = 5

  /**
   * Create new session
   */
  static async createSession(
    userId: string,
    tenantId: string,
    deviceId: string,
    deviceName: string,
    ipAddress: string,
    userAgent: string,
    options: SessionOptions = {}
  ): Promise<Session> {
    const redis = getRedisClient()
    const maxAge = options.maxAge || this.DEFAULT_MAX_AGE
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const now = new Date()
    const expiresAt = new Date(now.getTime() + maxAge * 1000)

    const session: Session = {
      sessionId,
      userId,
      tenantId,
      deviceId,
      deviceName,
      ipAddress,
      userAgent,
      createdAt: now,
      lastActivityAt: now,
      expiresAt,
    }

    // Check max devices limit
    const userSessions = await this.getUserSessions(userId)
    const maxDevices = options.maxDevices || this.DEFAULT_MAX_DEVICES

    if (userSessions.length >= maxDevices) {
      // Remove oldest session
      const oldest = userSessions.sort((a, b) => 
        new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()
      )[0]
      await this.destroySession(oldest.sessionId)
    }

    // Store session in Redis
    await redis.setex(
      `${this.REDIS_PREFIX}${sessionId}`,
      maxAge,
      JSON.stringify(session)
    )

    // Add to user's session list
    await redis.sadd(`${this.USER_SESSIONS_PREFIX}${userId}`, sessionId)

    // Log session creation
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'SESSION_CREATED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        status: 'SUCCESS',
        ipAddress,
        userAgent,
        metadata: JSON.stringify({ deviceId, deviceName }),
        timestamp: now,
      },
    })

    return session
  }

  /**
   * Get session by ID
   */
  static async getSession(sessionId: string): Promise<Session | null> {
    const redis = getRedisClient()
    const data = await redis.get(`${this.REDIS_PREFIX}${sessionId}`)

    if (!data) {
      return null
    }

    const session: Session = JSON.parse(data)

    // Check if expired
    if (new Date() > new Date(session.expiresAt)) {
      await this.destroySession(sessionId)
      return null
    }

    return session
  }

  /**
   * Update session activity (sliding expiration)
   */
  static async updateActivity(sessionId: string): Promise<void> {
    const redis = getRedisClient()
    const session = await this.getSession(sessionId)

    if (!session) {
      return
    }

    session.lastActivityAt = new Date()

    // Get current TTL
    const ttl = await redis.ttl(`${this.REDIS_PREFIX}${sessionId}`)

    // Update session
    await redis.setex(
      `${this.REDIS_PREFIX}${sessionId}`,
      ttl,
      JSON.stringify(session)
    )
  }

  /**
   * Destroy session
   */
  static async destroySession(sessionId: string): Promise<void> {
    const redis = getRedisClient()
    const session = await this.getSession(sessionId)

    if (!session) {
      return
    }

    // Remove from Redis
    await redis.del(`${this.REDIS_PREFIX}${sessionId}`)

    // Remove from user's session list
    await redis.srem(`${this.USER_SESSIONS_PREFIX}${session.userId}`, sessionId)

    // Log session destruction
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        userId: session.userId,
        action: 'SESSION_DESTROYED',
        resourceType: 'SESSION',
        resourceId: sessionId,
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    })
  }

  /**
   * Get all sessions for user
   */
  static async getUserSessions(userId: string): Promise<Session[]> {
    const redis = getRedisClient()
    const sessionIds = await redis.smembers(`${this.USER_SESSIONS_PREFIX}${userId}`)
    const sessions: Session[] = []

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId)
      if (session) {
        sessions.push(session)
      }
    }

    return sessions
  }

  /**
   * Destroy all sessions for user (logout all devices)
   */
  static async destroyAllUserSessions(userId: string): Promise<number> {
    const sessions = await this.getUserSessions(userId)

    for (const session of sessions) {
      await this.destroySession(session.sessionId)
    }

    return sessions.length
  }

  /**
   * Rotate session ID (security best practice)
   */
  static async rotateSession(oldSessionId: string): Promise<Session> {
    const oldSession = await this.getSession(oldSessionId)

    if (!oldSession) {
      throw new Error('Session not found')
    }

    // Create new session with same data
    const newSession = await this.createSession(
      oldSession.userId,
      oldSession.tenantId,
      oldSession.deviceId,
      oldSession.deviceName,
      oldSession.ipAddress,
      oldSession.userAgent
    )

    // Destroy old session
    await this.destroySession(oldSessionId)

    return newSession
  }

  /**
   * Cleanup expired sessions (background job)
   */
  static async cleanupExpiredSessions(): Promise<number> {
    const redis = getRedisClient()
    const pattern = `${this.REDIS_PREFIX}*`
    const keys = await redis.keys(pattern)
    let cleaned = 0

    for (const key of keys) {
      const ttl = await redis.ttl(key)
      if (ttl <= 0) {
        const sessionId = key.replace(this.REDIS_PREFIX, '')
        await this.destroySession(sessionId)
        cleaned++
      }
    }

    return cleaned
  }
}

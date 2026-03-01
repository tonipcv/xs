/**
 * Consent Propagation via Redis Streams
 * Propagates consent revocations in <60s to all active sessions
 */

import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Redis client configuration
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));

// Ensure connection
let isConnected = false;

async function ensureRedisConnection() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
  }
}

export interface ConsentRevocationEvent {
  eventId: string;
  type: 'consent.revoked';
  userId: string;
  datasetId: string;
  tenantId: string;
  timestamp: string;
  reason?: string;
}

export interface LeaseInvalidationEvent {
  eventId: string;
  type: 'lease.invalidated';
  leaseId: string;
  reason: string;
  timestamp: string;
}

export interface KillSwitchEvent {
  eventId: string;
  type: 'session.kill';
  sessionIds: string[];
  reason: string;
  timestamp: string;
}

/**
 * Publish consent revocation event to Redis Stream
 */
export async function publishConsentRevocation(
  userId: string,
  datasetId: string,
  tenantId: string,
  reason?: string
): Promise<string> {
  try {
    await ensureRedisConnection();

    const event: ConsentRevocationEvent = {
      eventId: `consent_revoke_${Date.now()}`,
      type: 'consent.revoked',
      userId,
      datasetId,
      tenantId,
      timestamp: new Date().toISOString(),
      reason,
    };

    // Publish to Redis Stream
    const streamKey = 'consent:revocations';
    const messageId = await redisClient.xAdd(
      streamKey,
      '*',
      {
        event: JSON.stringify(event),
      }
    );

    console.log(`Published consent revocation: ${event.eventId} (${messageId})`);

    // Log to audit
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        action: 'CONSENT_REVOKED',
        resourceType: 'consent',
        resourceId: event.eventId,
        metadata: JSON.stringify(event),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    }).catch(() => {});

    return event.eventId;
  } catch (error) {
    console.error('Error publishing consent revocation:', error);
    throw error;
  }
}

/**
 * Process consent revocation - invalidate all related leases
 */
export async function processConsentRevocation(
  event: ConsentRevocationEvent
): Promise<void> {
  try {
    console.log(`Processing consent revocation: ${event.eventId}`);

    // Find all active leases for this dataset
    const activeLeases = await prisma.accessLease.findMany({
      where: {
        datasetId: event.datasetId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        leaseId: true,
        clientTenantId: true,
      },
    });

    console.log(`Found ${activeLeases.length} active leases to invalidate`);

    // Invalidate all leases
    const invalidatedLeaseIds: string[] = [];

    for (const lease of activeLeases) {
      await prisma.accessLease.update({
        where: { id: lease.id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });

      invalidatedLeaseIds.push(lease.leaseId);

      // Log lease invalidation
      await prisma.auditLog.create({
        data: {
          tenantId: lease.clientTenantId,
          action: 'LEASE_INVALIDATED',
          resourceType: 'lease',
          resourceId: lease.leaseId,
          metadata: JSON.stringify({
            reason: 'Consent revoked',
            consentEventId: event.eventId,
          }),
          status: 'SUCCESS',
          timestamp: new Date(),
        },
      }).catch(() => {});
    }

    // Publish lease invalidation events
    if (invalidatedLeaseIds.length > 0) {
      await publishLeaseInvalidation(invalidatedLeaseIds, 'Consent revoked');
    }

    // Find all active sidecar sessions for these leases
    const activeSessions = await prisma.sidecarSession.findMany({
      where: {
        leaseId: {
          in: activeLeases.map(l => l.id),
        },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        sessionId: true,
      },
    });

    console.log(`Found ${activeSessions.length} active sidecar sessions to kill`);

    // Send kill switch to all active sessions
    if (activeSessions.length > 0) {
      await publishKillSwitch(
        activeSessions.map(s => s.sessionId),
        'Consent revoked'
      );

      // Update session status
      await prisma.sidecarSession.updateMany({
        where: {
          id: {
            in: activeSessions.map(s => s.id),
          },
        },
        data: {
          status: 'KILLED',
          endedAt: new Date(),
        },
      });
    }

    console.log(`Consent revocation processed: ${event.eventId}`);
  } catch (error) {
    console.error('Error processing consent revocation:', error);
    throw error;
  }
}

/**
 * Publish lease invalidation event
 */
export async function publishLeaseInvalidation(
  leaseIds: string[],
  reason: string
): Promise<void> {
  try {
    await ensureRedisConnection();

    for (const leaseId of leaseIds) {
      const event: LeaseInvalidationEvent = {
        eventId: `lease_invalid_${Date.now()}`,
        type: 'lease.invalidated',
        leaseId,
        reason,
        timestamp: new Date().toISOString(),
      };

      const streamKey = 'leases:invalidations';
      await redisClient.xAdd(
        streamKey,
        '*',
        {
          event: JSON.stringify(event),
        }
      );

      console.log(`Published lease invalidation: ${leaseId}`);
    }
  } catch (error) {
    console.error('Error publishing lease invalidation:', error);
    throw error;
  }
}

/**
 * Publish kill switch event for sidecar sessions
 */
export async function publishKillSwitch(
  sessionIds: string[],
  reason: string
): Promise<void> {
  try {
    await ensureRedisConnection();

    const event: KillSwitchEvent = {
      eventId: `kill_switch_${Date.now()}`,
      type: 'session.kill',
      sessionIds,
      reason,
      timestamp: new Date().toISOString(),
    };

    const streamKey = 'sessions:kill_switch';
    await redisClient.xAdd(
      streamKey,
      '*',
      {
        event: JSON.stringify(event),
      }
    );

    console.log(`Published kill switch for ${sessionIds.length} sessions`);
  } catch (error) {
    console.error('Error publishing kill switch:', error);
    throw error;
  }
}

/**
 * Start consent propagation consumer
 * Listens to Redis Stream and processes events
 */
export async function startConsentPropagationConsumer(): Promise<void> {
  try {
    await ensureRedisConnection();

    const streamKey = 'consent:revocations';
    const consumerGroup = 'consent-processor';
    const consumerName = `processor-${process.pid}`;

    // Create consumer group if it doesn't exist
    try {
      await redisClient.xGroupCreate(streamKey, consumerGroup, '0', {
        MKSTREAM: true,
      });
      console.log(`Created consumer group: ${consumerGroup}`);
    } catch (error: any) {
      if (!error.message.includes('BUSYGROUP')) {
        throw error;
      }
    }

    console.log(`Starting consent propagation consumer: ${consumerName}`);

    // Process messages in a loop
    while (true) {
      try {
        // Read messages from stream
        const messages = await redisClient.xReadGroup(
          consumerGroup,
          consumerName,
          [
            {
              key: streamKey,
              id: '>',
            },
          ],
          {
            COUNT: 10,
            BLOCK: 5000, // Block for 5 seconds
          }
        );

        if (messages && messages.length > 0) {
          for (const stream of messages) {
            for (const message of stream.messages) {
              try {
                const eventData = message.message.event;
                const event: ConsentRevocationEvent = JSON.parse(eventData);

                console.log(`Processing event: ${event.eventId}`);

                // Process the event
                await processConsentRevocation(event);

                // Acknowledge the message
                await redisClient.xAck(streamKey, consumerGroup, message.id);

                console.log(`Acknowledged message: ${message.id}`);
              } catch (error) {
                console.error('Error processing message:', error);
                // Message will be retried by another consumer
              }
            }
          }
        }
      } catch (error) {
        console.error('Error reading from stream:', error);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error('Error starting consent propagation consumer:', error);
    throw error;
  }
}

/**
 * Get pending messages count
 */
export async function getPendingMessagesCount(): Promise<number> {
  try {
    await ensureRedisConnection();

    const streamKey = 'consent:revocations';
    const info = await redisClient.xPending(streamKey, 'consent-processor');

    return info ? info.pending : 0;
  } catch (error) {
    console.error('Error getting pending messages:', error);
    return 0;
  }
}

/**
 * Get stream statistics
 */
export async function getStreamStats(): Promise<{
  consentRevocations: number;
  leaseInvalidations: number;
  killSwitches: number;
}> {
  try {
    await ensureRedisConnection();

    const [consentInfo, leaseInfo, killInfo] = await Promise.all([
      redisClient.xLen('consent:revocations'),
      redisClient.xLen('leases:invalidations'),
      redisClient.xLen('sessions:kill_switch'),
    ]);

    return {
      consentRevocations: consentInfo || 0,
      leaseInvalidations: leaseInfo || 0,
      killSwitches: killInfo || 0,
    };
  } catch (error) {
    console.error('Error getting stream stats:', error);
    return {
      consentRevocations: 0,
      leaseInvalidations: 0,
      killSwitches: 0,
    };
  }
}

/**
 * Cleanup old stream messages
 */
export async function cleanupOldMessages(maxAge: number = 86400000): Promise<void> {
  try {
    await ensureRedisConnection();

    const streams = [
      'consent:revocations',
      'leases:invalidations',
      'sessions:kill_switch',
    ];

    const minTimestamp = Date.now() - maxAge;

    for (const stream of streams) {
      await redisClient.xTrim(stream, 'MINID', `${minTimestamp}`);
      console.log(`Cleaned up old messages from ${stream}`);
    }
  } catch (error) {
    console.error('Error cleaning up old messages:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down consent propagation...');
  await redisClient.quit();
  process.exit(0);
});

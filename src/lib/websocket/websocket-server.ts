/**
 * WebSocket Server for Real-time Communication
 * Handles real-time notifications, updates, and live data streaming
 */

import { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Redis } from 'ioredis';
import { verify } from 'jsonwebtoken';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  tenantId?: string;
  subscriptions: Set<string>;
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'message';
  channel?: string;
  data?: any;
}

interface BroadcastMessage {
  channel: string;
  event: string;
  data: any;
  timestamp: string;
}

export class XaseWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Set<AuthenticatedWebSocket>>;
  private channels: Map<string, Set<AuthenticatedWebSocket>>;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.clients = new Map();
    this.channels = new Map();

    this.setupWebSocketServer();
    this.setupRedisSubscriber();
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocketServer() {
    this.wss.on('connection', async (ws: AuthenticatedWebSocket, req) => {
      console.log('New WebSocket connection');

      // Initialize client
      ws.subscriptions = new Set();

      // Authenticate connection
      const token = this.extractToken(req.url || '');
      if (token) {
        try {
          const decoded = await this.verifyToken(token);
          ws.userId = decoded.userId;
          ws.tenantId = decoded.tenantId;

          // Add to clients map
          if (!this.clients.has(ws.userId)) {
            this.clients.set(ws.userId, new Set());
          }
          this.clients.get(ws.userId)!.add(ws);

          // Send authentication success
          this.send(ws, {
            type: 'auth',
            status: 'success',
            userId: ws.userId,
          });
        } catch (error) {
          this.send(ws, {
            type: 'auth',
            status: 'error',
            message: 'Invalid token',
          });
          ws.close();
          return;
        }
      }

      // Handle messages
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });

      // Handle close
      ws.on('close', () => {
        this.handleClose(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Send ping every 30 seconds
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          this.send(ws, { type: 'ping' });
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });
  }

  /**
   * Setup Redis subscriber for pub/sub
   */
  private setupRedisSubscriber() {
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.broadcastToChannel(channel, data);
      } catch (error) {
        console.error('Error parsing Redis message:', error);
      }
    });

    subscriber.on('error', (error) => {
      console.error('Redis subscriber error:', error);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: AuthenticatedWebSocket, data: any) {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          if (message.channel) {
            this.subscribe(ws, message.channel);
          }
          break;

        case 'unsubscribe':
          if (message.channel) {
            this.unsubscribe(ws, message.channel);
          }
          break;

        case 'ping':
          this.send(ws, { type: 'pong' });
          break;

        case 'message':
          // Handle custom messages if needed
          break;

        default:
          this.send(ws, {
            type: 'error',
            message: 'Unknown message type',
          });
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.send(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  }

  /**
   * Subscribe client to channel
   */
  private async subscribe(ws: AuthenticatedWebSocket, channel: string) {
    // Check authorization
    if (!this.isAuthorized(ws, channel)) {
      this.send(ws, {
        type: 'error',
        message: 'Not authorized to subscribe to this channel',
      });
      return;
    }

    // Add to channel
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
      // Subscribe to Redis channel
      await subscriber.subscribe(channel);
    }

    this.channels.get(channel)!.add(ws);
    ws.subscriptions.add(channel);

    this.send(ws, {
      type: 'subscribed',
      channel,
    });

    console.log(`Client subscribed to channel: ${channel}`);
  }

  /**
   * Unsubscribe client from channel
   */
  private async unsubscribe(ws: AuthenticatedWebSocket, channel: string) {
    if (this.channels.has(channel)) {
      this.channels.get(channel)!.delete(ws);
      ws.subscriptions.delete(channel);

      // If no more clients, unsubscribe from Redis
      if (this.channels.get(channel)!.size === 0) {
        this.channels.delete(channel);
        await subscriber.unsubscribe(channel);
      }

      this.send(ws, {
        type: 'unsubscribed',
        channel,
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleClose(ws: AuthenticatedWebSocket) {
    console.log('WebSocket connection closed');

    // Remove from all channels
    ws.subscriptions.forEach((channel) => {
      if (this.channels.has(channel)) {
        this.channels.get(channel)!.delete(ws);
      }
    });

    // Remove from clients map
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId)!.delete(ws);
      if (this.clients.get(ws.userId)!.size === 0) {
        this.clients.delete(ws.userId);
      }
    }
  }

  /**
   * Broadcast message to channel
   */
  private broadcastToChannel(channel: string, data: any) {
    if (this.channels.has(channel)) {
      const clients = this.channels.get(channel)!;
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          this.send(client, {
            type: 'message',
            channel,
            data,
          });
        }
      });
    }
  }

  /**
   * Send message to specific user
   */
  public sendToUser(userId: string, data: any) {
    if (this.clients.has(userId)) {
      const clients = this.clients.get(userId)!;
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          this.send(client, data);
        }
      });
    }
  }

  /**
   * Broadcast to all clients in tenant
   */
  public broadcastToTenant(tenantId: string, data: any) {
    this.clients.forEach((clients, userId) => {
      clients.forEach((client) => {
        if (client.tenantId === tenantId && client.readyState === WebSocket.OPEN) {
          this.send(client, data);
        }
      });
    });
  }

  /**
   * Publish message to Redis channel
   */
  public async publish(channel: string, event: string, data: any) {
    const message: BroadcastMessage = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    await redis.publish(channel, JSON.stringify(message));
  }

  /**
   * Send message to WebSocket client
   */
  private send(ws: WebSocket, data: any) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }

  /**
   * Extract token from URL
   */
  private extractToken(url: string): string | null {
    const match = url.match(/[?&]token=([^&]+)/);
    return match ? match[1] : null;
  }

  /**
   * Verify JWT token
   */
  private async verifyToken(token: string): Promise<{ userId: string; tenantId: string }> {
    return new Promise((resolve, reject) => {
      verify(token, process.env.NEXTAUTH_SECRET || 'secret', (err, decoded: any) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            userId: decoded.sub,
            tenantId: decoded.tenantId,
          });
        }
      });
    });
  }

  /**
   * Check if client is authorized for channel
   */
  private isAuthorized(ws: AuthenticatedWebSocket, channel: string): boolean {
    // Public channels
    if (channel.startsWith('public:')) {
      return true;
    }

    // Tenant channels
    if (channel.startsWith('tenant:')) {
      const tenantId = channel.split(':')[1];
      return ws.tenantId === tenantId;
    }

    // User channels
    if (channel.startsWith('user:')) {
      const userId = channel.split(':')[1];
      return ws.userId === userId;
    }

    return false;
  }

  /**
   * Get server statistics
   */
  public getStats() {
    return {
      totalConnections: this.wss.clients.size,
      authenticatedClients: this.clients.size,
      activeChannels: this.channels.size,
      channels: Array.from(this.channels.keys()).map((channel) => ({
        name: channel,
        subscribers: this.channels.get(channel)!.size,
      })),
    };
  }

  /**
   * Close server
   */
  public close() {
    this.wss.close();
    subscriber.quit();
  }
}

// Singleton instance
let wsServer: XaseWebSocketServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initWebSocketServer(server: HTTPServer): XaseWebSocketServer {
  if (!wsServer) {
    wsServer = new XaseWebSocketServer(server);
  }
  return wsServer;
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer(): XaseWebSocketServer | null {
  return wsServer;
}

/**
 * Publish notification to WebSocket
 */
export async function publishNotification(
  userId: string,
  type: string,
  data: any
) {
  if (wsServer) {
    await wsServer.publish(`user:${userId}`, type, data);
  }
}

/**
 * Publish tenant-wide notification
 */
export async function publishTenantNotification(
  tenantId: string,
  type: string,
  data: any
) {
  if (wsServer) {
    await wsServer.publish(`tenant:${tenantId}`, type, data);
  }
}

import { CloudProvider } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export interface CreateOAuthStateInput {
  tenantId: string;
  provider: CloudProvider;
  redirectPath?: string;
  metadata?: any;
}

export class OAuthStateService {
  async createState(input: CreateOAuthStateInput): Promise<string> {
    const state = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.oAuthState.create({
      data: {
        state,
        tenantId: input.tenantId,
        provider: input.provider,
        redirectPath: input.redirectPath,
        metadata: input.metadata,
        expiresAt,
      },
    });

    return state;
  }

  async getState(state: string): Promise<{
    valid: boolean;
    tenantId?: string;
    provider?: CloudProvider;
    redirectPath?: string;
    metadata?: any;
    expiresAt?: Date;
  }> {
    const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
    if (!oauthState) return { valid: false };
    if (oauthState.expiresAt < new Date()) {
      return { valid: false };
    }
    return {
      valid: true,
      tenantId: oauthState.tenantId,
      provider: oauthState.provider,
      redirectPath: oauthState.redirectPath || undefined,
      metadata: oauthState.metadata || undefined,
      expiresAt: oauthState.expiresAt,
    };
  }

  async deleteState(state: string): Promise<void> {
    await prisma.oAuthState.delete({ where: { state } }).catch(() => {});
  }

  async updateStateMetadata(state: string, metadata: any): Promise<void> {
    await prisma.oAuthState.update({
      where: { state },
      data: { metadata },
    }).catch(() => {});
  }

  async validateAndConsume(state: string): Promise<{
    valid: boolean;
    tenantId?: string;
    provider?: CloudProvider;
    redirectPath?: string;
    metadata?: any;
  }> {
    const oauthState = await prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!oauthState) {
      return { valid: false };
    }

    if (oauthState.expiresAt < new Date()) {
      await prisma.oAuthState.delete({ where: { state } });
      return { valid: false };
    }

    await prisma.oAuthState.delete({ where: { state } });

    return {
      valid: true,
      tenantId: oauthState.tenantId,
      provider: oauthState.provider,
      redirectPath: oauthState.redirectPath || undefined,
      metadata: oauthState.metadata || undefined,
    };
  }

  async cleanupExpiredStates(): Promise<number> {
    const result = await prisma.oAuthState.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }
}

export const oauthStateService = new OAuthStateService();

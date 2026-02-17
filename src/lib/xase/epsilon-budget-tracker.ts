/**
 * Epsilon Budget Tracker for Differential Privacy
 * 
 * Tracks and enforces epsilon budget consumption per tenant/dataset
 * to ensure privacy guarantees are maintained over time.
 */

import { prisma } from '@/lib/prisma';
import { Redis } from 'ioredis';

export interface EpsilonBudget {
  tenantId: string;
  datasetId: string;
  totalBudget: number;
  consumed: number;
  remaining: number;
  resetAt: Date;
  queries: EpsilonQuery[];
}

export interface EpsilonQuery {
  queryId: string;
  epsilon: number;
  timestamp: Date;
  userId: string;
  purpose: string;
}

export interface BudgetConfig {
  dailyBudget: number;
  weeklyBudget: number;
  monthlyBudget: number;
  resetPeriod: 'daily' | 'weekly' | 'monthly';
}

export class EpsilonBudgetTracker {
  private redis: Redis;
  private defaultConfig: BudgetConfig = {
    dailyBudget: 1.0,
    weeklyBudget: 5.0,
    monthlyBudget: 20.0,
    resetPeriod: 'daily',
  };

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  /**
   * Check if a query can be executed within budget
   */
  async canExecuteQuery(
    tenantId: string,
    datasetId: string,
    epsilon: number
  ): Promise<{ allowed: boolean; reason?: string; remaining?: number }> {
    const budget = await this.getBudget(tenantId, datasetId);
    
    if (budget.remaining < epsilon) {
      return {
        allowed: false,
        reason: `Insufficient epsilon budget. Required: ${epsilon}, Remaining: ${budget.remaining.toFixed(4)}`,
        remaining: budget.remaining,
      };
    }

    return {
      allowed: true,
      remaining: budget.remaining - epsilon,
    };
  }

  /**
   * Consume epsilon budget for a query
   */
  async consumeBudget(
    tenantId: string,
    datasetId: string,
    epsilon: number,
    userId: string,
    purpose: string,
    queryId: string
  ): Promise<EpsilonBudget> {
    // Check if budget is available
    const check = await this.canExecuteQuery(tenantId, datasetId, epsilon);
    if (!check.allowed) {
      throw new Error(check.reason);
    }

    // Consume budget in Redis (atomic operation)
    const key = this.getBudgetKey(tenantId, datasetId);
    const consumed = await this.redis.incrbyfloat(key, epsilon);

    // Log query to database
    await prisma.epsilonQuery.create({
      data: {
        queryId,
        tenantId,
        datasetId,
        epsilon,
        userId,
        purpose,
        timestamp: new Date(),
      },
    });

    // Get updated budget
    return this.getBudget(tenantId, datasetId);
  }

  /**
   * Get current budget status
   */
  async getBudget(tenantId: string, datasetId: string): Promise<EpsilonBudget> {
    const config = await this.getConfig(tenantId, datasetId);
    const key = this.getBudgetKey(tenantId, datasetId);
    
    // Get consumed budget from Redis
    const consumedStr = await this.redis.get(key);
    const consumed = consumedStr ? parseFloat(consumedStr) : 0;

    // Get total budget based on reset period
    const totalBudget = this.getTotalBudget(config);
    const remaining = Math.max(0, totalBudget - consumed);

    // Get reset time
    const resetAt = this.getResetTime(config.resetPeriod);

    // Get recent queries
    const queries = await this.getRecentQueries(tenantId, datasetId, 100);

    return {
      tenantId,
      datasetId,
      totalBudget,
      consumed,
      remaining,
      resetAt,
      queries,
    };
  }

  /**
   * Reset budget (called by scheduled job)
   */
  async resetBudget(tenantId: string, datasetId: string): Promise<void> {
    const key = this.getBudgetKey(tenantId, datasetId);
    await this.redis.del(key);

    // Archive old queries
    await prisma.epsilonQuery.updateMany({
      where: {
        tenantId,
        datasetId,
        archived: false,
      },
      data: {
        archived: true,
        archivedAt: new Date(),
      },
    });
  }

  /**
   * Get budget configuration for tenant/dataset
   */
  private async getConfig(tenantId: string, datasetId: string): Promise<BudgetConfig> {
    // Try to get custom config from database
    const customConfig = await prisma.epsilonBudgetConfig.findUnique({
      where: {
        tenantId_datasetId: {
          tenantId,
          datasetId,
        },
      },
    });

    if (customConfig) {
      return {
        dailyBudget: customConfig.dailyBudget,
        weeklyBudget: customConfig.weeklyBudget,
        monthlyBudget: customConfig.monthlyBudget,
        resetPeriod: customConfig.resetPeriod as 'daily' | 'weekly' | 'monthly',
      };
    }

    return this.defaultConfig;
  }

  /**
   * Get total budget based on reset period
   */
  private getTotalBudget(config: BudgetConfig): number {
    switch (config.resetPeriod) {
      case 'daily':
        return config.dailyBudget;
      case 'weekly':
        return config.weeklyBudget;
      case 'monthly':
        return config.monthlyBudget;
      default:
        return config.dailyBudget;
    }
  }

  /**
   * Get next reset time
   */
  private getResetTime(period: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date();
    const reset = new Date(now);

    switch (period) {
      case 'daily':
        reset.setDate(reset.getDate() + 1);
        reset.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        reset.setDate(reset.getDate() + (7 - reset.getDay()));
        reset.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        reset.setMonth(reset.getMonth() + 1);
        reset.setDate(1);
        reset.setHours(0, 0, 0, 0);
        break;
    }

    return reset;
  }

  /**
   * Get recent queries for a dataset
   */
  private async getRecentQueries(
    tenantId: string,
    datasetId: string,
    limit: number
  ): Promise<EpsilonQuery[]> {
    const queries = await prisma.epsilonQuery.findMany({
      where: {
        tenantId,
        datasetId,
        archived: false,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    return queries.map(q => ({
      queryId: q.queryId,
      epsilon: q.epsilon,
      timestamp: q.timestamp,
      userId: q.userId,
      purpose: q.purpose,
    }));
  }

  /**
   * Get Redis key for budget
   */
  private getBudgetKey(tenantId: string, datasetId: string): string {
    return `epsilon:budget:${tenantId}:${datasetId}`;
  }

  /**
   * Get budget statistics for a tenant
   */
  async getTenantStats(tenantId: string): Promise<{
    totalDatasets: number;
    totalConsumed: number;
    totalQueries: number;
    averageEpsilon: number;
    datasetsNearLimit: number;
  }> {
    const datasets = await prisma.dataset.findMany({
      where: { tenantId },
      select: { id: true },
    });

    let totalConsumed = 0;
    let datasetsNearLimit = 0;

    for (const dataset of datasets) {
      const budget = await this.getBudget(tenantId, dataset.id);
      totalConsumed += budget.consumed;
      
      // Near limit if remaining < 20% of total
      if (budget.remaining < budget.totalBudget * 0.2) {
        datasetsNearLimit++;
      }
    }

    const queries = await prisma.epsilonQuery.count({
      where: {
        tenantId,
        archived: false,
      },
    });

    const averageEpsilon = queries > 0 ? totalConsumed / queries : 0;

    return {
      totalDatasets: datasets.length,
      totalConsumed,
      totalQueries: queries,
      averageEpsilon,
      datasetsNearLimit,
    };
  }

  /**
   * Set custom budget configuration
   */
  async setConfig(
    tenantId: string,
    datasetId: string,
    config: Partial<BudgetConfig>
  ): Promise<BudgetConfig> {
    const updated = await prisma.epsilonBudgetConfig.upsert({
      where: {
        tenantId_datasetId: {
          tenantId,
          datasetId,
        },
      },
      create: {
        tenantId,
        datasetId,
        dailyBudget: config.dailyBudget ?? this.defaultConfig.dailyBudget,
        weeklyBudget: config.weeklyBudget ?? this.defaultConfig.weeklyBudget,
        monthlyBudget: config.monthlyBudget ?? this.defaultConfig.monthlyBudget,
        resetPeriod: config.resetPeriod ?? this.defaultConfig.resetPeriod,
      },
      update: {
        dailyBudget: config.dailyBudget,
        weeklyBudget: config.weeklyBudget,
        monthlyBudget: config.monthlyBudget,
        resetPeriod: config.resetPeriod,
      },
    });

    return {
      dailyBudget: updated.dailyBudget,
      weeklyBudget: updated.weeklyBudget,
      monthlyBudget: updated.monthlyBudget,
      resetPeriod: updated.resetPeriod as 'daily' | 'weekly' | 'monthly',
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

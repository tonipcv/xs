import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KillSwitch, getKillSwitch, resetKillSwitch } from '@/lib/preparation/kill-switch';
import { prisma } from '@/lib/prisma';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    preparationJob: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    jobLog: {
      create: vi.fn(),
    },
  },
}));

describe('KillSwitch', () => {
  let killSwitch: KillSwitch;

  beforeEach(() => {
    resetKillSwitch();
    killSwitch = getKillSwitch(100); // 100ms check interval for faster tests
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should register a job for cancellation tracking', () => {
    const token = killSwitch.registerJob('job-123', 'tenant-456');

    expect(token.jobId).toBe('job-123');
    expect(token.tenantId).toBe('tenant-456');
    expect(token.cancelled).toBe(false);
  });

  it('should request cancellation of a job', async () => {
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      id: 'job-123',
      tenantId: 'tenant-456',
      status: 'active',
      progress: 50,
    } as any);

    vi.mocked(prisma.preparationJob.update).mockResolvedValue({} as any);

    const result = await killSwitch.requestCancellation('job-123', 'tenant-456', 'Test cancellation');

    expect(result).toBe(true);
    expect(prisma.preparationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-123' },
      data: expect.objectContaining({
        status: 'cancelled',
        error: 'Cancelled: Test cancellation',
      }),
    });
  });

  it('should not cancel non-existent job', async () => {
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue(null);

    const result = await killSwitch.requestCancellation('non-existent', 'tenant-456');

    expect(result).toBe(false);
  });

  it('should not cancel already completed job', async () => {
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      id: 'job-123',
      tenantId: 'tenant-456',
      status: 'completed',
    } as any);

    const result = await killSwitch.requestCancellation('job-123', 'tenant-456');

    expect(result).toBe(false);
  });

  it('should check if job is cancelled', () => {
    killSwitch.registerJob('job-123', 'tenant-456');

    expect(killSwitch.isCancelled('job-123')).toBe(false);

    // Simulate cancellation
    killSwitch.requestCancellation('job-123', 'tenant-456');

    // After polling, should be cancelled
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      status: 'cancelled',
    } as any);
  });

  it('should poll for cancellation status', async () => {
    killSwitch.registerJob('job-123', 'tenant-456');

    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      status: 'cancelled',
    } as any);

    const isCancelled = await killSwitch.pollCancellation('job-123', 'tenant-456');

    expect(isCancelled).toBe(true);
  });

  it('should create abort controller', async () => {
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      status: 'active',
    } as any);

    const controller = killSwitch.createAbortController('job-123', 'tenant-456');

    expect(controller).toBeDefined();
    expect(controller.signal).toBeDefined();
    expect(controller.signal.aborted).toBe(false);

    // Clean up
    controller.abort();
  });

  it('should force kill a job', async () => {
    vi.mocked(prisma.preparationJob.findFirst).mockResolvedValue({
      id: 'job-123',
      tenantId: 'tenant-456',
      status: 'active',
      progress: 75,
    } as any);

    vi.mocked(prisma.preparationJob.update).mockResolvedValue({} as any);

    const result = await killSwitch.forceKill('job-123', 'tenant-456');

    expect(result).toBe(true);
    expect(prisma.preparationJob.update).toHaveBeenCalledWith({
      where: { id: 'job-123' },
      data: expect.objectContaining({
        status: 'failed',
        error: 'Killed: Force termination',
      }),
    });
  });

  it('should unregister job after completion', () => {
    killSwitch.registerJob('job-123', 'tenant-456');
    expect(killSwitch.getToken('job-123')).toBeDefined();

    killSwitch.unregisterJob('job-123');
    expect(killSwitch.getToken('job-123')).toBeUndefined();
  });

  it('should return singleton instance', () => {
    const instance1 = getKillSwitch();
    const instance2 = getKillSwitch();

    expect(instance1).toBe(instance2);
  });
});

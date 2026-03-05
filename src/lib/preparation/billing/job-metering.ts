import { prisma } from '@/lib/prisma';

export interface MeteringData {
  jobId: string;
  tenantId: string;
  datasetId: string;
  recordsProcessed: number;
  bytesProcessed: number;
  computeTimeMs: number;
  storageUsedBytes: number;
}

export class JobMetering {
  async recordUsage(data: MeteringData): Promise<void> {
    const costPerRecord = 0.001; // $0.001 per record
    const costPerGb = 0.10; // $0.10 per GB processed
    const costPerComputeHour = 0.50; // $0.50 per compute hour

    const recordCost = data.recordsProcessed * costPerRecord;
    const dataCost = (data.bytesProcessed / (1024 * 1024 * 1024)) * costPerGb;
    const computeCost = (data.computeTimeMs / (1000 * 60 * 60)) * costPerComputeHour;

    const totalCost = recordCost + dataCost + computeCost;

    const currentBalance = await this.checkBalance(data.tenantId);
    const newBalance = currentBalance - totalCost;

    await prisma.creditLedger.create({
      data: {
        tenantId: data.tenantId,
        amount: -totalCost,
        eventType: 'PREPARATION_JOB',
        balanceAfter: newBalance,
        description: `Data preparation job ${data.jobId}`,
        metadata: {
          jobId: data.jobId,
          datasetId: data.datasetId,
          recordsProcessed: data.recordsProcessed,
          bytesProcessed: data.bytesProcessed,
          computeTimeMs: data.computeTimeMs,
          breakdown: {
            recordCost,
            dataCost,
            computeCost,
          },
        },
      },
    });

    console.log(`💰 Metered job ${data.jobId}: $${totalCost.toFixed(4)}`);
  }

  async checkBalance(tenantId: string): Promise<number> {
    const ledger = await prisma.creditLedger.findMany({
      where: { tenantId },
      select: { amount: true },
    });

    return ledger.reduce((sum, entry) => sum + Number(entry.amount), 0);
  }

  async hasEnoughCredits(tenantId: string, estimatedCost: number): Promise<boolean> {
    const balance = await this.checkBalance(tenantId);
    return balance >= estimatedCost;
  }
}

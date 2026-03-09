/**
 * Preparation Queue - Stub implementation for testing
 */

export interface PreparationJob {
  jobId: string;
  datasetId: string;
  config: Record<string, unknown>;
  tenantId: string;
}

export class PreparationQueue {
  private jobs: Map<string, PreparationJob> = new Map();

  async addJob(job: PreparationJob): Promise<void> {
    this.jobs.set(job.jobId, job);
    console.log(`Job ${job.jobId} added to preparation queue`);
  }

  async getJob(jobId: string): Promise<PreparationJob | null> {
    return this.jobs.get(jobId) || null;
  }

  async removeJob(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }
}

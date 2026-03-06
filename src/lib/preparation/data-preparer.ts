import { PreparationRequest, PreparationJob, PreparationResult, NormalizationResult, CompilationResult, DeliveryResult } from './preparation.types';
import { TextNormalizer } from './normalize/text-normalizer';
import { DeidPipeline } from './normalize/deid-pipeline';
import { QualityGate } from './normalize/quality-gate';
import { CompilerRegistry } from './compile/compiler-registry';
import { Packager } from './deliver/packager';
import { SignedUrlGenerator } from './deliver/signed-urls';
import { JobMetering } from './billing/job-metering';
import { prisma } from '@/lib/prisma';

export class DataPreparer {
  private textNormalizer: TextNormalizer;
  private deidPipeline: DeidPipeline;
  private qualityGate: QualityGate;
  private compilerRegistry: CompilerRegistry;
  private packager: Packager;
  private urlGenerator: SignedUrlGenerator;
  private metering: JobMetering;

  constructor() {
    this.textNormalizer = new TextNormalizer();
    this.deidPipeline = new DeidPipeline();
    this.qualityGate = new QualityGate();
    this.compilerRegistry = new CompilerRegistry();
    this.packager = new Packager();
    this.urlGenerator = new SignedUrlGenerator();
    this.metering = new JobMetering();
  }

  async prepare(job: PreparationJob): Promise<PreparationResult> {
    const { request, datasetId, tenantId } = job;

    await this.updateJobStatus(job.id, 'normalizing', 10);
    const normalization = await this.normalize(datasetId, tenantId, request);
    await this.persistNormalizationResult(job.id, normalization);

    await this.updateJobStatus(job.id, 'compiling', 40);
    const compilation = await this.compile(datasetId, request, normalization);
    await this.persistCompilationResult(job.id, compilation);

    await this.updateJobStatus(job.id, 'delivering', 80);
    const delivery = await this.deliver(job, compilation);
    await this.persistDeliveryMetadata(job.id, delivery);

    await this.updateJobStatus(job.id, 'completed', 100);

    await this.metering.recordUsage({
      jobId: job.id,
      tenantId,
      datasetId,
      recordsProcessed: normalization.recordsProcessed,
      bytesProcessed: compilation.totalSizeBytes,
      computeTimeMs: Date.now() - job.startTime,
      storageUsedBytes: compilation.totalSizeBytes,
    });

    return {
      jobId: job.id,
      normalization,
      compilation,
      delivery,
    };
  }

  private async normalize(
    datasetId: string,
    tenantId: string,
    request: PreparationRequest
  ): Promise<NormalizationResult> {
    let recordsProcessed = 0;
    let recordsFiltered = 0;
    let deduplicatedCount = 0;

    if (request.modality === 'text') {
      const normalized = await this.textNormalizer.normalize(datasetId);
      recordsProcessed = normalized.recordCount;
    }

    if (request.config?.deid) {
      const deid = await this.deidPipeline.apply(datasetId, request.modality);
      recordsFiltered += deid.recordsRedacted;
    }

    if (request.config?.deduplicate || request.config?.quality_threshold) {
      const quality = await this.qualityGate.filter(datasetId, {
        deduplicate: request.config.deduplicate ?? false,
        threshold: request.config.quality_threshold ?? 0.5,
      });
      recordsFiltered += quality.recordsFiltered;
      deduplicatedCount = quality.deduplicatedCount;
    }

    return {
      recordsProcessed,
      recordsFiltered,
      qualityScore: 0.85,
      deduplicatedCount,
      deidApplied: request.config?.deid ?? false,
    };
  }

  private async compile(
    datasetId: string,
    request: PreparationRequest,
    normalization: NormalizationResult
  ): Promise<CompilationResult> {
    const compiler = this.compilerRegistry.getCompiler(
      request.task,
      request.modality,
      request.target.runtime
    );

    const result = await compiler.compile(datasetId, request.config ?? {});

    return {
      format: request.target.format,
      shardCount: result.shardCount,
      totalSizeBytes: result.totalSizeBytes,
      recordCount: normalization.recordsProcessed - normalization.recordsFiltered,
      outputPaths: result.outputPaths,
    };
  }

  private async deliver(
    job: PreparationJob,
    compilation: CompilationResult
  ): Promise<DeliveryResult> {
    const packageResult = await this.packager.package(job.datasetId, job.id, compilation, job.request);

    const urls = await this.urlGenerator.generateUrls(
      compilation.outputPaths,
      job.request.leaseId
    );

    return {
      manifestPath: packageResult.manifestPath,
      checksumPath: packageResult.checksumPath,
      readmePath: packageResult.readmePath,
      downloadUrls: urls,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
  }

  private async persistNormalizationResult(jobId: string, normalization: NormalizationResult): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        normalizationResult: normalization as any,
      },
    });
  }

  private async persistCompilationResult(jobId: string, compilation: CompilationResult): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        compilationResult: compilation as any,
      },
    });
  }

  private async persistDeliveryMetadata(jobId: string, delivery: DeliveryResult): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: {
        manifestPath: delivery.manifestPath,
        checksumPath: delivery.checksumPath,
        readmePath: delivery.readmePath,
        downloadUrls: delivery.downloadUrls,
        deliveryExpiresAt: delivery.expiresAt,
      },
    });
  }

  private async updateJobStatus(
    jobId: string,
    status: PreparationJob['status'],
    progress: number
  ): Promise<void> {
    await prisma.preparationJob.update({
      where: { id: jobId },
      data: { status, progress, updatedAt: new Date() },
    });
  }
}

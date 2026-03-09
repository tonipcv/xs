import { QualityReport } from '@/lib/ingestion/quality-validator';

export type TaskType = 'pre-training' | 'fine-tuning' | 'dpo' | 'rag' | 'eval';
export type Modality = 'text' | 'image' | 'audio' | 'multimodal';
export type Runtime = 'hf' | 'openai' | 'megatron' | 'mosaic' | 'trl' | 'pytorch' | 'generic';
export type Format = 'jsonl' | 'parquet' | 'bin' | 'mds' | 'webdataset';

export interface PreparationTarget {
  runtime: Runtime;
  format: Format;
}

export interface PreparationConfig {
  quality_threshold?: number;
  deduplicate?: boolean;
  deid?: boolean;
  max_tokens?: number;
  seed?: number;
  add_eos_token?: boolean;
  eos_token?: string;
  separator?: string;
  chunk_size?: number;
  chunk_overlap?: number;
  chunk_tokens?: number;
  overlap_tokens?: number;
  preserveMetadata?: boolean;
  template?: 'chatml' | 'alpaca' | 'sharegpt';
  system_prompt?: string;
  instruction?: string;
  split_ratios?: { train: number; val: number; test: number };
  shard_size_mb?: number;
  stratify_by?: string;
  output_format?: 'jsonl' | 'parquet';
  output_compression?: 'none' | 'gzip';
  input_field?: string;
  output_field?: string;
  label_field?: string;
  // Campos adicionais conforme Apêndice A
  max_samples?: number;
  max_tokens_per_example?: number;
  min_tokens?: number;
  shuffle?: boolean;
  balance?: boolean;
  chosen_field?: string;
  rejected_field?: string;
  embedding_provider?: 'openai' | 'cohere' | 'local' | 'huggingface';
  embedding_model?: string;
  include_metadata?: boolean;
  // Allow additional properties for flexibility
  [key: string]: unknown;
}

export interface PreparationLicense {
  type: string;
  attribution?: string;
  restrictions?: string[];
  // Additional fields for compatibility
  allowCommercial?: boolean;
  allowResearch?: boolean;
  allowTraining?: boolean;
  requireAttribution?: boolean;
}

export interface PreparationPrivacy {
  piiHandling: 'drop' | 'mask' | 'retain';
  patientTokenization?: 'none' | 'hmac-sha256';
  retentionHours?: number;
  auditLogRequired?: boolean;
  // Additional fields for compatibility
  anonymize?: boolean;
}

export interface PreparationOutputContract {
  layout: string;
  manifestFile: string;
  readmeFile: string;
  checksumFile: string;
  checksumAlgorithm: 'sha256';
}

export interface PreparationSpec {
  version: string;
  task: TaskType;
  modality: Modality;
  target: PreparationTarget;
  config?: PreparationConfig;
  license: PreparationLicense;
  privacy: PreparationPrivacy;
  output: PreparationOutputContract;
}

export type PreparationRequest = PreparationSpec & {
  leaseId: string;
};

export interface PreparationJob {
  id: string;
  datasetId: string;
  tenantId: string;
  request: PreparationRequest;
  startTime: number;
  status: 'pending' | 'normalizing' | 'compiling' | 'delivering' | 'completed' | 'failed';
  progress: number;
  outputPath?: string;
  manifestUrl?: string;
  manifestPath?: string;
  checksumPath?: string;
  readmePath?: string;
  downloadUrls?: string[];
  deliveryExpiresAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface NormalizationResult {
  recordsProcessed: number;
  recordsFiltered: number;
  qualityScore: number;
  deduplicatedCount: number;
  deidApplied: boolean;
  qualityReport?: QualityReport;
  // Alias for compatibility
  recordCount?: number;
}

export interface CompilationResult {
  format: Format;
  shardCount: number;
  totalSizeBytes: number;
  recordCount: number;
  outputPaths: string[];
  stats?: Record<string, unknown>;
}

export interface DeliveryResult {
  manifestPath: string;
  checksumPath: string;
  readmePath: string;
  downloadUrls: string[];
  expiresAt: Date;
  // Additional fields for tests
  checksums?: Record<string, string>;
  recordCount?: number;
}

export interface PreparationResult {
  jobId: string;
  normalization: NormalizationResult;
  compilation: CompilationResult;
  delivery: DeliveryResult;
}

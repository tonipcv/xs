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
  chunk_size?: number;
  chunk_overlap?: number;
  template?: 'chatml' | 'alpaca' | 'sharegpt';
  split_ratios?: { train: number; val: number; test: number };
  shard_size_mb?: number;
}

export interface PreparationRequest {
  leaseId: string;
  task: TaskType;
  modality: Modality;
  target: PreparationTarget;
  config?: PreparationConfig;
}

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
}

export interface CompilationResult {
  format: Format;
  shardCount: number;
  totalSizeBytes: number;
  recordCount: number;
  outputPaths: string[];
}

export interface DeliveryResult {
  manifestPath: string;
  checksumPath: string;
  readmePath: string;
  downloadUrls: string[];
  expiresAt: Date;
}

export interface PreparationResult {
  jobId: string;
  normalization: NormalizationResult;
  compilation: CompilationResult;
  delivery: DeliveryResult;
}

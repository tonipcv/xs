# PreparationSpec Contract (v1.0)

## Overview

The `PreparationSpec` defines the complete contract for dataset preparation requests in the XASE platform. All fields are validated at the API layer, persisted in the database, and propagated to output manifests and README files.

## Schema Definition

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `leaseId` | string | Active lease ID authorizing the preparation run |
| `version` | string | Contract version (currently `"1.0"`) |
| `task` | enum | Task type: `pre-training`, `fine-tuning`, `dpo`, `rag`, `eval` |
| `modality` | enum | Data modality: `text`, `image`, `audio`, `multimodal` |
| `target.runtime` | enum | Target runtime: `hf`, `openai`, `megatron`, `mosaic`, `trl`, `pytorch`, `generic` |
| `target.format` | enum | Output format: `jsonl`, `parquet`, `bin`, `mds`, `webdataset` |
| `license` | object | License metadata (see below) |
| `privacy` | object | Privacy configuration (see below) |
| `output` | object | Output layout contract (see below) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `config` | object | Task-specific configuration options (see below) |

## License Object

```typescript
{
  type: string;              // License type (e.g., "CC-BY-4.0", "MIT", "Proprietary")
  attribution?: string;      // Attribution requirements
  restrictions?: string[];   // Usage restrictions
}
```

**Examples:**
```json
{
  "type": "CC-BY-4.0",
  "attribution": "ACME Healthcare Corp",
  "restrictions": ["no-commercial-use", "research-only"]
}
```

## Privacy Object

```typescript
{
  piiHandling: 'drop' | 'mask' | 'retain';           // PII handling strategy
  patientTokenization?: 'none' | 'hmac-sha256';      // Patient ID tokenization
  retentionHours?: number;                            // Data retention period
  auditLogRequired?: boolean;                         // Require audit logging
}
```

**Examples:**
```json
{
  "piiHandling": "mask",
  "patientTokenization": "hmac-sha256",
  "retentionHours": 72,
  "auditLogRequired": true
}
```

## Output Contract Object

```typescript
{
  layout: string;              // S3 layout template (supports {datasetId}, {jobId})
  manifestFile: string;        // Manifest filename
  readmeFile: string;          // README filename
  checksumFile: string;        // Checksums filename
  checksumAlgorithm: 'sha256'; // Checksum algorithm
}
```

**Defaults:**
```json
{
  "layout": "prepared/{datasetId}/{jobId}",
  "manifestFile": "manifest.json",
  "readmeFile": "README.md",
  "checksumFile": "checksums.txt",
  "checksumAlgorithm": "sha256"
}
```

## Config Object (Optional)

Task-specific configuration options:

```typescript
{
  quality_threshold?: number;      // 0-1, minimum quality score
  deduplicate?: boolean;           // Enable deduplication
  deid?: boolean;                  // Enable de-identification
  max_tokens?: number;             // Maximum tokens per record
  seed?: number;                   // Random seed for reproducibility
  chunk_size?: number;             // Chunk size for RAG
  chunk_overlap?: number;          // Chunk overlap for RAG
  template?: 'chatml' | 'alpaca' | 'sharegpt';  // Chat template
  split_ratios?: {                 // Train/val/test split
    train: number;
    val: number;
    test: number;
  };
  shard_size_mb?: number;          // Shard size in MB
}
```

## Complete Request Example

```json
{
  "leaseId": "lease_abc123xyz",
  "version": "1.0",
  "task": "pre-training",
  "modality": "text",
  "target": {
    "runtime": "hf",
    "format": "jsonl"
  },
  "config": {
    "deduplicate": true,
    "quality_threshold": 0.8,
    "shard_size_mb": 100,
    "max_tokens": 8192,
    "seed": 42
  },
  "license": {
    "type": "CC-BY-4.0",
    "attribution": "ACME Healthcare Research",
    "restrictions": ["research-only"]
  },
  "privacy": {
    "piiHandling": "mask",
    "patientTokenization": "hmac-sha256",
    "retentionHours": 72,
    "auditLogRequired": true
  },
  "output": {
    "layout": "prepared/{datasetId}/{jobId}",
    "manifestFile": "manifest.json",
    "readmeFile": "README.md",
    "checksumFile": "checksums.txt",
    "checksumAlgorithm": "sha256"
  }
}
```

## Output Manifest Structure

The generated `manifest.json` includes all contract fields plus compilation results:

```json
{
  "version": "1.0",
  "task": "pre-training",
  "modality": "text",
  "target": {
    "runtime": "hf",
    "format": "jsonl"
  },
  "config": {
    "deduplicate": true,
    "quality_threshold": 0.8,
    "shard_size_mb": 100
  },
  "license": {
    "type": "CC-BY-4.0",
    "attribution": "ACME Healthcare Research"
  },
  "privacy": {
    "piiHandling": "mask",
    "patientTokenization": "hmac-sha256"
  },
  "output": {
    "layout": "prepared/{datasetId}/{jobId}",
    "manifestFile": "manifest.json",
    "readmeFile": "README.md",
    "checksumFile": "checksums.txt",
    "checksumAlgorithm": "sha256"
  },
  "compilation": {
    "format": "jsonl",
    "shardCount": 4,
    "totalSizeBytes": 1073741824,
    "recordCount": 1200000
  },
  "files": [
    "shard-000.jsonl",
    "shard-001.jsonl",
    "shard-002.jsonl",
    "shard-003.jsonl"
  ],
  "createdAt": "2026-03-05T22:14:00.000Z"
}
```

## Output Directory Layout

Following the `output.layout` pattern, files are organized as:

```
s3://bucket/prepared/{datasetId}/{jobId}/
├── manifest.json          # Full metadata and file listing
├── README.md              # Human-readable documentation
├── checksums.txt          # SHA256 checksums for all files
├── shard-000.jsonl        # Data shard 0
├── shard-001.jsonl        # Data shard 1
├── shard-002.jsonl        # Data shard 2
└── shard-003.jsonl        # Data shard 3
```

## README.md Structure

The generated README includes:

- **Overview**: Task, modality, runtime, format
- **License**: Type and attribution
- **Privacy**: PII handling strategy
- **Compilation Results**: Shard count, total size, record count
- **Files**: List of all output files
- **Usage**: Instructions for loading the dataset
- **Verification**: Checksum verification command

## Validation Rules

### API Layer (Zod Schema)

- All required fields must be present
- Enums must match allowed values
- `split_ratios` must sum to 1.0 (±0.0001 tolerance)
- `quality_threshold` must be between 0 and 1
- Positive integers for `max_tokens`, `chunk_size`, `shard_size_mb`
- Non-negative integer for `chunk_overlap`

### Database Layer

- `license`, `privacy`, and `output` are stored as JSONB
- `config` is stored as TEXT (JSON string)
- All fields are persisted on `preparation_jobs` table

## API Endpoint

**POST** `/api/v1/datasets/{datasetId}/prepare`

**Headers:**
- `x-api-key`: API key for authentication
- `Content-Type`: application/json

**Request Body:** PreparationSpec (see example above)

**Response:**
```json
{
  "jobId": "cljx1234567890",
  "status": "pending",
  "progress": 0,
  "createdAt": "2026-03-05T22:14:00.000Z"
}
```

## Status Tracking

**GET** `/api/v1/preparation/jobs/{jobId}`

**Response:**
```json
{
  "jobId": "cljx1234567890",
  "datasetId": "ds_abc123",
  "status": "completed",
  "progress": 100,
  "outputPath": "prepared/ds_abc123/cljx1234567890",
  "manifestUrl": "https://s3.../manifest.json",
  "createdAt": "2026-03-05T22:14:00.000Z",
  "completedAt": "2026-03-05T22:20:00.000Z"
}
```

## Job Status States

- `pending`: Job created, waiting to start
- `normalizing`: Text normalization, de-id, quality filtering
- `compiling`: Format conversion and sharding
- `delivering`: Packaging, manifest generation, URL signing
- `completed`: Job finished successfully
- `failed`: Job encountered an error

## Error Handling

If validation fails, the API returns 400 with detailed error messages:

```json
{
  "error": "Invalid request",
  "details": {
    "fieldErrors": {
      "license": ["Required"],
      "privacy.piiHandling": ["Invalid enum value"]
    }
  }
}
```

## Versioning

The contract version (`"1.0"`) allows for future extensions while maintaining backward compatibility. Future versions may add new fields or options without breaking existing clients.

## Best Practices

1. **Always specify license**: Clearly document data usage rights
2. **Configure privacy appropriately**: Match your compliance requirements
3. **Use meaningful layouts**: Include dataset and job IDs for traceability
4. **Set quality thresholds**: Filter low-quality data early
5. **Enable deduplication**: Reduce training data redundancy
6. **Specify seed for reproducibility**: Ensure consistent splits
7. **Validate checksums**: Always verify file integrity after download

## Related Documentation

- [Preparation Pipeline Architecture](./PREPARATION_PIPELINE_SUMMARY.md)
- [Compiler Registry](../src/lib/preparation/compile/compiler-registry.ts)
- [API Reference](../src/app/api/v1/datasets/[datasetId]/prepare/route.ts)

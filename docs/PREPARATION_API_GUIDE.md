# XASE Data Preparation API - Developer Guide

## Overview

The XASE Data Preparation API provides a comprehensive pipeline for preparing datasets for machine learning tasks including pre-training, fine-tuning, RAG, and evaluation.

## Quick Start

### 1. Create a Preparation Job

```typescript
POST /api/v1/datasets/{datasetId}/prepare

{
  "version": "1.0",
  "task": "rag",
  "modality": "text",
  "target": {
    "runtime": "generic",
    "format": "jsonl"
  },
  "config": {
    "chunk_tokens": 512,
    "overlap_tokens": 50,
    "preserveMetadata": true,
    "deduplicate": true,
    "quality_threshold": 0.7
  },
  "license": {
    "type": "MIT",
    "attribution": "XASE Dataset"
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
  "leaseId": "lease_abc123"
}
```

### 2. Check Job Status

```typescript
GET /api/v1/preparation/jobs/{jobId}

Response:
{
  "id": "job_xyz789",
  "status": "completed",
  "progress": 100,
  "normalizationResult": {
    "recordsProcessed": 1000,
    "recordsFiltered": 50,
    "qualityScore": 0.85,
    "deduplicatedCount": 20
  },
  "compilationResult": {
    "format": "jsonl",
    "shardCount": 1,
    "totalSizeBytes": 5242880,
    "recordCount": 950
  },
  "deliveryResult": {
    "manifestPath": "/tmp/prepared/.../manifest.json",
    "downloadUrls": ["https://s3.../chunk-0.jsonl"],
    "expiresAt": "2026-03-12T23:00:00Z"
  }
}
```

## Task Types

### RAG (Retrieval-Augmented Generation)

Chunks text into overlapping segments for vector search.

```typescript
{
  "task": "rag",
  "modality": "text",
  "target": { "runtime": "generic", "format": "jsonl" },
  "config": {
    "chunk_tokens": 512,
    "overlap_tokens": 50,
    "preserveMetadata": true
  }
}
```

**Output Format:**
```json
{
  "chunk_id": "doc123_chunk_0",
  "text": "Patient presents with...",
  "metadata": {
    "source_id": "doc123",
    "chunk_index": 0,
    "total_chunks": 5,
    "start_offset": 0,
    "end_offset": 512
  }
}
```

### SFT (Supervised Fine-Tuning)

Formats instruction-response pairs for model fine-tuning.

#### ChatML Template (OpenAI, Mistral)

```typescript
{
  "task": "fine-tuning",
  "modality": "text",
  "target": { "runtime": "openai", "format": "jsonl" },
  "config": {
    "template": "chatml",
    "system_prompt": "You are a helpful medical assistant."
  }
}
```

**Output Format:**
```json
{
  "messages": [
    { "role": "system", "content": "You are a helpful medical assistant." },
    { "role": "user", "content": "What are the symptoms of pneumonia?" },
    { "role": "assistant", "content": "Common symptoms include fever, cough..." }
  ]
}
```

#### Alpaca Template (Vicuna, Instruction-Tuned)

```typescript
{
  "task": "fine-tuning",
  "modality": "text",
  "target": { "runtime": "hf", "format": "jsonl" },
  "config": {
    "template": "alpaca",
    "instruction": "Provide a clinical diagnosis based on symptoms."
  }
}
```

**Output Format:**
```json
{
  "text": "### Instruction:\nProvide a clinical diagnosis...\n\n### Input:\nPatient has fever...\n\n### Response:\nLikely diagnosis: Pneumonia..."
}
```

#### ShareGPT Template

```typescript
{
  "task": "fine-tuning",
  "modality": "text",
  "target": { "runtime": "hf", "format": "jsonl" },
  "config": {
    "template": "sharegpt"
  }
}
```

**Output Format:**
```json
{
  "conversations": [
    { "from": "human", "value": "What is pneumonia?" },
    { "from": "gpt", "value": "Pneumonia is an infection..." }
  ]
}
```

## Quality Filtering

### Deduplication

Remove exact duplicate records based on SHA256 content hash.

```typescript
{
  "config": {
    "deduplicate": true
  }
}
```

### Quality Scoring

Filter low-quality records based on heuristics:
- **Alpha ratio**: Penalizes text with < 50% alphabetic characters
- **Line length**: Penalizes very short average line lengths
- **Character diversity**: Penalizes text with < 10 unique characters

```typescript
{
  "config": {
    "quality_threshold": 0.7  // 0.0 to 1.0
  }
}
```

### Combined Filtering

```typescript
{
  "config": {
    "deduplicate": true,
    "quality_threshold": 0.7
  }
}
```

**Result:**
```json
{
  "normalizationResult": {
    "recordsProcessed": 1000,
    "recordsFiltered": 70,
    "deduplicatedCount": 20,
    "qualityScore": 0.85
  }
}
```

## Privacy & Compliance

### PII Handling

```typescript
{
  "privacy": {
    "piiHandling": "mask",           // "drop" | "mask" | "retain"
    "patientTokenization": "hmac-sha256",
    "retentionHours": 168,
    "auditLogRequired": true
  }
}
```

### License Management

```typescript
{
  "license": {
    "type": "CC-BY-4.0",
    "attribution": "Medical Dataset Consortium",
    "restrictions": ["no-commercial-use", "attribution-required"]
  }
}
```

## Output Artifacts

Every preparation job generates:

### 1. Manifest (`manifest.json`)

Complete metadata about the prepared dataset:

```json
{
  "version": "1.0",
  "task": "rag",
  "modality": "text",
  "compilation": {
    "format": "jsonl",
    "shardCount": 1,
    "totalSizeBytes": 5242880,
    "recordCount": 950
  },
  "license": { "type": "MIT" },
  "privacy": { "piiHandling": "mask" },
  "files": ["rag-corpus.jsonl"],
  "createdAt": "2026-03-05T23:00:00Z"
}
```

### 2. README (`README.md`)

Human-readable documentation:

```markdown
# Dataset Preparation Output

## Overview
- **Task**: rag
- **Modality**: text
- **Format**: jsonl
- **License**: MIT
- **PII Handling**: mask

## Compilation Results
- **Shards**: 1
- **Total Size**: 5.00 MB
- **Records**: 950

## Files
- rag-corpus.jsonl

## Usage
Load this dataset using your training framework...

## Verification
Verify file integrity using checksums.txt:
```bash
sha256sum -c checksums.txt
```
```

### 3. Checksums (`checksums.txt`)

SHA256 checksums for all output files:

```
a1b2c3d4e5f6... rag-corpus.jsonl
```

### 4. Signed URLs

Pre-signed S3 URLs for downloading (7-day expiry):

```json
{
  "downloadUrls": [
    "https://s3.amazonaws.com/bucket/prepared/.../rag-corpus.jsonl?X-Amz-..."
  ],
  "expiresAt": "2026-03-12T23:00:00Z"
}
```

## Configuration Reference

### PreparationConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `quality_threshold` | number | 0.5 | Quality score threshold (0-1) |
| `deduplicate` | boolean | false | Enable exact deduplication |
| `deid` | boolean | false | Enable de-identification |
| `chunk_tokens` | number | 512 | Tokens per chunk (RAG) |
| `overlap_tokens` | number | 50 | Overlap between chunks (RAG) |
| `preserveMetadata` | boolean | true | Include metadata in chunks |
| `template` | string | 'chatml' | SFT template: chatml/alpaca/sharegpt |
| `system_prompt` | string | - | System message for SFT |
| `instruction` | string | - | Instruction for Alpaca template |
| `seed` | number | - | Random seed for reproducibility |
| `shard_size_mb` | number | 100 | Target shard size in MB |

## Error Handling

### Common Errors

**Invalid Lease:**
```json
{
  "error": "Lease not found or expired",
  "code": "INVALID_LEASE"
}
```

**Validation Error:**
```json
{
  "error": "Invalid configuration",
  "details": [
    "quality_threshold must be between 0 and 1",
    "chunk_tokens must be positive"
  ]
}
```

**Job Failed:**
```json
{
  "status": "failed",
  "error": "Compilation failed: insufficient records after filtering"
}
```

## Best Practices

### 1. Start with Quality Filtering

Always enable deduplication and quality filtering:

```typescript
{
  "config": {
    "deduplicate": true,
    "quality_threshold": 0.7
  }
}
```

### 2. Choose Appropriate Chunk Size

- **Small models (< 1B params)**: 256-512 tokens
- **Medium models (1-7B params)**: 512-1024 tokens
- **Large models (> 7B params)**: 1024-2048 tokens

### 3. Use Overlap for RAG

Recommended overlap: 10-20% of chunk size

```typescript
{
  "chunk_tokens": 512,
  "overlap_tokens": 50  // ~10%
}
```

### 4. Validate Output

Always verify checksums after download:

```bash
sha256sum -c checksums.txt
```

### 5. Monitor Job Progress

Poll job status every 5-10 seconds:

```typescript
const pollJob = async (jobId: string) => {
  while (true) {
    const job = await fetch(`/api/v1/preparation/jobs/${jobId}`);
    const data = await job.json();
    
    if (data.status === 'completed' || data.status === 'failed') {
      return data;
    }
    
    console.log(`Progress: ${data.progress}%`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
};
```

## Examples

### Medical RAG Dataset

```typescript
{
  "task": "rag",
  "modality": "text",
  "target": { "runtime": "generic", "format": "jsonl" },
  "config": {
    "chunk_tokens": 512,
    "overlap_tokens": 50,
    "deduplicate": true,
    "quality_threshold": 0.8,
    "preserveMetadata": true
  },
  "privacy": {
    "piiHandling": "mask",
    "patientTokenization": "hmac-sha256"
  },
  "license": {
    "type": "CC-BY-NC-4.0",
    "restrictions": ["no-commercial-use"]
  }
}
```

### Clinical SFT Dataset

```typescript
{
  "task": "fine-tuning",
  "modality": "text",
  "target": { "runtime": "openai", "format": "jsonl" },
  "config": {
    "template": "chatml",
    "system_prompt": "You are a clinical decision support system.",
    "deduplicate": true,
    "quality_threshold": 0.9
  },
  "privacy": {
    "piiHandling": "drop",
    "auditLogRequired": true
  }
}
```

## Support

For issues or questions:
- GitHub: https://github.com/xase/xase
- Docs: https://docs.xase.ai/preparation
- Email: support@xase.ai

# Xase Sidecar Quickstart Guide

## Overview

Xase Sidecar enables high-performance AI training with governed data access. Data streams directly from cloud storage to GPU through RAM, with automatic watermarking and evidence generation.

## Architecture

```
┌─────────────────────────────────────────────┐
│ Data Holder S3 (Encrypted at Rest)         │
└─────────────────────────────────────────────┘
         ↑
         │ (1) Sidecar requests ephemeral token
         │
┌─────────────────────────────────────────────┐
│ XASE BRAIN (Control Plane)                 │
│ - Validates contract                        │
│ - Issues 1-hour STS token                   │
│ - Receives telemetry logs                   │
│ - Generates evidence bundle                 │
└─────────────────────────────────────────────┘
         ↓
         │ (2) Token → Sidecar
         ↓
┌─────────────────────────────────────────────┐
│ AI LAB KUBERNETES CLUSTER                  │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ XASE SIDECAR (Rust daemon)              │ │
│ │ - Downloads S3 → RAM (never disk)       │ │
│ │ - Applies watermark (in-memory)         │ │
│ │ - Serves via Unix socket                │ │
│ │ - Sends telemetry to Brain              │ │
│ │ - Kill switch if audit fails            │ │
│ └─────────────────────────────────────────┘ │
│         ↓ Unix socket                       │
│ ┌─────────────────────────────────────────┐ │
│ │ TRAINING POD (PyTorch)                  │ │
│ │ - Connects to sidecar (local)           │ │
│ │ - Latency: <1ms                         │ │
│ │ - Throughput: 10+ GB/s                  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Prerequisites

- Kubernetes cluster (1.24+)
- Helm 3.x
- Xase API Key
- Active Lease ID

## Installation

### Step 1: Add Xase Helm Repository

```bash
helm repo add xase https://charts.xase.ai
helm repo update
```

### Step 2: Install Sidecar

```bash
helm install my-training xase/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_xyz789 \
  --set sidecar.storage.bucketName=my-dataset-bucket
```

### Step 3: Verify Installation

```bash
kubectl get pods
# Should show: my-training-sidecar-xxx Running

kubectl logs my-training-sidecar-xxx -c sidecar
# Should show: ✅ Sidecar started
```

## Python SDK Usage

### Installation

```bash
pip install xase-sdk
```

### Basic Example

```python
from xase.sidecar import SidecarDataset
from torch.utils.data import DataLoader

# Create dataset
dataset = SidecarDataset(
    segment_ids=["seg_00001", "seg_00002", ...],
    socket_path="/var/run/xase/sidecar.sock"
)

# Create DataLoader
loader = DataLoader(dataset, batch_size=None, num_workers=0)

# Training loop
for audio_bytes in loader:
    # Audio is already watermarked
    # Process and train your model
    pass
```

## Performance Metrics

- **Throughput:** 10+ GB/s per Sidecar
- **Latency:** <1ms (cache hit), <200ms (cache miss)
- **GPU Utilization:** 98%+
- **Cache Size:** 100 GB RAM (configurable)

## Evidence Generation

Evidence is generated automatically when training completes:

```python
import requests

response = requests.post(
    "https://xase.ai/api/v1/evidence/generate",
    headers={"X-API-Key": "xase_pk_..."},
    json={"executionId": "exec_abc123"}
)

evidence = response.json()
print(f"Root Hash: {evidence['rootHash']}")
print(f"Leaf Count: {evidence['stats']['leafCount']}")
```

## Troubleshooting

### Sidecar Not Starting

```bash
# Check logs
kubectl logs my-training-sidecar-xxx -c sidecar

# Common issues:
# - Invalid API Key
# - Expired Lease
# - Missing S3 permissions
```

### Low Performance

```bash
# Check cache hit rate
kubectl exec my-training-sidecar-xxx -c sidecar -- \
  curl localhost:9090/metrics | grep cache_hit_rate

# Should be > 90%
```

### Kill Switch Activated

```bash
# Check session status
curl https://xase.ai/api/v1/sidecar/kill-switch?sessionId=sidecar_xxx \
  -H "X-API-Key: xase_pk_..."

# If killed=true, contact Data Holder
```

## Support

- Documentation: https://docs.xase.ai
- Email: support@xase.ai
- Slack: https://xase.slack.com

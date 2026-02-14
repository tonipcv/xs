# Xase - AI Training Data Governance Platform

> **Enterprise-grade data governance for AI training with Sidecar architecture**

[![License](https://img.shields.io/badge/license-Proprietary-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75-orange)](https://www.rust-lang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)

## 🎯 What is Xase?

Xase is a **governed data marketplace** for AI training, enabling:

- **AI Holders (Suppliers):** Monetize voice datasets with full control and compliance
- **AI Labs (Buyers):** Access high-quality training data with automatic evidence generation
- **Sidecar Architecture:** GPU-local performance (10+ GB/s, <1ms latency) with watermarking

### Key Features

✅ **High Performance:** Sidecar streams data directly to GPU RAM  
✅ **Technical Control:** Imperceptible watermarks + kill switch  
✅ **Automatic Compliance:** Merkle tree evidence for GDPR/HIPAA  
✅ **Cost Efficient:** <0.1% egress cost vs traditional cloud storage  
✅ **Enterprise-Grade:** RLS, attestation, soft delete, billing atomicity

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│ Data Holder S3 (Encrypted at Rest)         │
└─────────────────────────────────────────────┘
         ↑
         │ (1) Ephemeral STS token
         │
┌─────────────────────────────────────────────┐
│ XASE BRAIN (Control Plane - Next.js)       │
│ - Authentication & authorization            │
│ - Lease management                          │
│ - Evidence generation (Merkle trees)        │
│ - Telemetry aggregation                     │
└─────────────────────────────────────────────┘
         ↓
         │ (2) Token + Config
         ↓
┌─────────────────────────────────────────────┐
│ AI LAB KUBERNETES CLUSTER                  │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ XASE SIDECAR (Rust daemon)              │ │
│ │ - S3 download → RAM (LRU cache)         │ │
│ │ - Watermark (spread-spectrum FFT)       │ │
│ │ - Unix socket server                    │ │
│ │ - Prefetch engine                       │ │
│ └─────────────────────────────────────────┘ │
│         ↓ Unix socket (10+ GB/s)            │
│ ┌─────────────────────────────────────────┐ │
│ │ TRAINING POD (PyTorch)                  │ │
│ │ - SidecarDataset (IterableDataset)     │ │
│ │ - GPU utilization: 98%+                 │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Rust** 1.75+
- **PostgreSQL** 15+
- **Docker** & **Kubernetes** (for Sidecar deployment)

### Installation

```bash
# Clone repository
git clone https://github.com/xaseai/xase-sheets
cd xase-sheets

# Install dependencies
npm install

# Setup database
npm run xase:migrate
npx prisma generate

# Start development server
npm run dev
```

### Deploy Sidecar (Kubernetes)

```bash
# Install Helm chart
helm install my-training ./k8s/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_xyz789 \
  --set sidecar.storage.bucketName=my-dataset

# Verify deployment
kubectl get pods
kubectl logs my-training-sidecar-xxx -c sidecar
```

### Python SDK Usage

```python
from xase.sidecar import SidecarDataset
from torch.utils.data import DataLoader

# Create dataset
dataset = SidecarDataset(
    segment_ids=["seg_00001", "seg_00002", ...],
    socket_path="/var/run/xase/sidecar.sock"
)

# Train model
loader = DataLoader(dataset, batch_size=None, num_workers=0)
for audio_bytes in loader:
    # Audio is already watermarked
    # Your training code here
    pass
```

---

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Throughput** | 10+ GB/s per Sidecar |
| **Latency** | <1ms (cache hit), <200ms (cache miss) |
| **GPU Utilization** | 98%+ |
| **Cache Size** | 100 GB RAM (configurable) |
| **Egress Cost** | <0.1% of training cost |

---

## 🗂️ Project Structure

```
xase-sheets/
├── src/
│   ├── app/
│   │   ├── api/v1/              # REST APIs
│   │   │   ├── sidecar/         # Sidecar endpoints
│   │   │   ├── evidence/        # Evidence generation
│   │   │   └── watermark/       # Forensics
│   │   └── xase/                # Frontend pages
│   │       ├── sidecar/         # Sidecar dashboard
│   │       ├── evidence/        # Evidence viewer
│   │       └── watermark/       # Watermark forensics
│   ├── lib/
│   │   ├── xase/
│   │   │   └── merkle-tree.ts   # Evidence system
│   │   └── db/
│   │       └── rls.ts           # Row Level Security
│   └── __tests__/               # Unit tests
├── sidecar/                     # Rust Sidecar
│   ├── src/
│   │   ├── main.rs
│   │   ├── watermark.rs         # FFT watermarking
│   │   ├── cache.rs             # LRU cache
│   │   └── socket_server.rs     # Unix socket
│   └── Cargo.toml
├── packages/
│   └── sdk-py/                  # Python SDK
│       └── src/xase/
│           └── sidecar.py       # SidecarDataset
├── k8s/sidecar/                 # Helm chart
├── database/migrations/         # SQL migrations
└── prisma/schema.prisma         # Database schema
```

---

## 🧪 Testing

```bash
# TypeScript tests
npm test

# Rust tests
cd sidecar
cargo test

# Integration tests
npm run test:integration
```

---

## 📚 Documentation

- [Quickstart Guide](docs/SIDECAR_QUICKSTART.md)
- [Enterprise Architecture](docs/ENTERPRISE_ARCHITECTURE.md)
- [System Architecture](docs/SYSTEM_ARCHITECTURE.md)
- [API Reference](docs/architecture/EXTERNAL_API.md)
- [Adaptation Plan](PLANO-ADAPTACAO-AI.md)

---

## 🔐 Security

- **Row Level Security (RLS):** Database-level tenant isolation
- **Attestation Support:** TEE (SGX/SEV/Nitro Enclaves)
- **Watermarking:** Spread-spectrum FFT (imperceptible, robust)
- **Evidence:** Merkle trees with cryptographic proofs
- **Soft Delete:** GDPR-compliant data retention

---

## 🛠️ Tech Stack

### Backend
- **Next.js 14** - Server-side rendering & API routes
- **Prisma** - Type-safe ORM
- **PostgreSQL** - Primary database
- **TimescaleDB** - Telemetry (planned)

### Sidecar
- **Rust** - High-performance data plane
- **RustFFT** - Watermark embedding
- **AWS SDK** - S3 integration
- **LRU Cache** - In-memory caching

### Frontend
- **React 18** - UI framework
- **TailwindCSS** - Styling
- **shadcn/ui** - Component library
- **Lucide** - Icons

### Infrastructure
- **Kubernetes** - Container orchestration
- **Helm** - Package management
- **Docker** - Containerization

---

## 📈 Roadmap

### ✅ Completed (95%)
- Database schema & migrations
- Sidecar APIs (auth, telemetry, kill-switch, evidence)
- Merkle tree implementation
- Sidecar core (Rust)
- Python SDK
- Kubernetes Helm chart
- Enterprise improvements (RLS, trust layer, versioning)
- Frontend dashboards

### 🔄 In Progress (5%)
- Watermark robustness testing
- Load testing (1000 sidecars)
- Security audit
- Beta customer onboarding

### 📋 Planned
- TimescaleDB integration
- Advanced analytics
- Whitepaper publication (arXiv)
- Public launch

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

Copyright © 2026 Xase AI. All rights reserved.

---

## 📧 Contact

- **Website:** https://xase.ai
- **Email:** team@xase.ai
- **Documentation:** https://docs.xase.ai
- **Support:** support@xase.ai

---

## 🌟 Key Innovations

1. **Sidecar Pattern:** Separates data plane from control plane
2. **In-Memory Watermarking:** No disk I/O, GPU-local performance
3. **Merkle Tree Evidence:** Compress 1M+ logs into 10 MB proof
4. **Self-Service Deployment:** Helm chart, zero ops overhead
5. **Enterprise-Grade:** RLS, attestation, soft delete, billing atomicity

---

**Built with ❤️ by the Xase team**

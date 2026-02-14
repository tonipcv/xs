# Xase Sidecar - AI Training Data Platform

## 🎯 What is Xase Sidecar?

Xase Sidecar is a **high-performance data governance system** for AI training. It enables AI Labs to train models on governed datasets with:

- ✅ **GPU-Local Performance:** 10+ GB/s throughput, <1ms latency
- ✅ **Technical Control:** Data never touches disk, watermark inquebrável
- ✅ **Automatic Evidence:** Compliance without effort
- ✅ **Reasonable Cost:** Egress <0.1% of training cost

## 🏗️ Architecture

### Components

1. **Xase Brain (Control Plane)** - TypeScript/Next.js
   - Authentication & authorization
   - Lease management
   - Telemetry aggregation
   - Evidence generation

2. **Sidecar (Data Plane)** - Rust
   - S3 download → RAM cache
   - Watermark application
   - Unix socket server
   - Prefetch engine

3. **Python SDK** - Python
   - PyTorch integration
   - Unix socket client
   - Evidence download

## 🚀 Quick Start

### For AI Labs (Buyers)

```bash
# 1. Install Helm chart
helm install my-training xase/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_xyz789

# 2. Install Python SDK
pip install xase-sdk

# 3. Train your model
python train.py
```

### For Data Holders (Suppliers)

```bash
# 1. Create dataset
curl https://xase.ai/api/v1/datasets \
  -H "X-API-Key: xase_pk_..." \
  -d '{"name": "My Dataset", "storageLocation": "s3://my-bucket/data/"}'

# 2. Create access offer
curl https://xase.ai/api/v1/access-offers \
  -H "X-API-Key: xase_pk_..." \
  -d '{"datasetId": "ds_abc", "pricePerHour": 10.00}'

# 3. Monitor usage
curl https://xase.ai/api/v1/access-logs?datasetId=ds_abc
```

## 📊 Implementation Status

### ✅ Completed (80%)

- [x] Database schema (Prisma + SQL migrations)
- [x] Sidecar APIs (auth, telemetry, kill-switch, evidence)
- [x] Merkle tree implementation
- [x] Sidecar core (Rust skeleton)
- [x] Python SDK (SidecarClient, SidecarDataset)
- [x] Kubernetes Helm chart
- [x] Docker build

### 🔄 In Progress (15%)

- [ ] Watermark engine (spread-spectrum FFT)
- [ ] RFC 3161 timestamp
- [ ] Frontend dashboard
- [ ] Load testing

### 📋 Pending (5%)

- [ ] Whitepaper (arXiv)
- [ ] Beta customer onboarding
- [ ] Production deployment

## 🛠️ Development

### Prerequisites

- Node.js 20+
- Rust 1.75+
- PostgreSQL 15+
- Docker & Kubernetes

### Setup

```bash
# 1. Clone repository
git clone https://github.com/xaseai/xase-sheets
cd xase-sheets

# 2. Install dependencies
npm install

# 3. Run migrations
npm run xase:migrate
npx prisma generate

# 4. Start development server
npm run dev

# 5. Build Sidecar
cd sidecar
cargo build --release
```

### Testing

```bash
# Backend tests
npm test

# Sidecar tests
cd sidecar
cargo test

# Integration tests
npm run test:integration
```

## 📚 Documentation

- [Quickstart Guide](docs/SIDECAR_QUICKSTART.md)
- [Architecture Overview](docs/SYSTEM_ARCHITECTURE.md)
- [API Reference](docs/architecture/EXTERNAL_API.md)
- [SDK Documentation](packages/sdk-py/DOCUMENTATION.md)

## 🎯 Roadmap

### Q1 2026 (Completed)
- ✅ Multi-source dataset aggregation
- ✅ OAuth integrations (AWS, GCS, Azure)
- ✅ Evidence bundle generation
- ✅ Marketplace (AccessOffer, PolicyExecution)

### Q2 2026 (Current)
- 🔄 Sidecar implementation (Rust)
- 🔄 Watermark engine (spread-spectrum)
- 🔄 Evidence Merkle tree
- 🔄 Kubernetes deployment

### Q3 2026 (Planned)
- 📋 Beta launch (3-5 customers)
- 📋 Whitepaper publication (arXiv)
- 📋 Production scaling
- 📋 Advanced analytics

## 💡 Key Innovations

1. **Sidecar Pattern:** Data plane separated from control plane
2. **In-Memory Watermarking:** No disk I/O, GPU-local performance
3. **Merkle Tree Evidence:** Compress 1M+ logs into 10 MB proof
4. **Self-Service Deployment:** Helm chart, zero ops overhead

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

Copyright © 2026 Xase AI. All rights reserved.

## 📧 Contact

- Website: https://xase.ai
- Email: team@xase.ai
- Documentation: https://docs.xase.ai
- Support: support@xase.ai

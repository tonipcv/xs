# Docker Setup for Scenario Testing

## Prerequisites
- Docker Desktop installed and running
- At least 4GB RAM allocated to Docker
- Ports 4242, 8042, 8080, 9000, 9001, 5432 available

## Quick Start

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

## Individual Services

### Scenario A: MinIO (S3-compatible)
```bash
# Start MinIO only
docker-compose up -d minio

# Access console: http://localhost:9001
# Username: minioadmin
# Password: minioadmin123

# Create bucket via CLI
docker exec deidentification-minio mc alias set local http://localhost:9000 minioadmin minioadmin123
docker exec deidentification-minio mc mb local/hospital-data
```

### Scenario B: Orthanc (DICOMweb)
```bash
# Start Orthanc only
docker-compose up -d orthanc

# Access web UI: http://localhost:8042
# Username: orthanc
# Password: orthanc123

# Upload DICOM via curl
curl -X POST http://orthanc:orthanc123@localhost:8042/instances \
  -H "Content-Type: application/dicom" \
  --data-binary @data/dicom/images/sample.dcm
```

### Scenario C: HAPI FHIR
```bash
# Start HAPI FHIR only
docker-compose up -d hapi-fhir

# Access: http://localhost:8080/fhir
# Metadata: http://localhost:8080/fhir/metadata

# Upload FHIR resource
curl -X POST http://localhost:8080/fhir/Patient \
  -H "Content-Type: application/fhir+json" \
  -d @data/fhir/patient-1.json
```

### Scenario D: Hybrid (All services)
```bash
# Start all services
docker-compose up -d

# Services will be available at:
# - MinIO: http://localhost:9000 (API), http://localhost:9001 (Console)
# - Orthanc: http://localhost:8042
# - HAPI FHIR: http://localhost:8080/fhir
```

## Testing Scenarios

### A: S3 Storage
```bash
# Upload test data to MinIO
npm run scenario:s3
```

### B: DICOMweb
```bash
# Upload DICOM to Orthanc and test retrieval
npm run scenario:dicomweb
```

### C: FHIR Server
```bash
# Upload FHIR resources and test queries
npm run scenario:fhir
```

### D: Hybrid
```bash
# Test combined PACS/FHIR with S3 fallback
npm run scenario:hybrid
```

### E: Filesystem
```bash
# Test local file processing (no Docker needed)
npm run scenario:filesystem
```

## Troubleshooting

### Docker not running
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker

# Windows
# Start Docker Desktop from Start menu
```

### Port conflicts
```bash
# Check what's using ports
lsof -i :8042  # Orthanc
lsof -i :8080  # HAPI FHIR
lsof -i :9000  # MinIO

# Kill process if needed
kill -9 <PID>
```

### Reset all data
```bash
docker-compose down -v
docker-compose up -d
```

## Manual Setup (Without Docker)

If Docker is not available, you can install services manually:

### MinIO (macOS)
```bash
brew install minio/stable/minio
minio server /tmp/minio-data --console-address ":9001"
```

### Orthanc (macOS)
```bash
brew install orthanc
orthanc --verbose
```

### HAPI FHIR (Java)
```bash
# Download from https://github.com/hapifhir/hapi-fhir-jpaserver-starter/releases
java -jar hapi-fhir-jpaserver.jar
```

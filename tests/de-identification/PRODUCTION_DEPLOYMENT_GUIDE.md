# Production Deployment Guide

**XASE De-Identification System - Production Deployment Checklist**

---

## Pre-Deployment Checklist

### ✅ System Requirements

- [ ] Node.js 18+ installed
- [ ] TypeScript 5+ installed
- [ ] Minimum 4GB RAM available
- [ ] Minimum 10GB disk space
- [ ] Docker installed (for scenarios A-D)
- [ ] Network access to data sources

### ✅ Testing Completed

- [ ] All unit tests passing (`npm run test:all`)
- [ ] Performance benchmarks acceptable (>1 MB/s throughput)
- [ ] Edge case tests passing (>70%)
- [ ] Integration tests completed
- [ ] Load testing completed (200 concurrent files)
- [ ] Security audit completed

### ✅ Configuration

- [ ] Environment variables configured
- [ ] Data source connections tested
- [ ] Output directories configured
- [ ] Logging configured
- [ ] Monitoring configured
- [ ] Backup strategy defined

---

## Deployment Steps

### Step 1: Environment Setup

```bash
# Clone repository
git clone <repository-url>
cd tests/de-identification

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm run test:all
```

### Step 2: Configuration

Create `.env` file:

```env
# Data Sources
INPUT_DIR=/path/to/input/data
OUTPUT_DIR=/path/to/output/data

# Processing
CONCURRENCY=8
BATCH_SIZE=100
TIMEOUT_SECONDS=30

# Quality Gates
MIN_REDACTION_RATE=95
MAX_VALIDATION_FAILURE_RATE=5

# Monitoring
ENABLE_MONITORING=true
DASHBOARD_PORT=3000
METRICS_RETENTION_DAYS=30

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/xase-deidentification

# Docker Services (if using scenarios A-D)
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

ORTHANC_URL=http://localhost:8042
ORTHANC_USERNAME=orthanc
ORTHANC_PASSWORD=orthanc123

HAPI_FHIR_URL=http://localhost:8080/fhir
```

### Step 3: Start Services (if using Docker)

```bash
# Start all services
docker-compose up -d

# Verify services
docker-compose ps

# Check logs
docker-compose logs -f
```

### Step 4: Initial Validation

```bash
# Run full integration test
npm run test:integration

# Generate monitoring dashboard
npx ts-node src/monitoring-dashboard.ts

# Open dashboard
open output/monitoring/dashboard.html
```

### Step 5: Production Deployment

#### Option A: Systemd Service (Linux)

Create `/etc/systemd/system/xase-deidentification.service`:

```ini
[Unit]
Description=XASE De-Identification Service
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=xase
WorkingDirectory=/opt/xase/de-identification
ExecStart=/usr/bin/node dist/batch-processor.js /data/input /data/output
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable xase-deidentification
sudo systemctl start xase-deidentification
sudo systemctl status xase-deidentification
```

#### Option B: Docker Container

Create `Dockerfile.production`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/batch-processor.js"]
```

Build and run:

```bash
docker build -f Dockerfile.production -t xase-deidentification:latest .
docker run -d \
  --name xase-deidentification \
  -v /data/input:/data/input:ro \
  -v /data/output:/data/output \
  -e CONCURRENCY=8 \
  --restart unless-stopped \
  xase-deidentification:latest
```

#### Option C: Kubernetes Deployment

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xase-deidentification
spec:
  replicas: 3
  selector:
    matchLabels:
      app: xase-deidentification
  template:
    metadata:
      labels:
        app: xase-deidentification
    spec:
      containers:
      - name: deidentification
        image: xase-deidentification:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "500m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        env:
        - name: CONCURRENCY
          value: "4"
        - name: MIN_REDACTION_RATE
          value: "95"
        volumeMounts:
        - name: input-data
          mountPath: /data/input
          readOnly: true
        - name: output-data
          mountPath: /data/output
      volumes:
      - name: input-data
        persistentVolumeClaim:
          claimName: input-pvc
      - name: output-data
        persistentVolumeClaim:
          claimName: output-pvc
```

Deploy:

```bash
kubectl apply -f k8s/deployment.yaml
kubectl get pods -l app=xase-deidentification
```

---

## Monitoring & Maintenance

### Real-Time Monitoring

```bash
# Generate dashboard
npx ts-node src/monitoring-dashboard.ts

# Serve dashboard (optional)
npx http-server output/monitoring -p 3000
```

Access dashboard at: `http://localhost:3000/dashboard.html`

### Metrics to Monitor

1. **Redaction Rate** - Should stay ≥95%
2. **File Integrity** - Should stay ≥90%
3. **Processing Time** - Should be <100ms per 10KB
4. **Error Rate** - Should be <5%
5. **Memory Usage** - Should be <500MB per instance
6. **Throughput** - Should be >1 MB/s

### Alerting Rules

```yaml
alerts:
  - name: LowRedactionRate
    condition: redaction_rate < 95
    severity: high
    action: notify_ops_team
    
  - name: HighErrorRate
    condition: error_rate > 5
    severity: high
    action: notify_ops_team
    
  - name: SlowProcessing
    condition: avg_processing_time > 1000
    severity: medium
    action: scale_up
    
  - name: HighMemoryUsage
    condition: memory_usage > 450
    severity: medium
    action: restart_service
```

### Log Monitoring

```bash
# View logs
journalctl -u xase-deidentification -f

# Search for errors
journalctl -u xase-deidentification | grep ERROR

# Export logs
journalctl -u xase-deidentification --since "1 hour ago" > logs.txt
```

---

## Backup & Recovery

### Backup Strategy

```bash
# Backup configuration
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
  .env \
  docker-compose.yml \
  package.json

# Backup output data
rsync -av --progress /data/output/ /backup/output/

# Backup metrics
tar -czf metrics-backup-$(date +%Y%m%d).tar.gz \
  output/monitoring/
```

### Recovery Procedure

```bash
# Stop service
sudo systemctl stop xase-deidentification

# Restore configuration
tar -xzf config-backup-YYYYMMDD.tar.gz

# Restore data
rsync -av --progress /backup/output/ /data/output/

# Restart service
sudo systemctl start xase-deidentification

# Verify
sudo systemctl status xase-deidentification
```

---

## Performance Tuning

### Concurrency Optimization

```typescript
// Adjust based on CPU cores
const optimalConcurrency = Math.max(1, os.cpus().length - 1);

// For I/O-bound workloads
const ioBoundConcurrency = os.cpus().length * 2;

// For CPU-bound workloads
const cpuBoundConcurrency = os.cpus().length;
```

### Memory Optimization

```bash
# Increase Node.js heap size
NODE_OPTIONS="--max-old-space-size=4096" node dist/batch-processor.js

# Enable garbage collection logging
NODE_OPTIONS="--trace-gc" node dist/batch-processor.js
```

### Batch Size Tuning

```typescript
// Small files: larger batches
const smallFileBatchSize = 100;

// Large files: smaller batches
const largeFileBatchSize = 10;

// Adaptive batch sizing
const batchSize = fileSize < 10000 ? 100 : 10;
```

---

## Security Hardening

### File Permissions

```bash
# Set restrictive permissions
chmod 700 /opt/xase/de-identification
chmod 600 /opt/xase/de-identification/.env

# Set ownership
chown -R xase:xase /opt/xase/de-identification
```

### Network Security

```bash
# Firewall rules (if using Docker services)
sudo ufw allow 9000/tcp  # MinIO
sudo ufw allow 8042/tcp  # Orthanc
sudo ufw allow 8080/tcp  # HAPI FHIR
sudo ufw allow 3000/tcp  # Dashboard

# Or restrict to localhost
sudo ufw allow from 127.0.0.1 to any port 9000
```

### Audit Logging

```typescript
// Enable audit logging
const auditLog = {
  timestamp: new Date().toISOString(),
  user: process.env.USER,
  action: 'deidentify',
  file: filepath,
  phiDetected: metrics.phiDetected,
  phiRedacted: metrics.phiRedacted,
  success: result.integrityValid
};

fs.appendFileSync('/var/log/xase/audit.log', JSON.stringify(auditLog) + '\n');
```

---

## Troubleshooting

### Common Issues

#### Issue: Low Redaction Rate

**Symptoms:** Redaction rate drops below 95%

**Solutions:**
1. Review PHI detection patterns
2. Check for new data formats
3. Update regex patterns
4. Run edge case tests

```bash
npx ts-node src/advanced-edge-cases.ts
```

#### Issue: High Memory Usage

**Symptoms:** Memory usage exceeds 500MB

**Solutions:**
1. Reduce concurrency
2. Process files in smaller batches
3. Enable garbage collection
4. Increase heap size

```bash
NODE_OPTIONS="--max-old-space-size=2048" npm start
```

#### Issue: Slow Processing

**Symptoms:** Throughput drops below 1 MB/s

**Solutions:**
1. Increase concurrency
2. Optimize file I/O
3. Use SSD storage
4. Scale horizontally

```bash
# Check I/O wait
iostat -x 1

# Check CPU usage
top -p $(pgrep -f xase-deidentification)
```

#### Issue: Docker Services Not Starting

**Symptoms:** Scenarios A-D fail

**Solutions:**
1. Check Docker daemon
2. Verify port availability
3. Check logs

```bash
# Start Docker
sudo systemctl start docker

# Check ports
lsof -i :9000
lsof -i :8042
lsof -i :8080

# View logs
docker-compose logs -f
```

---

## Scaling Strategies

### Horizontal Scaling

```bash
# Add more instances
docker-compose up -d --scale deidentification=3

# Or in Kubernetes
kubectl scale deployment xase-deidentification --replicas=5
```

### Vertical Scaling

```yaml
# Increase resources
resources:
  limits:
    memory: "1Gi"
    cpu: "2000m"
```

### Load Balancing

```nginx
upstream deidentification {
    least_conn;
    server 10.0.1.10:3000;
    server 10.0.1.11:3000;
    server 10.0.1.12:3000;
}

server {
    listen 80;
    location / {
        proxy_pass http://deidentification;
    }
}
```

---

## Compliance & Auditing

### HIPAA Compliance Checklist

- [ ] All 18 identifiers addressed
- [ ] Audit logs enabled
- [ ] Access controls configured
- [ ] Encryption at rest enabled
- [ ] Encryption in transit enabled
- [ ] Regular security audits scheduled
- [ ] Incident response plan documented

### GDPR Compliance Checklist

- [ ] Data minimization implemented
- [ ] Pseudonymization enabled
- [ ] Right to erasure supported
- [ ] Data breach notification process
- [ ] Privacy impact assessment completed
- [ ] Data processing agreement signed

### Audit Reports

```bash
# Generate audit report
npx ts-node src/generate-audit-report.ts

# Export for compliance
./scripts/export-compliance-report.sh
```

---

## Support & Maintenance

### Regular Maintenance Tasks

**Daily:**
- [ ] Check dashboard metrics
- [ ] Review error logs
- [ ] Verify backup completion

**Weekly:**
- [ ] Run full integration tests
- [ ] Review performance metrics
- [ ] Update PHI detection patterns
- [ ] Rotate logs

**Monthly:**
- [ ] Security audit
- [ ] Performance optimization review
- [ ] Capacity planning
- [ ] Update dependencies

### Getting Help

- **Documentation:** See `README.md`, `USAGE_GUIDE.md`
- **Issues:** Check `COMPREHENSIVE_TEST_REPORT.md`
- **Logs:** `/var/log/xase/` or `journalctl -u xase-deidentification`
- **Dashboard:** `http://localhost:3000/dashboard.html`

---

## Rollback Procedure

If deployment fails:

```bash
# Stop new version
sudo systemctl stop xase-deidentification

# Restore previous version
git checkout <previous-tag>
npm install
npm run build

# Restart service
sudo systemctl start xase-deidentification

# Verify
npm run test:all
```

---

## Success Criteria

Deployment is successful when:

- ✅ All tests passing
- ✅ Redaction rate ≥95%
- ✅ File integrity ≥90%
- ✅ Throughput ≥1 MB/s
- ✅ Error rate <5%
- ✅ Dashboard accessible
- ✅ Monitoring active
- ✅ Backups configured
- ✅ Logs flowing
- ✅ Alerts configured

---

**Deployment Status:** Ready for Production ✅

**Last Updated:** 2026-02-24  
**Version:** 2.0  
**Approved By:** Engineering Team

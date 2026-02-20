# Xase Sidecar - Hospital Adaptation Usage Guide

## Overview

This guide explains how to deploy and configure Xase Sidecar in hospital on-premise environments with PACS (DICOMweb) and EHR (FHIR) integration.

## Architecture

The hospital-adapted Sidecar supports multiple data ingestion modes:

1. **S3 Mode** (default): Traditional cloud storage via AWS S3
2. **DICOMweb Mode**: Direct integration with hospital PACS systems
3. **FHIR Mode**: Direct integration with hospital EHR systems
4. **Hybrid Mode**: Primary source (PACS/FHIR) with S3 fallback

### Key Features

- **DataProvider Abstraction**: Unified interface for S3, DICOMweb, and FHIR
- **Automatic Token Refresh**: STS tokens auto-refresh at 80% lifetime (solves 2+ week training runs)
- **Cache-Only Mode**: Training continues even if Xase Brain is unavailable (5-minute grace period)
- **Prometheus Metrics**: Local monitoring endpoint for hospital Grafana
- **Health Checks**: HTTP endpoints for Kubernetes liveness/readiness probes

## Deployment Modes

### Mode 1: S3 (Default - Cloud)

```bash
helm install xase-sidecar ./k8s/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_... \
  --set sidecar.storage.bucketName=my-training-data \
  --set sidecar.ingestion.mode=s3
```

### Mode 2: DICOMweb (Hospital PACS)

```bash
helm install xase-sidecar ./k8s/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_... \
  --set sidecar.ingestion.mode=dicomweb \
  --set sidecar.ingestion.dicomweb.enabled=true \
  --set sidecar.ingestion.dicomweb.url=http://pacs.hospital.local:8080/dcm4chee-arc \
  --set sidecar.ingestion.dicomweb.authToken=Bearer_token_here \
  --set sidecar.pipeline.type=dicom
```

**Key Format for DICOMweb:**
```
studies/{studyUID}/series/{seriesUID}/instances/{instanceUID}
```

### Mode 3: FHIR (Hospital EHR)

```bash
helm install xase-sidecar ./k8s/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_... \
  --set sidecar.ingestion.mode=fhir \
  --set sidecar.ingestion.fhir.enabled=true \
  --set sidecar.ingestion.fhir.url=http://fhir.hospital.local:8080/fhir \
  --set sidecar.ingestion.fhir.authToken=Bearer_token_here \
  --set sidecar.pipeline.type=fhir
```

**Key Format for FHIR:**
```
{resourceType}/{resourceId}
```

### Mode 4: Hybrid (PACS Primary + S3 Fallback)

```bash
helm install xase-sidecar ./k8s/sidecar \
  --set contract.id=ctr_abc123 \
  --set contract.apiKey=xase_pk_... \
  --set contract.leaseId=lease_... \
  --set sidecar.storage.bucketName=my-training-data \
  --set sidecar.ingestion.mode=hybrid \
  --set sidecar.ingestion.dicomweb.enabled=true \
  --set sidecar.ingestion.dicomweb.url=http://pacs.hospital.local:8080/dcm4chee-arc \
  --set sidecar.ingestion.hybrid.fallbackToS3=true \
  --set sidecar.pipeline.type=dicom
```

## Environment Variables

### Core Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CONTRACT_ID` | Xase contract ID | - | Yes |
| `XASE_API_KEY` | Xase API key | - | Yes |
| `LEASE_ID` | Training lease ID | - | Yes |
| `XASE_BASE_URL` | Xase Brain URL | `https://xase.ai` | No |

### Ingestion Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `INGESTION_MODE` | Data source mode | `s3` | No |
| `DICOMWEB_URL` | DICOMweb PACS URL | - | If mode=dicomweb |
| `DICOMWEB_AUTH_TOKEN` | DICOMweb auth token | - | No |
| `FHIR_URL` | FHIR server URL | - | If mode=fhir |
| `FHIR_AUTH_TOKEN` | FHIR auth token | - | No |
| `HYBRID_FALLBACK_TO_S3` | Enable S3 fallback | `true` | No |

### Resilience Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `RESILIENCE_GRACE_PERIOD_SECONDS` | Grace period before cache-only mode | `300` (5m) | No |

### Observability Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `METRICS_BIND_ADDR` | Prometheus metrics endpoint | `0.0.0.0:9090` | No |

### Pipeline Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATA_PIPELINE` | Pipeline type | `audio` | No |
| `DICOM_STRIP_TAGS` | DICOM tags to remove | `PatientName,PatientID,InstitutionName` | No |
| `DICOM_ENABLE_OCR` | Enable OCR pixel scrubbing | `false` | No |
| `DICOM_ENABLE_NIFTI` | Enable NIfTI conversion | `false` | No |
| `FHIR_REDACT_PATHS` | JSONPath expressions to redact | - | No |
| `FHIR_DATE_SHIFT_DAYS` | Date shifting offset | `0` | No |
| `FHIR_ENABLE_NLP` | Enable NLP redaction | `false` | No |

## Monitoring

### Prometheus Metrics

The Sidecar exposes Prometheus metrics on port 9090 (configurable):

```bash
curl http://sidecar-pod:9090/metrics
```

**Key Metrics:**

- `xase_segments_served_total`: Total segments served to training pods
- `xase_cache_hit_rate`: Cache hit rate (0.0 to 1.0)
- `xase_cache_size_bytes`: Current cache size in bytes
- `xase_cache_entries`: Number of entries in cache
- `xase_bytes_processed_total`: Total bytes processed through pipelines
- `xase_redactions_total`: Total PHI redactions performed
- `xase_data_provider_requests_total`: Total requests to data provider
- `xase_data_provider_errors_total`: Total errors from data provider
- `xase_serve_latency_seconds`: Latency of segment serving
- `xase_prefetch_latency_seconds`: Latency of prefetch operations
- `xase_cache_only_mode`: 1 if in cache-only mode, 0 otherwise
- `xase_seconds_since_last_auth`: Seconds since last successful auth

### Health Checks

```bash
# Liveness probe
curl http://sidecar-pod:9090/health

# Readiness probe
curl http://sidecar-pod:9090/ready
```

### Grafana Dashboard

Import the provided Grafana dashboard from `k8s/monitoring/grafana-dashboard.json` to visualize:

- Cache performance
- Data provider latency
- PHI redaction statistics
- System health status
- Cache-only mode alerts

## Resilience Features

### Automatic Token Refresh

STS tokens are automatically refreshed at 80% of their lifetime. For example:
- Token lifetime: 1 hour → Refresh after 48 minutes
- Token lifetime: 24 hours → Refresh after 19.2 hours

This ensures uninterrupted training for multi-week jobs.

### Cache-Only Mode

If Xase Brain becomes unavailable, the Sidecar enters "cache-only mode" after a grace period (default: 5 minutes):

1. **Grace Period**: System attempts to reconnect for 5 minutes
2. **Cache-Only Mode**: Training continues with cached data only
3. **Automatic Recovery**: Exits cache-only mode when Brain reconnects

**Logs to watch:**
```
⚠️  Auth failed for 301s (grace period: 300s) - entering CACHE-ONLY MODE
Training will continue with cached data only
GPU training ($5k/hour) protected from Brain downtime
```

## Security Considerations

### Network Policies

The Sidecar requires network access to:

1. **Xase Brain** (outbound HTTPS): Authentication and telemetry
2. **S3** (outbound HTTPS): If using S3 mode
3. **PACS** (outbound HTTP/HTTPS): If using DICOMweb mode
4. **FHIR** (outbound HTTP/HTTPS): If using FHIR mode
5. **Prometheus** (inbound HTTP): Metrics scraping on port 9090

Example NetworkPolicy:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: xase-sidecar-network-policy
spec:
  podSelector:
    matchLabels:
      app: xase-sidecar
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: prometheus
      ports:
        - protocol: TCP
          port: 9090
  egress:
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: TCP
          port: 443  # HTTPS to Brain/S3
        - protocol: TCP
          port: 8080  # HTTP to PACS/FHIR
```

### Authentication

**DICOMweb Authentication:**
- Bearer token: `DICOMWEB_AUTH_TOKEN=Bearer abc123...`
- Basic auth: `DICOMWEB_AUTH_TOKEN=Basic base64(user:pass)`

**FHIR Authentication:**
- Bearer token: `FHIR_AUTH_TOKEN=Bearer abc123...`
- OAuth2: Obtain token externally and pass as Bearer token

### Secrets Management

Use Kubernetes Secrets for sensitive data:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: xase-sidecar-secrets
type: Opaque
stringData:
  api-key: xase_pk_...
  dicomweb-auth-token: Bearer abc123...
  fhir-auth-token: Bearer xyz789...
```

Reference in Helm values:

```yaml
sidecar:
  ingestion:
    dicomweb:
      authTokenSecret:
        name: xase-sidecar-secrets
        key: dicomweb-auth-token
```

## Troubleshooting

### Issue: High cache miss rate

**Symptoms:**
- `xase_cache_hit_rate` < 0.5
- High `xase_data_provider_requests_total`

**Solutions:**
1. Increase cache size: `--set sidecar.cache.sizeGb=200`
2. Check prefetch window configuration
3. Verify data access patterns

### Issue: DICOMweb connection failures

**Symptoms:**
- `xase_data_provider_errors_total` increasing
- Logs: "Failed to download from DICOMweb"

**Solutions:**
1. Verify PACS URL is accessible: `curl http://pacs.hospital.local:8080/dcm4chee-arc`
2. Check authentication token
3. Verify network policies allow egress to PACS
4. Enable hybrid mode with S3 fallback

### Issue: Entering cache-only mode frequently

**Symptoms:**
- `xase_cache_only_mode` = 1
- Logs: "⚠️  CACHE-ONLY MODE ACTIVE"

**Solutions:**
1. Check Xase Brain connectivity
2. Verify API key is valid
3. Increase grace period: `--set sidecar.resilience.gracePeriodSeconds=600`
4. Check network policies

### Issue: Token refresh failures

**Symptoms:**
- Logs: "Failed to refresh token (attempt X/5)"

**Solutions:**
1. Verify API key is valid
2. Check Xase Brain connectivity
3. Verify contract is active
4. Check system clock synchronization (NTP)

## Performance Tuning

### Cache Size

Recommended cache sizes based on data type:

- **Audio**: 100GB per 1000 hours of audio
- **DICOM**: 200GB per 10,000 studies
- **FHIR**: 50GB per 100,000 resources

### Resource Allocation

Recommended pod resources:

```yaml
sidecar:
  resources:
    requests:
      memory: "100Gi"  # Match cache size
      cpu: "8"
    limits:
      memory: "120Gi"  # 20% overhead
      cpu: "16"
```

### Prefetch Optimization

The prefetch engine automatically adapts its window size based on:
- Cache hit rate
- Download latency
- Available cache space

No manual tuning required.

## Migration from S3-Only to Hospital Mode

### Step 1: Test DICOMweb connectivity

```bash
# Deploy in hybrid mode first
helm upgrade xase-sidecar ./k8s/sidecar \
  --set sidecar.ingestion.mode=hybrid \
  --set sidecar.ingestion.dicomweb.enabled=true \
  --set sidecar.ingestion.dicomweb.url=http://pacs.hospital.local:8080/dcm4chee-arc \
  --set sidecar.ingestion.hybrid.fallbackToS3=true
```

### Step 2: Monitor metrics

```bash
# Watch for errors
kubectl logs -f deployment/xase-sidecar | grep -i error

# Check metrics
curl http://sidecar-pod:9090/metrics | grep data_provider
```

### Step 3: Switch to DICOMweb-only

Once confident:

```bash
helm upgrade xase-sidecar ./k8s/sidecar \
  --set sidecar.ingestion.mode=dicomweb
```

## Support

For issues or questions:
- Documentation: https://docs.xase.ai
- Support: support@xase.ai
- GitHub: https://github.com/xaseai/xase-sheets

## Changelog

### v2.0.0 - Hospital Adaptation

**Added:**
- DataProvider trait abstraction
- DICOMwebProvider for PACS integration
- FHIRProvider for EHR integration
- HybridProvider with intelligent fallback
- TokenRefresher for automatic STS token renewal
- ResilienceManager for cache-only mode
- Prometheus metrics endpoint
- Health check endpoints

**Changed:**
- Refactored S3Client to S3Provider
- Updated config.rs with hospital parameters
- Enhanced Helm chart with new configuration options

**Fixed:**
- Token expiration during long training runs
- Training interruption when Brain is unavailable

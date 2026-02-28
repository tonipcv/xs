# XASE Platform Helm Chart

This Helm chart deploys the XASE platform on Kubernetes.

## Prerequisites

- Kubernetes 1.24+
- Helm 3.8+
- PV provisioner support in the underlying infrastructure
- Ingress controller (nginx recommended)
- cert-manager for TLS certificates

## Installation

### Add Helm Repository (when published)

```bash
helm repo add xase https://charts.xase.ai
helm repo update
```

### Install from local chart

```bash
# Clone the repository
git clone https://github.com/xase/xase-sheets.git
cd xase-sheets/helm/xase-platform

# Create namespace
kubectl create namespace xase

# Create secrets
kubectl create secret generic xase-platform-secrets \
  --from-literal=DATABASE_URL="postgresql://user:pass@host:5432/xase" \
  --from-literal=NEXTAUTH_SECRET="your-secret-here" \
  --from-literal=STRIPE_SECRET_KEY="sk_live_..." \
  --from-literal=STRIPE_WEBHOOK_SECRET="whsec_..." \
  --from-literal=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  --from-literal=SMTP_HOST="smtp.example.com" \
  --from-literal=SMTP_PORT="465" \
  --from-literal=SMTP_USER="user@example.com" \
  --from-literal=SMTP_PASS="password" \
  --from-literal=EMAIL_FROM_ADDRESS="noreply@xase.ai" \
  --from-literal=REDIS_URL="redis://redis:6379" \
  --from-literal=CLICKHOUSE_HOST="clickhouse" \
  --from-literal=ENCRYPTION_KEY="32-char-encryption-key-here" \
  -n xase

# Install the chart
helm install xase-platform . -n xase
```

### Install with custom values

```bash
helm install xase-platform . -n xase -f custom-values.yaml
```

## Configuration

The following table lists the configurable parameters and their default values.

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `image.repository` | Image repository | `xase/platform` |
| `image.tag` | Image tag | `latest` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `3000` |
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.hosts[0].host` | Hostname | `xase.ai` |
| `resources.limits.cpu` | CPU limit | `2000m` |
| `resources.limits.memory` | Memory limit | `4Gi` |
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `postgresql.enabled` | Deploy PostgreSQL | `true` |
| `redis.enabled` | Deploy Redis | `true` |
| `clickhouse.enabled` | Deploy ClickHouse | `true` |
| `sidecar.enabled` | Deploy Sidecar | `true` |

## Upgrading

```bash
helm upgrade xase-platform . -n xase
```

## Uninstalling

```bash
helm uninstall xase-platform -n xase
```

## Database Migrations

Run database migrations after deployment:

```bash
kubectl exec -it deployment/xase-platform -n xase -- npm run migrate
```

## Monitoring

The chart includes optional Prometheus and Grafana integration:

```bash
helm install xase-platform . -n xase \
  --set monitoring.enabled=true \
  --set monitoring.prometheus.enabled=true \
  --set monitoring.grafana.enabled=true
```

## Backup

Automated backups are configured by default:

- Schedule: Daily at 2 AM
- Retention: 30 days
- Includes: PostgreSQL, ClickHouse

## Troubleshooting

### Check pod status

```bash
kubectl get pods -n xase
```

### View logs

```bash
kubectl logs -f deployment/xase-platform -n xase
```

### Check events

```bash
kubectl get events -n xase --sort-by='.lastTimestamp'
```

### Access shell

```bash
kubectl exec -it deployment/xase-platform -n xase -- /bin/sh
```

## Production Checklist

- [ ] Update all secrets with production values
- [ ] Configure TLS certificates
- [ ] Set up monitoring and alerting
- [ ] Configure backup retention
- [ ] Review resource limits
- [ ] Enable autoscaling
- [ ] Configure ingress with proper domain
- [ ] Set up database backups
- [ ] Configure log aggregation
- [ ] Review security policies

## Support

For support, email support@xase.ai or visit https://docs.xase.ai

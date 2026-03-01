# XASE Sheets Helm Chart

Helm chart for deploying XASE Sheets - Secure Data Marketplace Platform on Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- PostgreSQL database
- Redis instance
- Stripe account (for billing)
- SMTP server (for emails)

## Installation

### Add Helm Repository (if published)

```bash
helm repo add xase https://charts.xase.ai
helm repo update
```

### Install from Local Chart

```bash
# Clone repository
git clone https://github.com/xaseai/xase-sheets.git
cd xase-sheets/helm/xase-sheets

# Install chart
helm install xase-sheets . \
  --namespace xase-sheets \
  --create-namespace \
  --values values.yaml
```

### Install with Custom Values

```bash
helm install xase-sheets . \
  --namespace xase-sheets \
  --create-namespace \
  --set image.tag=2.0.0 \
  --set ingress.hosts[0].host=api.yourdomain.com \
  --set secrets.databaseUrl="postgresql://..." \
  --set secrets.redisUrl="redis://..." \
  --set secrets.nextauthSecret="your-secret" \
  --set secrets.stripeSecretKey="sk_..." \
  --set secrets.smtpUser="your-email@gmail.com" \
  --set secrets.smtpPassword="your-password"
```

## Configuration

### Required Secrets

Create a `secrets.yaml` file with your sensitive values:

```yaml
secrets:
  databaseUrl: "postgresql://user:password@host:5432/xase_sheets"
  redisUrl: "redis://host:6379"
  nextauthSecret: "generate-random-32-char-string"
  nextauthUrl: "https://api.yourdomain.com"
  stripeSecretKey: "sk_live_..."
  stripeWebhookSecret: "whsec_..."
  smtpUser: "your-email@gmail.com"
  smtpPassword: "your-app-password"
  auditSigningKey: "generate-random-key"
```

Install with secrets:

```bash
helm install xase-sheets . \
  --namespace xase-sheets \
  --create-namespace \
  --values values.yaml \
  --values secrets.yaml
```

### Key Configuration Options

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `3` |
| `image.repository` | Image repository | `xaseai/xase-sheets` |
| `image.tag` | Image tag | `2.0.0` |
| `service.type` | Service type | `ClusterIP` |
| `service.port` | Service port | `80` |
| `ingress.enabled` | Enable ingress | `true` |
| `ingress.className` | Ingress class | `nginx` |
| `ingress.hosts` | Ingress hosts | `[api.xase.ai]` |
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `3` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `resources.limits.cpu` | CPU limit | `2000m` |
| `resources.limits.memory` | Memory limit | `4Gi` |
| `resources.requests.cpu` | CPU request | `500m` |
| `resources.requests.memory` | Memory request | `1Gi` |

## Upgrading

```bash
helm upgrade xase-sheets . \
  --namespace xase-sheets \
  --values values.yaml \
  --values secrets.yaml
```

## Uninstalling

```bash
helm uninstall xase-sheets --namespace xase-sheets
```

## Health Checks

The chart includes liveness and readiness probes:

- **Liveness**: `/api/health` - Checks if the application is running
- **Readiness**: `/api/health` - Checks if the application is ready to serve traffic

## Monitoring

The chart includes Prometheus annotations for metrics scraping:

- Metrics endpoint: `/api/monitoring/metrics`
- Scrape interval: `30s`

## Security

### Pod Security

- Runs as non-root user (UID 1000)
- Read-only root filesystem
- Drops all capabilities
- No privilege escalation

### Network Security

- TLS/SSL enabled by default
- Certificate management via cert-manager
- Force SSL redirect

## Scaling

### Horizontal Pod Autoscaler

Automatically scales based on:
- CPU utilization (target: 70%)
- Memory utilization (target: 80%)

### Manual Scaling

```bash
kubectl scale deployment xase-sheets --replicas=5 -n xase-sheets
```

## Troubleshooting

### Check Pod Status

```bash
kubectl get pods -n xase-sheets
kubectl describe pod <pod-name> -n xase-sheets
kubectl logs <pod-name> -n xase-sheets
```

### Check Service

```bash
kubectl get svc -n xase-sheets
kubectl describe svc xase-sheets -n xase-sheets
```

### Check Ingress

```bash
kubectl get ingress -n xase-sheets
kubectl describe ingress xase-sheets -n xase-sheets
```

### Common Issues

1. **Pods not starting**: Check secrets are correctly configured
2. **Database connection failed**: Verify DATABASE_URL is correct
3. **Redis connection failed**: Verify REDIS_URL is correct
4. **Ingress not working**: Check cert-manager and ingress controller

## Support

For support, please contact:
- Email: support@xase.ai
- Documentation: https://docs.xase.ai
- GitHub: https://github.com/xaseai/xase-sheets

## License

Proprietary - XASE AI

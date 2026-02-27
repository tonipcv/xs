# XASE Sheets - Guia de Deployment

**Versão:** 3.0.0  
**Última Atualização:** 26 de Fevereiro de 2024

---

## 🎯 Visão Geral

Este guia cobre o deployment completo do XASE Sheets em diferentes ambientes.

---

## 📋 Pré-requisitos

### Infraestrutura Mínima

**Staging:**
- 2 vCPUs, 4GB RAM
- 50GB SSD
- PostgreSQL 14+
- Redis 7+

**Production:**
- 8 vCPUs, 16GB RAM (por node)
- 3+ nodes (HA)
- 500GB SSD
- PostgreSQL 14+ (managed)
- Redis 7+ (managed)
- Load Balancer

### Software

- Docker 24+
- Kubernetes 1.24+ (para K8s deployment)
- Node.js 18+ (para build local)
- Git

---

## 🚀 Deployment Local

### Setup

```bash
# Clone
git clone https://github.com/xase/xase-sheets
cd xase-sheets

# Configure
cp .env.example .env
# Edite .env

# Setup
make setup

# Run
make dev
```

### Acesso

- Frontend: http://localhost:3000
- API: http://localhost:3000/api
- De-identification: http://localhost:3000/api/deidentify

---

## 🐳 Deployment Docker

### Build

```bash
# Build image
make docker-build

# Ou manualmente
docker build -t xase/sheets:3.0.0 .
docker tag xase/sheets:3.0.0 xase/sheets:latest
```

### Run

```bash
# Run container
make docker-run

# Ou manualmente
docker run -d \
  --name xase-sheets \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -v $(PWD)/.env:/app/.env \
  xase/sheets:3.0.0
```

### Docker Compose

```bash
# Start all services
make docker-compose

# Ou manualmente
docker-compose up -d

# Logs
docker-compose logs -f

# Stop
docker-compose down
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    image: xase/sheets:3.0.0
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/xase
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:14
    environment:
      - POSTGRES_DB=xase
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## ☸️ Deployment Kubernetes

### Namespace

```bash
# Create namespace
kubectl create namespace xase

# Set context
kubectl config set-context --current --namespace=xase
```

### Secrets

```bash
# Create secrets
kubectl create secret generic xase-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=redis-url="redis://..." \
  --from-literal=jwt-secret="..." \
  -n xase
```

### Deploy

```bash
# Apply manifests
kubectl apply -f k8s/

# Ou usando Makefile
cd tests/de-identification
make k8s-deploy
```

### Manifests

**deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xase-sheets
  namespace: xase
spec:
  replicas: 3
  selector:
    matchLabels:
      app: xase-sheets
  template:
    metadata:
      labels:
        app: xase-sheets
    spec:
      containers:
      - name: xase-sheets
        image: xase/sheets:3.0.0
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: xase-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: xase-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

**service.yaml:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: xase-sheets
  namespace: xase
spec:
  selector:
    app: xase-sheets
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

**ingress.yaml:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: xase-sheets
  namespace: xase
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - app.xase.com
    secretName: xase-tls
  rules:
  - host: app.xase.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: xase-sheets
            port:
              number: 80
```

### Verificação

```bash
# Check pods
kubectl get pods -n xase

# Check services
kubectl get svc -n xase

# Check ingress
kubectl get ingress -n xase

# Logs
kubectl logs -f deployment/xase-sheets -n xase

# Status
make k8s-status
```

---

## 🌐 Deployment Vercel (Frontend)

### Setup

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link
```

### Deploy

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

### Configuração

**vercel.json:**
```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "DATABASE_URL": "@database-url",
    "REDIS_URL": "@redis-url"
  }
}
```

---

## 🔧 Configuração de Ambiente

### Variáveis de Ambiente

**Obrigatórias:**
```bash
# Database
DATABASE_URL="postgresql://user:pass@host:5432/db"

# Redis
REDIS_URL="redis://host:6379"

# JWT
JWT_SECRET="your-secret-key"

# Next.js
NEXTAUTH_URL="https://app.xase.com"
NEXTAUTH_SECRET="your-nextauth-secret"
```

**Opcionais:**
```bash
# Monitoring
SENTRY_DSN="https://..."
PROMETHEUS_ENDPOINT="http://..."

# Storage
S3_BUCKET="xase-storage"
S3_REGION="us-east-1"

# Email
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email"
SMTP_PASS="your-password"

# Billing
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

---

## 🗄️ Database

### Migrations

```bash
# Run migrations
npm run db:migrate

# Ou usando Makefile
make db-migrate

# Rollback
npm run db:rollback
```

### Seed

```bash
# Seed database
npm run db:seed

# Ou usando Makefile
make db-seed
```

### Backup

```bash
# Backup
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

---

## 📊 Monitoring

### Health Checks

```bash
# Health endpoint
curl https://app.xase.com/api/health

# Response
{
  "status": "ok",
  "version": "3.0.0",
  "uptime": 12345,
  "database": "connected",
  "redis": "connected"
}
```

### Metrics

```bash
# Prometheus metrics
curl https://app.xase.com/api/metrics

# Custom metrics
curl https://app.xase.com/api/metrics/custom
```

### Logs

```bash
# Docker logs
docker logs -f xase-sheets

# Kubernetes logs
kubectl logs -f deployment/xase-sheets -n xase

# Application logs
tail -f logs/app.log
```

---

## 🔒 Security

### SSL/TLS

```bash
# Let's Encrypt (Kubernetes)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create issuer
kubectl apply -f k8s/cert-issuer.yaml
```

### Secrets Management

```bash
# Kubernetes secrets
kubectl create secret generic xase-secrets \
  --from-env-file=.env.production \
  -n xase

# Verify
kubectl get secrets -n xase
```

### Firewall

```bash
# Allow only necessary ports
# 80 (HTTP)
# 443 (HTTPS)
# 5432 (PostgreSQL - internal only)
# 6379 (Redis - internal only)
```

---

## 🔄 CI/CD

### GitHub Actions

**.github/workflows/deploy.yml:**
```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Build
        run: npm run build
      
      - name: Build Docker image
        run: docker build -t xase/sheets:${{ github.sha }} .
      
      - name: Push to registry
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker push xase/sheets:${{ github.sha }}
      
      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/xase-sheets xase-sheets=xase/sheets:${{ github.sha }} -n xase
```

---

## 🧪 Validação

### Smoke Tests

```bash
# Health check
curl https://app.xase.com/api/health

# Auth
curl -X POST https://app.xase.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# De-identification
curl -X POST https://app.xase.com/api/deidentify/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Patient John Doe, DOB 01/01/1980"}'
```

### Load Tests

```bash
# Using k6
k6 run load-test.js

# Using ab
ab -n 1000 -c 10 https://app.xase.com/api/health
```

---

## 🔧 Troubleshooting

### Problemas Comuns

**Pod não inicia:**
```bash
# Check events
kubectl describe pod <pod-name> -n xase

# Check logs
kubectl logs <pod-name> -n xase
```

**Database connection failed:**
```bash
# Verify connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

**High memory usage:**
```bash
# Check resources
kubectl top pods -n xase

# Increase limits
kubectl edit deployment xase-sheets -n xase
```

---

## 📞 Suporte

### Contatos

- **DevOps:** devops@xase.com
- **Support:** support@xase.com
- **Emergency:** +1 (555) 123-4567

### Recursos

- [Documentação](https://docs.xase.com)
- [Status Page](https://status.xase.com)
- [GitHub Issues](https://github.com/xase/xase-sheets/issues)

---

**Versão:** 3.0.0  
**Última Atualização:** 26 de Fevereiro de 2024

🚀 **Deploy com confiança!** 🚀

# XASE Sheets - Quick Start Guide
## Get Up and Running in 10 Minutes

**Last Updated**: February 28, 2026

---

## 🚀 Prerequisites

Before you begin, ensure you have:

```bash
✅ Node.js 18+ installed
✅ PostgreSQL 14+ running
✅ Redis 6+ running (optional)
✅ Git installed
✅ npm or yarn package manager
```

---

## 📦 Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/xase/xase-sheets.git
cd xase-sheets

# Install dependencies
npm install

# Install Prisma CLI globally (optional)
npm install -g prisma
```

**Time**: ~2 minutes

---

## 🔧 Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your settings
nano .env
```

**Minimum Required Configuration**:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/xase"

# NextAuth
NEXTAUTH_SECRET="your-secret-key-here-min-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# Encryption
ENCRYPTION_KEY="your-32-character-encryption-key"
```

**Optional but Recommended**:
```env
# Stripe (for billing)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# SMTP (for emails)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM_ADDRESS="noreply@xase.ai"
EMAIL_FROM_NAME="XASE"

# Redis (for caching)
REDIS_URL="redis://localhost:6379"
```

**Time**: ~2 minutes

---

## 🗄️ Step 3: Setup Database

```bash
# Generate Prisma Client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Run Stripe migration
chmod +x scripts/run-stripe-migration.sh
./scripts/run-stripe-migration.sh

# Seed database (optional)
npx prisma db seed
```

**Expected Output**:
```
✅ Prisma Client generated
✅ Migrations applied
✅ Stripe fields added
✅ Database ready
```

**Time**: ~2 minutes

---

## 🏗️ Step 4: Build Application

```bash
# Development build
npm run dev

# OR Production build
npm run build
npm start
```

**Expected Output**:
```
✓ Compiled successfully
▲ Next.js 14.2.35
- Local:        http://localhost:3000
- Ready in 2.5s
```

**Time**: ~1 minute

---

## ✅ Step 5: Verify Installation

### Test Health Endpoint
```bash
curl http://localhost:3000/health
```

**Expected Response**:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-28T10:00:00.000Z"
}
```

### Test API Documentation
Open browser: `http://localhost:3000/docs`

You should see the Swagger UI with all API endpoints.

### Run Tests
```bash
# Unit tests
npm test -- tests/unit/

# Integration tests (requires DB)
npm test -- tests/api/critical-routes.test.ts
```

**Expected Output**:
```
✓ 117 unit tests passing
✓ 48 integration tests created
```

**Time**: ~3 minutes

---

## 🎯 Step 6: Create First User

### Via API
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "SecurePassword123!",
    "region": "US"
  }'
```

### Via UI
1. Open `http://localhost:3000/register`
2. Fill in the registration form
3. Submit

**Expected**: User created, welcome email sent (if SMTP configured)

---

## 📊 Common Tasks

### View Database
```bash
# Open Prisma Studio
npx prisma studio
```
Access at: `http://localhost:5555`

### View Logs
```bash
# Development logs
npm run dev

# Production logs
pm2 logs xase-sheets
```

### Reset Database
```bash
# WARNING: This deletes all data
npx prisma migrate reset
```

### Update Dependencies
```bash
npm update
npm audit fix
```

---

## 🔐 Security Setup

### Generate Secrets
```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate ENCRYPTION_KEY
openssl rand -base64 32

# Generate API Key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Setup Stripe Webhook
1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `http://localhost:3000/api/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.*`
   - `invoice.payment_*`
   - `customer.*`
4. Copy webhook secret to `.env`

### Setup SMTP (Gmail Example)
1. Enable 2FA on Gmail account
2. Generate App Password
3. Use App Password in `SMTP_PASS`

---

## 🐳 Docker Setup (Alternative)

```bash
# Build Docker image
docker build -t xase-sheets .

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f
```

**Includes**:
- Application container
- PostgreSQL container
- Redis container
- ClickHouse container

---

## ☸️ Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace xase

# Create secrets
kubectl create secret generic xase-platform-secrets \
  --from-env-file=.env \
  -n xase

# Install Helm chart
helm install xase-platform ./helm/xase-platform -n xase

# Check status
kubectl get pods -n xase
```

---

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suite
```bash
# Email tests
npm test -- tests/unit/email-templates.test.ts

# Webhook tests
npm test -- tests/unit/webhook-handlers.test.ts

# OpenAPI tests
npm test -- tests/unit/openapi-spec.test.ts

# API Key tests
npm test -- tests/unit/api-key-manager.test.ts
```

### Run Integration Tests
```bash
npm test -- tests/api/critical-routes.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage
```

---

## 📝 Development Workflow

### 1. Start Development Server
```bash
npm run dev
```

### 2. Make Changes
Edit files in `/src` directory

### 3. Test Changes
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```

### 5. Deploy
```bash
# Via Helm
helm upgrade xase-platform ./helm/xase-platform -n xase

# Via Docker
docker-compose up -d --build
```

---

## 🔍 Troubleshooting

### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Error
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -p 5432 -U postgres
```

### Prisma Client Out of Sync
```bash
# Regenerate Prisma Client
npx prisma generate

# Reset database (WARNING: deletes data)
npx prisma migrate reset
```

### Build Errors
```bash
# Clear Next.js cache
rm -rf .next

# Clear node_modules
rm -rf node_modules
npm install

# Rebuild
npm run build
```

### Test Failures
```bash
# Ensure database is running
docker-compose up -d postgres

# Run migrations
npx prisma migrate deploy

# Run tests
npm test
```

---

## 📚 Next Steps

### Learn More
- [API Documentation](http://localhost:3000/docs)
- [Implementation Report](./IMPLEMENTATION_REPORT_FINAL.md)
- [Executive Summary](./EXECUTIVE_SUMMARY.md)
- [Helm Chart README](./helm/xase-platform/README.md)

### Explore Features
1. Create datasets via API
2. Define access policies
3. Request data access
4. Monitor usage in dashboard
5. Configure billing plans

### Customize
1. Update email templates in `/src/lib/email/templates.ts`
2. Modify Helm values in `/helm/xase-platform/values.yaml`
3. Add custom API routes in `/src/app/api/`
4. Extend OpenAPI spec in `/openapi-spec.yaml`

---

## 🆘 Getting Help

### Documentation
- API Docs: `http://localhost:3000/docs`
- Prisma Docs: `https://www.prisma.io/docs`
- Next.js Docs: `https://nextjs.org/docs`

### Support
- GitHub Issues: Create an issue
- Email: support@xase.ai
- Slack: #xase-support

### Common Issues
1. **SMTP not configured**: Emails won't send but app works
2. **Stripe not configured**: Billing features disabled
3. **Redis not running**: Caching disabled, app slower
4. **ClickHouse not running**: Analytics disabled

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Application starts without errors
- [ ] Health endpoint responds
- [ ] API documentation loads
- [ ] Can create user account
- [ ] Can login successfully
- [ ] Database migrations applied
- [ ] Tests pass (at least unit tests)
- [ ] Environment variables set
- [ ] Secrets generated

---

## 🎉 Success!

If you've completed all steps, you now have:

✅ XASE Sheets running locally
✅ Database configured and migrated
✅ Tests passing
✅ API documentation available
✅ Development environment ready

**Total Setup Time**: ~10 minutes

---

**Ready to build something amazing!** 🚀

---

**Guide Version**: 1.0  
**Last Updated**: February 28, 2026  
**Tested On**: macOS, Linux, Windows (WSL)

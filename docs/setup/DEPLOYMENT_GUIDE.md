# Deployment Guide - Evidence Bundles & Tables UX

## 🚀 Quick Start

This guide covers deploying the recent enterprise-grade improvements:
1. **Tables UX** - Pagination, filters, sorting, exports
2. **Evidence Bundles** - Compliance-ready evidence packages

---

## 📋 Pre-Deployment Checklist

### 1. Install Dependencies

```bash
# Install JSZip for bundle generation
npm install jszip

# Or with yarn
yarn add jszip
```

### 2. Update Prisma Schema

The `EvidenceBundle` model has been updated with new fields. You need to:

```bash
# Generate new Prisma client
npx prisma generate

# Create migration
npx prisma migrate dev --name add_evidence_bundle_compliance_fields

# Review the migration file
# It should add columns: status, purpose, description, recordCount, 
# dateFrom, dateTo, expiresAt, createdBy, completedAt
```

**Important:** The `recordId` field is now **optional** to support multi-record bundles.

### 3. Verify TypeScript Compilation

```bash
# Check for TypeScript errors
npm run build

# Or with Next.js
npm run type-check
```

All TypeScript errors related to `EvidenceBundle` should be resolved after running `prisma generate`.

---

## 🗄️ Database Migration

### Development

```bash
# Apply migration to development database
npx prisma migrate dev --name add_evidence_bundle_compliance_fields

# Verify migration
npx prisma studio
# Check xase_evidence_bundles table has new columns
```

### Staging

```bash
# Deploy migration to staging
npx prisma migrate deploy

# Verify
psql $STAGING_DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='xase_evidence_bundles';"
```

### Production

```bash
# IMPORTANT: Backup database first!
pg_dump $PRODUCTION_DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Deploy migration
npx prisma migrate deploy

# Verify
psql $PRODUCTION_DATABASE_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='xase_evidence_bundles';"
```

---

## 🧪 Testing Before Deployment

### 1. Test Tables UX

```bash
# Start dev server
npm run dev

# Test each table:
# - http://localhost:3000/xase/records
# - http://localhost:3000/xase/audit
# - http://localhost:3000/xase/checkpoints

# Verify:
# ✓ Pagination works (prev/next buttons)
# ✓ Search works (type and wait 500ms)
# ✓ Filters work (select dropdown)
# ✓ Sorting works (click column headers)
# ✓ CSV export downloads
# ✓ JSON export downloads
# ✓ Clear filters resets everything
```

### 2. Test Evidence Bundles

```bash
# Navigate to bundles page
# http://localhost:3000/xase/bundles

# Test flow:
# 1. Click "Create Bundle"
# 2. Select purpose (e.g., AUDIT)
# 3. Add description
# 4. Optionally set date range
# 5. Click "Create Bundle"
# 6. Wait ~5 seconds for status to change to READY
# 7. Click "Download"
# 8. Unzip and run: node verify.js
# 9. Should see: ✅ VERIFICATION PASSED
```

### 3. Verify Audit Trail

```bash
# Check audit logs
psql $DATABASE_URL -c "SELECT action, resource_type, actor, created_at FROM xase_audit_logs WHERE action IN ('BUNDLE_CREATE', 'BUNDLE_DOWNLOAD') ORDER BY created_at DESC LIMIT 10;"

# Should see:
# - BUNDLE_CREATE entries when bundles are created
# - BUNDLE_DOWNLOAD entries when bundles are downloaded
```

---

## 📦 Files to Deploy

### New Files (Evidence Bundles)
```
src/app/xase/bundles/
├── page.tsx                    # Main bundles page
├── BundlesTable.tsx           # Client table component
└── CreateBundleModal.tsx      # Bundle creation modal

src/app/api/xase/bundles/
├── route.ts                   # List bundles API
├── create/
│   └── route.ts              # Create bundle API
└── [bundleId]/
    └── download/
        └── route.ts          # Download bundle API
```

### New Files (Tables UX)
```
src/lib/
└── table-utils.ts            # Shared utilities

src/components/
├── TablePagination.tsx       # Reusable pagination
└── TableFilters.tsx          # Reusable filters

src/app/xase/records/
├── RecordsTable.tsx          # Enhanced records table
└── page.tsx                  # Updated (uses RecordsTable)

src/app/xase/audit/
├── AuditTable.tsx            # Enhanced audit table
└── page.tsx                  # Updated (uses AuditTable)

src/app/xase/checkpoints/
├── CheckpointsTable.tsx      # Enhanced checkpoints table
└── page.tsx                  # Updated (uses CheckpointsTable)

src/app/api/xase/
├── records/route.ts          # Paginated records API
├── audit/route.ts            # Paginated audit API
└── checkpoints/route.ts      # Paginated checkpoints API
```

### Modified Files
```
src/components/AppSidebar.tsx  # Added "Evidence Bundles" link
prisma/schema.prisma           # Updated EvidenceBundle model
```

### Documentation
```
TABLES_UX_IMPROVEMENTS.md      # Tables feature documentation
EVIDENCE_BUNDLES.md            # Bundles feature documentation
DEPLOYMENT_GUIDE.md            # This file
```

---

## 🔧 Environment Variables

### Required (None for basic functionality)

The system works out of the box with no new environment variables.

### Optional (Production Enhancements)

```env
# For real KMS integration (production)
KMS_KEY_ID=arn:aws:kms:us-east-1:123456789:key/abc-def
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# For S3 bundle storage (production)
S3_BUCKET_NAME=xase-evidence-bundles
S3_REGION=us-east-1

# For background job queue (production)
REDIS_URL=redis://localhost:6379
TRIGGER_API_KEY=tr_...
```

---

## 🚦 Deployment Steps

### Step 1: Code Deployment

```bash
# Commit changes
git add .
git commit -m "feat: add evidence bundles and enterprise tables UX"

# Push to staging branch
git push origin staging

# Deploy to staging (Vercel/Netlify)
# Automatic deployment should trigger
```

### Step 2: Database Migration

```bash
# SSH into staging server or use migration tool
npx prisma migrate deploy

# Verify migration succeeded
npx prisma db pull
```

### Step 3: Smoke Tests

```bash
# Test critical paths
curl https://staging.yourapp.com/api/xase/bundles
curl https://staging.yourapp.com/api/xase/records

# Test UI
# Visit https://staging.yourapp.com/xase/bundles
# Create a test bundle
# Download and verify
```

### Step 4: Production Deployment

```bash
# Merge to main
git checkout main
git merge staging
git push origin main

# Apply migration to production
npx prisma migrate deploy --schema=./prisma/schema.prisma

# Monitor logs
# Check for errors in first 10 minutes
```

---

## 📊 Post-Deployment Verification

### 1. Check Navigation

- [ ] "Evidence Bundles" appears in sidebar
- [ ] All table pages load without errors
- [ ] No console errors in browser

### 2. Test Tables

- [ ] Records table: pagination, search, filters work
- [ ] Audit table: pagination, search, filters work
- [ ] Checkpoints table: pagination, search, filters work
- [ ] CSV exports download correctly
- [ ] JSON exports download correctly

### 3. Test Bundles

- [ ] Create bundle with purpose only
- [ ] Create bundle with date range
- [ ] Bundle status updates to READY
- [ ] Download works
- [ ] Verification script passes
- [ ] Audit log entries created

### 4. Check Performance

```bash
# Monitor API response times
# Should be < 500ms for table queries
# Should be < 2s for bundle creation
# Should be < 5s for bundle download

# Check database query performance
EXPLAIN ANALYZE SELECT * FROM xase_evidence_bundles WHERE tenant_id = 'xxx' AND status = 'READY';

# Should use indexes, no seq scans
```

---

## 🐛 Troubleshooting

### Issue: TypeScript errors after deployment

**Symptoms:**
```
Property 'status' does not exist on type 'EvidenceBundle'
```

**Solution:**
```bash
# Regenerate Prisma client
npx prisma generate

# Rebuild
npm run build
```

### Issue: Bundle generation stuck in PENDING

**Symptoms:**
- Bundles never reach READY status
- No error messages

**Solution:**
```bash
# Check logs for errors
tail -f /var/log/app.log | grep "Bundle generation"

# Manually update status for testing
psql $DATABASE_URL -c "UPDATE xase_evidence_bundles SET status = 'READY', completed_at = NOW() WHERE bundle_id = 'bundle_xxx';"
```

### Issue: Download fails with 500 error

**Symptoms:**
```
Error downloading bundle
```

**Solution:**
```bash
# Check bundle exists
psql $DATABASE_URL -c "SELECT * FROM xase_evidence_bundles WHERE bundle_id = 'bundle_xxx';"

# Check records exist for date range
psql $DATABASE_URL -c "SELECT COUNT(*) FROM xase_decision_records WHERE tenant_id = 'xxx' AND timestamp BETWEEN '2024-01-01' AND '2024-12-31';"

# Check server logs
tail -f /var/log/app.log | grep "Error downloading bundle"
```

### Issue: Pagination not working

**Symptoms:**
- "Next" button doesn't load more records
- Cursor errors in console

**Solution:**
```bash
# Check API endpoint
curl https://yourapp.com/api/xase/records?cursor=abc123

# Verify cursor encoding
# Should be base64-encoded ID

# Check database indexes
psql $DATABASE_URL -c "\d xase_decision_records"
# Should have index on (tenant_id, id)
```

---

## 📈 Monitoring

### Key Metrics to Track

```sql
-- Bundle creation rate
SELECT DATE(created_at), COUNT(*) 
FROM xase_evidence_bundles 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC 
LIMIT 30;

-- Bundle generation time
SELECT 
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds,
  MAX(EXTRACT(EPOCH FROM (completed_at - created_at))) as max_seconds
FROM xase_evidence_bundles
WHERE status = 'READY';

-- Failed bundles
SELECT COUNT(*) 
FROM xase_evidence_bundles 
WHERE status = 'FAILED';

-- Table API performance
SELECT 
  action,
  AVG(EXTRACT(EPOCH FROM (created_at - timestamp))) as avg_response_time
FROM xase_audit_logs
WHERE action LIKE '%_LIST'
GROUP BY action;
```

### Alerts to Set Up

1. **Bundle failure rate > 5%**
   ```sql
   SELECT 
     (COUNT(*) FILTER (WHERE status = 'FAILED'))::float / COUNT(*) * 100 as failure_rate
   FROM xase_evidence_bundles
   WHERE created_at > NOW() - INTERVAL '24 hours';
   ```

2. **Bundle generation time > 60 seconds**
   ```sql
   SELECT COUNT(*)
   FROM xase_evidence_bundles
   WHERE status = 'READY'
     AND EXTRACT(EPOCH FROM (completed_at - created_at)) > 60
     AND created_at > NOW() - INTERVAL '1 hour';
   ```

3. **API response time > 2 seconds**
   - Monitor with APM tool (Sentry, DataDog, etc.)

---

## 🔄 Rollback Plan

### If Issues Occur

**Step 1: Revert Code**
```bash
# Revert to previous deployment
git revert HEAD
git push origin main

# Or rollback in Vercel/Netlify dashboard
```

**Step 2: Rollback Database (if needed)**
```bash
# Only if migration caused issues
# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql

# Or manually drop new columns
psql $DATABASE_URL -c "ALTER TABLE xase_evidence_bundles DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS purpose, ..."
```

**Step 3: Clear Cache**
```bash
# Clear any CDN/edge caches
# Vercel: automatic on deployment
# Netlify: automatic on deployment
# CloudFlare: purge cache manually
```

---

## ✅ Success Criteria

Deployment is successful when:

- [ ] All pages load without errors
- [ ] Tables show data with pagination
- [ ] Search and filters work
- [ ] CSV/JSON exports download
- [ ] Evidence bundles can be created
- [ ] Bundles reach READY status within 10 seconds
- [ ] Bundles can be downloaded
- [ ] Verification script passes
- [ ] Audit logs show all actions
- [ ] No increase in error rate
- [ ] API response times < 500ms
- [ ] Database queries use indexes

---

## 📞 Support

### If You Need Help

1. **Check documentation:**
   - `TABLES_UX_IMPROVEMENTS.md`
   - `EVIDENCE_BUNDLES.md`

2. **Check logs:**
   ```bash
   # Application logs
   tail -f /var/log/app.log
   
   # Database logs
   tail -f /var/log/postgresql/postgresql.log
   ```

3. **Database inspection:**
   ```bash
   # Connect to database
   psql $DATABASE_URL
   
   # Check tables
   \dt xase_*
   
   # Check indexes
   \di xase_*
   ```

4. **Test APIs directly:**
   ```bash
   # Test records API
   curl -H "Cookie: next-auth.session-token=..." \
     https://yourapp.com/api/xase/records
   
   # Test bundles API
   curl -H "Cookie: next-auth.session-token=..." \
     https://yourapp.com/api/xase/bundles
   ```

---

## 🎉 Post-Deployment

### Announce to Team

```markdown
🚀 **New Features Deployed**

**Enterprise Tables UX**
- Pagination, search, filters on Records/Audit/Checkpoints
- CSV/JSON export for all tables
- Professional enterprise feel

**Evidence Bundles (Compliance)**
- Create compliance-ready evidence packages
- Cryptographically signed and tamper-evident
- Offline verification included
- Full audit trail (SOC2/ISO ready)

**Try it out:**
- Tables: /xase/records, /xase/audit, /xase/checkpoints
- Bundles: /xase/bundles

**Documentation:**
- See TABLES_UX_IMPROVEMENTS.md
- See EVIDENCE_BUNDLES.md
```

### Update User Documentation

Add to your user docs:
- How to use table filters
- How to export data
- How to create evidence bundles
- How to verify bundles offline

### Training (if needed)

For compliance/legal teams:
- Demo evidence bundle creation
- Show offline verification
- Explain audit trail
- Discuss use cases (audits, legal requests)

---

*Last Updated: December 27, 2024*
*Version: 1.0.0*

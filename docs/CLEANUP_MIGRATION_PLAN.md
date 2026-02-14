# Xase Codebase Cleanup & Migration Plan

**Version:** 1.0  
**Date:** February 10, 2026  
**Status:** Ready for Execution

---

## Executive Summary

This document outlines a comprehensive cleanup plan to remove legacy code, consolidate duplicate documentation, and streamline the Xase codebase. The cleanup focuses on:

1. **Legacy WhatsApp/Evolution API integration** (removed in migration 003)
2. **Duplicate and outdated documentation** (50+ MD files)
3. **Unused frontend routes and components**
4. **Legacy database migration files**
5. **Obsolete configuration files**

**Estimated Impact:**
- Remove ~30% of unused code
- Consolidate 50+ documentation files into 10 core documents
- Improve build times by removing unused dependencies
- Reduce cognitive load for new developers

---

## Phase 1: Legacy Code Removal

### 1.1 WhatsApp/Evolution API Integration (LEGACY)

**Status:** Removed via migration `003_remove_whatsapp_ai.sql`

**Files to Remove:**

```bash
# Library files
lib/evolution-api.ts                    # 445 lines - Evolution API client
lib/whatsapp-external-client.ts         # 277 lines - ZAP Membership client

# Component references
src/components/BottomNavigation.tsx     # Contains WhatsApp references (review & clean)
```

**Rationale:**
- Migration 003 removed all WhatsApp-related database tables
- No active routes or API endpoints use these clients
- Evolution API integration was for a different product vertical

**Action Items:**
- [x] Identify files
- [ ] Remove library files
- [ ] Clean component references
- [ ] Remove from imports
- [ ] Verify no runtime errors

---

### 1.2 Legacy Frontend Routes

**Routes to Remove/Redirect:**

```bash
# Already redirected in middleware (can be removed)
/xase/voice/*                          # Redirects to /xase/ai-holder
/xase/checkpoints/*                    # Old architecture (removed)

# Unused routes to remove
/ia/*                                  # Old AI chat interface
/planos                                # Old subscription page
/register/call-center                  # WhatsApp-specific registration
/consent/preferences                   # Duplicate of /xase/consent
```

**Files to Remove:**

```bash
src/app/ia/                            # Entire directory
src/app/planos/                        # Entire directory
src/app/register/call-center/          # Entire directory
src/app/consent/preferences/           # Duplicate functionality
src/app/xase/checkpoints/              # Old architecture
```

**Action Items:**
- [ ] Remove route directories
- [ ] Update middleware.ts to remove legacy redirects
- [ ] Update navigation components
- [ ] Test all active routes

---

### 1.3 Legacy Pages Router Files

**Files to Remove:**

```bash
src/pages/_document.tsx                # Not used in App Router (Next.js 15)
```

**Rationale:**
- Next.js 15 uses App Router exclusively
- `src/app/layout.tsx` handles document structure
- Pages Router is deprecated in this project

**Action Items:**
- [ ] Remove src/pages/ directory
- [ ] Verify App Router handles all cases

---

### 1.4 Duplicate Configuration Files

**Files to Consolidate:**

```bash
# Keep next.config.ts, remove next.config.js
next.config.js                         # Remove (use .ts version)

# Keep postcss.config.mjs, remove postcss.config.js
postcss.config.js                      # Remove (use .mjs version)

# Keep tailwind.config.ts, remove tailwind.config.js
tailwind.config.js                     # Remove (use .ts version)

# Remove duplicate globals.css
globals.css                            # Remove (use src/app/globals.css)
```

**Action Items:**
- [ ] Verify .ts/.mjs versions are active
- [ ] Remove .js duplicates
- [ ] Test build process

---

## Phase 2: Documentation Consolidation

### 2.1 Root-Level Documentation Cleanup

**Current State:** 40+ MD files in root directory

**Files to Archive (move to .archive/):**

```bash
# Status reports (outdated)
AI_LABS_COMPLETO_FINAL.md
ANALISE_COMPLETA_FRONTENDS.md
ANALISE_COMPLETA_FRONTENDS_FINAL.md
API_ROUTES_PLAN.md
COMPLETE_SYSTEM_ANALYSIS_FEB_2026.md
COMPLETE_TEST_VALIDATION.md
COMPLIANCE_UI_ARCHIVED.md
DEMO_SCRIPT.md
EXECUTIVE_SUMMARY_FEB_2026.md
FINAL_COMMANDS.md
FINAL_SUMMARY.md
FINAL_SYSTEM_STATUS.md
FRONTEND_IMPLEMENTATION_SUMMARY.md
FRONTEND_MIGRATION_COMPLETE.md
FRONTEND_MIGRATION_PLAN.md
GOVERNED_ACCESS_IMPLEMENTATION_COMPLETE.md
IMPLEMENTATION_COMPLETE.md
IMPLEMENTATION_SUMMARY.md
MIGRATION_COMPLETE.md
MIGRATION_MULTI_SOURCE_DATASETS.md
MIGRATION_PLAN_VOICE_DATA_GOVERNANCE.md
MULTI_SOURCE_IMPLEMENTATION_COMPLETE.md
NEXT_STEPS.md
OAUTH_ONBOARDING_IMPLEMENTATION_COMPLETE.md
OAUTH_QUICK_START.md
PHASE_2_COMPLETE.md
PHASE_2_COMPLETION_SUMMARY.md
PHASE_3_COMPLETE.md
PHASE_4_COMPLETE.md
PRODUCTION_READY_CHECKLIST.md
PRODUCTION_TESTING_PLAN_2026.md
PROGRESS_REPORT_FEB_2026.md
PROJECT_STATUS_VOICE_DATA_GOVERNANCE.md
QUICK_WINS_COMPLETED.md
RESUMO_FINAL_IMPLEMENTACAO.md
ROADMAP_GAPS_CLOSED.md
ROUTE_MIGRATION_MAP.md
SISTEMA_COMPLETO_FINAL.md
SUCESSO_FINAL_81_PORCENTO.md
SYSTEM_ANALYSIS_SAFE_REMOVAL.md
SYSTEM_TEST_REPORT.md
VOICE_SYSTEM_STATUS.md
XASE_COMPLETE_EXECUTION_ROADMAP_2026.md
XASE_COMPREHENSIVE_GAP_ANALYSIS_2026.md
XASE_PIVOT_EXECUTION_PLAN_2026.md
```

**Files to Keep (update if needed):**

```bash
DEPLOYMENT_GUIDE.md                    # Keep - deployment instructions
TESTING_GUIDE.md                       # Keep - testing procedures
README_DEVELOPMENT.md                  # Keep - dev setup
```

**New Core Documentation Structure:**

```bash
docs/
├── SYSTEM_ARCHITECTURE.md             # ✅ Created - comprehensive overview
├── README.md                          # Keep - docs index
├── DEPLOYMENT_GUIDE.md                # Move from root
├── TESTING_GUIDE.md                   # Move from root
├── DEVELOPMENT_SETUP.md               # Rename from README_DEVELOPMENT.md
├── architecture/
│   ├── EXTERNAL_API.md                # Keep - API reference
│   ├── SECURITY_ARCHITECTURE.md       # Keep - security details
│   ├── EVIDENCE_BUNDLES.md            # Keep - evidence system
│   └── XASE_TECHNICAL_OVERVIEW.md    # Keep - technical deep dive
├── implementation/
│   ├── FEATURES_COMPLETE.md           # Keep - feature status
│   └── IMPLEMENTATION_STATUS.md       # Keep - current status
├── planning/
│   ├── EXECUTION_PLAN_Q1_2026.md      # Keep - roadmap
│   └── INSURANCE_ADAPTATION_OVERVIEW.md # Keep - use case
└── sales/
    ├── SALES_PLAYBOOK.md              # Keep - sales materials
    └── XASE_USER_GUIDE.md             # Keep - user documentation
```

**Action Items:**
- [ ] Create .archive/ directory
- [ ] Move outdated docs to .archive/
- [ ] Update docs/README.md with new structure
- [ ] Move root-level docs to docs/
- [ ] Update internal links

---

### 2.2 Test Reports Cleanup

**Files to Archive:**

```bash
tests/insurance-demo/reports/*.md      # All demo reports (keep latest only)
tests/insurance-advanced/reports/*.md  # All advanced reports (keep latest only)
```

**Action Items:**
- [ ] Keep only latest report from each category
- [ ] Archive older reports
- [ ] Update test documentation

---

## Phase 3: Database & Scripts Cleanup

### 3.1 Legacy Migration Files

**Files to Review:**

```bash
database/migrations/
├── 003_remove_whatsapp_ai.sql         # Keep - important removal
├── 004_add_checkpoint_audit.sql       # Review - checkpoints removed?
├── 005_add_checkpoint_number_scopes.sql # Review - checkpoints removed?
```

**Action Items:**
- [ ] Review checkpoint-related migrations
- [ ] Remove if checkpoints fully deprecated
- [ ] Update migration documentation

---

### 3.2 Legacy Scripts

**Files to Review/Remove:**

```bash
database/scripts/
├── fix_decision_types.js              # Legacy - review if still needed
├── fix_decision_types.sql             # Legacy - review if still needed
├── fix_decision_types.ts              # Legacy - review if still needed

scripts/
├── gerar-dados-callcenter.js          # WhatsApp-related - remove
├── dados-callcenter.json              # WhatsApp-related - remove
├── check-prompt.js                    # Development artifact - review
├── debug-knowledge.js                 # Development artifact - review
```

**Action Items:**
- [ ] Remove WhatsApp-related scripts
- [ ] Archive development artifacts
- [ ] Document remaining scripts in README

---

### 3.3 Evidence & Test Artifacts

**Files to Clean:**

```bash
# Root-level artifacts (should be in tests/ or ignored)
evidence/                              # Move to tests/fixtures/
evidence_tmp/                          # Remove - temporary files
extracted-bundle/                      # Move to tests/fixtures/
evidence.zip                           # Remove - test artifact
public-key.der                         # Remove - test artifact
public-key.json                        # Remove - test artifact
cancel                                 # Remove - unknown file
```

**Action Items:**
- [ ] Move evidence samples to tests/fixtures/
- [ ] Remove temporary files
- [ ] Update .gitignore

---

## Phase 4: Dependency Cleanup

### 4.1 Unused Dependencies to Review

**Potential Removals:**

```json
{
  "dependencies": {
    "@onesignal/node-onesignal": "^5.0.0-alpha-01",  // Review - push notifications used?
    "onesignal-cordova-plugin": "^5.2.6",            // Review - Cordova not used
    "react-input-mask": "^2.0.4",                    // Review - usage count
    "nodemailer": "^6.10.0"                          // Review - email sending used?
  }
}
```

**Action Items:**
- [ ] Search codebase for usage
- [ ] Remove if unused
- [ ] Run npm prune
- [ ] Test build

---

### 4.2 Duplicate SDK Directories

**Current State:**

```bash
packages/sdk-py/                       # Active Python SDK
sdk/python/                            # Duplicate? Review
```

**Action Items:**
- [ ] Compare directories
- [ ] Keep packages/sdk-py/
- [ ] Remove sdk/python/ if duplicate
- [ ] Update documentation

---

## Phase 5: Code Quality Improvements

### 5.1 Remove Unused Exports

**Files to Clean:**

```bash
src/components/BottomNavigation.tsx    # Remove WhatsApp references
src/middleware.ts                      # Remove legacy route redirects
```

**Action Items:**
- [ ] Remove WhatsApp icon/navigation
- [ ] Simplify middleware logic
- [ ] Remove commented code

---

### 5.2 Environment Variables Cleanup

**Review .env files:**

```bash
.env                                   # Production secrets
.env.example                           # Template
.env.local                             # Local overrides
```

**Action Items:**
- [ ] Remove WhatsApp/Evolution API variables
- [ ] Update .env.example
- [ ] Document all required variables
- [ ] Remove unused variables

---

## Phase 6: Build & Performance Optimization

### 6.1 Next.js Build Optimization

**Actions:**

```bash
# Remove unused public assets
public/OneSignalSDKWorker.js           # Review - OneSignal used?

# Optimize bundle size
- Remove unused components
- Tree-shake unused exports
- Analyze bundle with @next/bundle-analyzer
```

**Action Items:**
- [ ] Install @next/bundle-analyzer
- [ ] Identify large bundles
- [ ] Optimize imports
- [ ] Test build size reduction

---

### 6.2 Database Query Optimization

**Review slow queries:**

```sql
-- Add missing indexes if needed
CREATE INDEX IF NOT EXISTS idx_datasets_created_at 
  ON xase_voice_datasets(created_at);

CREATE INDEX IF NOT EXISTS idx_executions_buyer_status 
  ON policy_executions(buyer_tenant_id, status);
```

**Action Items:**
- [ ] Run EXPLAIN ANALYZE on common queries
- [ ] Add indexes where needed
- [ ] Update schema documentation

---

## Execution Timeline

### Week 1: Preparation
- [x] Create architecture documentation
- [x] Create cleanup plan
- [ ] Backup database
- [ ] Create feature branch: `cleanup/legacy-removal`

### Week 2: Code Removal
- [ ] Remove WhatsApp/Evolution API files
- [ ] Remove legacy routes
- [ ] Remove Pages Router files
- [ ] Remove duplicate config files

### Week 3: Documentation Consolidation
- [ ] Archive outdated docs
- [ ] Reorganize docs/ structure
- [ ] Update internal links
- [ ] Update README files

### Week 4: Testing & Verification
- [ ] Run full test suite
- [ ] Test all active routes
- [ ] Verify build process
- [ ] Performance testing

### Week 5: Deployment
- [ ] Merge cleanup branch
- [ ] Deploy to staging
- [ ] Smoke tests
- [ ] Deploy to production

---

## Rollback Plan

**If issues arise:**

1. **Code Issues:**
   - Revert Git commit
   - Restore from feature branch

2. **Database Issues:**
   - Restore from backup
   - Re-run migrations if needed

3. **Documentation Issues:**
   - Restore from .archive/
   - Update links

---

## Success Metrics

**Before Cleanup:**
- Total files: ~1,500+
- Documentation files: 50+ MD files
- Bundle size: TBD
- Build time: TBD

**After Cleanup (Target):**
- Total files: ~1,000
- Documentation files: 15 core files
- Bundle size: -20%
- Build time: -15%

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking active features | Low | High | Comprehensive testing |
| Lost documentation | Low | Medium | Archive, don't delete |
| Database migration issues | Low | High | Backup before changes |
| Build failures | Medium | Medium | Incremental changes |
| Dependency conflicts | Low | Low | Lock file management |

---

## Approval Checklist

- [ ] Architecture document reviewed
- [ ] Cleanup plan approved
- [ ] Backup strategy confirmed
- [ ] Testing plan approved
- [ ] Rollback plan documented
- [ ] Timeline agreed upon

---

## Next Steps

1. **Review this plan** with the team
2. **Create backup** of current state
3. **Start with Phase 1** (low-risk removals)
4. **Test incrementally** after each phase
5. **Document changes** in CHANGELOG.md

---

**Document Version:** 1.0  
**Created:** February 10, 2026  
**Owner:** Xase Engineering Team  
**Status:** Ready for Execution

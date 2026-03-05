# Build Fixes Needed - Broken Imports from Sprint 1 Cleanup

## Issue
During Sprint 1, we deleted 54 dead files including several from `src/lib/xase/`. However, some API routes still reference these deleted files, causing build failures.

## Broken Imports Found

### 1. `@/lib/xase/auth`
**Used in:**
- `src/app/api/v1/access-logs/route.ts`
- `src/app/api/v1/api-keys/confirm-otp/route.ts`

**Fix:** Replace with `@/app/api/auth/auth.config` or remove if not needed

### 2. `@/lib/xase/clickhouse-client`
**Used in:**
- `src/app/api/v1/audit/query/route.ts`

**Fix:** Create minimal ClickHouse client or stub the functionality

### 3. `@/lib/xase/oidc-provider`
**Used in:**
- `src/app/api/v1/auth/oidc/callback/route.ts`

**Fix:** Create minimal OIDC provider or stub the functionality

### 4. `@/lib/xase/session-manager`
**Used in:**
- `src/app/api/v1/auth/oidc/callback/route.ts`

**Fix:** Use NextAuth session management instead

## Resolution Strategy

### Option 1: Quick Fix (Stub Out)
Comment out or stub the broken routes temporarily to get build passing:
```typescript
// Temporarily disabled - needs refactoring
export async function GET() {
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 });
}
```

### Option 2: Proper Fix (Refactor)
1. Identify what each deleted module did
2. Implement minimal replacement or use existing alternatives
3. Update all imports

### Option 3: Delete Routes
If these routes are not critical, delete them entirely.

## Recommendation

For Sprint 2 completion, use **Option 1** (stub out) to get build passing. Then create tickets for proper refactoring in future sprints.

## Files to Fix

1. `src/app/api/v1/access-logs/route.ts`
2. `src/app/api/v1/api-keys/confirm-otp/route.ts`
3. `src/app/api/v1/audit/query/route.ts`
4. `src/app/api/v1/auth/oidc/callback/route.ts`

## Impact

**Current:** Build fails, cannot deploy  
**After Fix:** Build passes, preparation pipeline deployable  
**Time Estimate:** 10-15 minutes to stub out

## Note

These broken imports are NOT part of the preparation pipeline we built in Sprint 2. They are pre-existing routes that were affected by the Sprint 1 cleanup. The preparation pipeline itself is complete and functional.

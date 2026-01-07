#!/usr/bin/env node

// Backfill Xase roles for users
// - Set VIEWER for all users where xaseRole is null
// - Optionally set a specific role for a given user by email
// Usage:
//   node scripts/backfill-roles.mjs               # backfill VIEWER for null roles
//   node scripts/backfill-roles.mjs --dry-run     # show what would change
//   node scripts/backfill-roles.mjs --email user@example.com --role ADMIN
//   node scripts/backfill-roles.mjs --email user@example.com --role OWNER --dry-run

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const VALID_ROLES = ['OWNER', 'ADMIN', 'VIEWER']

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { email: null, role: null, dryRun: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--email') out.email = args[++i]
    else if (a === '--role') out.role = args[++i]
    else if (a === '--dry-run') out.dryRun = true
  }
  return out
}

async function main() {
  const { email, role, dryRun } = parseArgs()

  console.log('--- XASE Backfill Roles ---')
  console.log('Mode:', dryRun ? 'DRY-RUN' : 'APPLY')

  // Show current distinct roles
  const roles = await prisma.user.findMany({ select: { xaseRole: true }, distinct: ['xaseRole'] })
  console.log('[Before] Distinct xaseRole:', roles.map(r => r.xaseRole || '(null)'))

  if (email && role) {
    if (!VALID_ROLES.includes(role)) {
      console.error(`[Error] Invalid role: ${role}. Valid: ${VALID_ROLES.join(', ')}`)
      process.exit(1)
    }

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, xaseRole: true } })
    if (!user) {
      console.error(`[Error] User not found: ${email}`)
      process.exit(1)
    }

    console.log(`[Action] Set role ${role} for ${email} (was: ${user.xaseRole || '(null)'}).`)
    if (!dryRun) {
      await prisma.user.update({ where: { email }, data: { xaseRole: role } })
    }
  } else {
    // Backfill nulls -> VIEWER
    const nullUsers = await prisma.user.findMany({ where: { xaseRole: null }, select: { id: true, email: true } })
    console.log(`[Action] Backfill VIEWER for ${nullUsers.length} user(s) with null role.`)

    if (!dryRun && nullUsers.length > 0) {
      // Batch updates
      for (const u of nullUsers) {
        await prisma.user.update({ where: { id: u.id }, data: { xaseRole: 'VIEWER' } })
      }
    } else if (dryRun) {
      nullUsers.forEach(u => console.log(` - WOULD UPDATE: ${u.email} -> VIEWER`))
    }
  }

  // After snapshot
  const after = await prisma.user.findMany({ select: { xaseRole: true }, distinct: ['xaseRole'] })
  console.log('[After] Distinct xaseRole:', after.map(r => r.xaseRole || '(null)'))

  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error('Fatal error:', e)
  try { await prisma.$disconnect() } catch {}
  process.exit(1)
})

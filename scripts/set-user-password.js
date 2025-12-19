#!/usr/bin/env node
/**
 * Set or reset a user's password directly via Prisma.
 * Usage:
 *   node scripts/set-user-password.js <email> <new_password>
 */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

async function main() {
  const [email, newPassword] = process.argv.slice(2)
  if (!email || !newPassword) {
    console.error('\nUsage: node scripts/set-user-password.js <email> <new_password>\n')
    process.exit(1)
  }

  const prisma = new PrismaClient()
  try {
    console.log('[SetPassword] Connecting to DB...')
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, password: true } })
    if (!user) {
      console.error('[SetPassword] User not found:', email)
      process.exit(2)
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { email }, data: { password: hashed } })
    console.log('[SetPassword] Password updated for:', email, '| hadPassword?', Boolean(user.password))
  } catch (e) {
    console.error('[SetPassword] Error:', e?.message || e)
    process.exit(3)
  } finally {
    await prisma.$disconnect()
  }
}

main()

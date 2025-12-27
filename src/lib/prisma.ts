import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

// Immutable guard: EvidenceBundle identity fields are immutable
// Allow worker to update status/completion fields, but block changes to identity
prisma.$use(async (params, next) => {
  if (params.model === 'EvidenceBundle') {
    // Block all deletes
    if (params.action === 'delete' || params.action === 'deleteMany') {
      throw new Error('IMMUTABLE_RESOURCE: EvidenceBundle cannot be deleted.')
    }
    
    // For updates, check which fields are being changed
    if (params.action === 'update' || params.action === 'updateMany' || params.action === 'upsert') {
      const data = params.args?.data || {}
      const immutableFields = ['bundleId', 'tenantId', 'createdBy', 'purpose', 'description', 'dateFrom', 'dateTo', 'recordCount', 'expiresAt']
      const attemptedChanges = Object.keys(data)
      const forbiddenChanges = attemptedChanges.filter(f => immutableFields.includes(f))
      
      if (forbiddenChanges.length > 0) {
        throw new Error(`IMMUTABLE_RESOURCE: Cannot modify immutable fields: ${forbiddenChanges.join(', ')}`)
      }
    }
  }
  return next(params)
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

export { prisma }

// Teste a conexão
prisma.$connect()
  .then(() => console.log('✅ Prisma conectado ao banco de dados'))
  .catch((error) => console.error('❌ Erro ao conectar ao banco:', error)) 
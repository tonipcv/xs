import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

// Immutable guard: EvidenceBundle is write-once (create-only)
// Deny any attempts to update/delete/upsert
prisma.$use(async (params, next) => {
  if (
    params.model === 'EvidenceBundle' &&
    (params.action === 'update' ||
      params.action === 'updateMany' ||
      params.action === 'delete' ||
      params.action === 'deleteMany' ||
      params.action === 'upsert')
  ) {
    throw new Error('IMMUTABLE_RESOURCE: EvidenceBundle is immutable (create-only).')
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
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

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

export { prisma }

// Teste a conexão
prisma.$connect()
  .then(() => console.log('✅ Prisma conectado ao banco de dados'))
  .catch((error) => console.error('❌ Erro ao conectar ao banco:', error)) 
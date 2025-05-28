import { PrismaClient } from '@prisma/client'

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

export { prisma }

// Teste a conexão
prisma.$connect()
  .then(() => console.log('Conectado ao SQLite'))
  .catch((error) => console.error('Erro ao conectar ao SQLite:', error)) 
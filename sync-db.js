#!/usr/bin/env node

const { execSync } = require('child_process');

console.log('🔄 Sincronizando banco de dados com schema...\n');

try {
  // 1. Gerar Prisma Client
  console.log('📦 Gerando Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  
  // 2. Aplicar schema ao banco (sem criar migration)
  console.log('\n🗄️  Aplicando schema ao banco...');
  execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
  
  console.log('\n✅ Banco sincronizado com sucesso!');
  console.log('\n📝 Próximos passos:');
  console.log('   1. Reinicie o servidor de desenvolvimento');
  console.log('   2. Teste o fluxo de registro em /register');
  console.log('   3. Teste o login em /login');
  console.log('   4. Teste o reset de senha em /forgot-password\n');
  
} catch (error) {
  console.error('\n❌ Erro ao sincronizar banco:', error.message);
  process.exit(1);
}

/**
 * XASE CORE - Create Tenant Script
 * 
 * Cria um novo tenant e gera API key
 * Uso: node database/create-tenant.js "Nome" "email@example.com" "Nome da Empresa"
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function createTenant(name, email, companyName) {
  try {
    log('\n🏢 Criando novo tenant Xase...', 'cyan');
    
    // Verificar se já existe
    const existing = await prisma.tenant.findUnique({
      where: { email },
    });
    
    if (existing) {
      log(`❌ Tenant já existe com este email: ${email}`, 'red');
      process.exit(1);
    }
    
    // Criar tenant
    const tenant = await prisma.tenant.create({
      data: {
        name,
        email,
        companyName,
        status: 'ACTIVE',
        plan: 'free',
      },
    });
    
    log(`✅ Tenant criado: ${tenant.id}`, 'green');
    
    // Gerar API Key
    log('\n🔑 Gerando API Key...', 'cyan');
    const apiKey = `xase_pk_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = await bcrypt.hash(apiKey, 10);
    const keyPrefix = apiKey.substring(0, 16);
    
    await prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        name: 'Production API Key',
        keyHash,
        keyPrefix,
        isActive: true,
        rateLimit: 1000,
      },
    });
    
    // Exibir informações
    log('\n=====================================', 'cyan');
    log('🎉 TENANT CRIADO COM SUCESSO!', 'green');
    log('=====================================', 'cyan');
    log(`\nTenant ID: ${tenant.id}`, 'cyan');
    log(`Nome: ${tenant.name}`, 'cyan');
    log(`Email: ${tenant.email}`, 'cyan');
    if (companyName) {
      log(`Empresa: ${companyName}`, 'cyan');
    }
    log(`\n🔑 API KEY (GUARDE COM SEGURANÇA):`, 'yellow');
    log(`${apiKey}`, 'magenta');
    log(`\n⚠️  Esta chave não será exibida novamente!`, 'red');
    log(`\n💡 Use no header das requisições:`, 'yellow');
    log(`   X-API-Key: ${apiKey}`, 'cyan');
    log(`\n📝 Exemplo de uso:`, 'yellow');
    log(`   curl -X POST http://localhost:3000/api/xase/v1/records \\`, 'cyan');
    log(`     -H "Content-Type: application/json" \\`, 'cyan');
    log(`     -H "X-API-Key: ${apiKey}" \\`, 'cyan');
    log(`     -d '{"input":{"test":"data"},"output":{"result":"ok"}}'`, 'cyan');
    log('\n=====================================\n', 'cyan');
    
  } catch (error) {
    log('\n❌ Erro ao criar tenant:', 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Validar argumentos
const args = process.argv.slice(2);

if (args.length < 2) {
  log('\n❌ Argumentos insuficientes', 'red');
  log('\nUso:', 'yellow');
  log('  node database/create-tenant.js "Nome" "email@example.com" "Nome da Empresa"', 'cyan');
  log('\nExemplo:', 'yellow');
  log('  node database/create-tenant.js "John Doe" "john@acme.com" "Acme Corp"\n', 'cyan');
  process.exit(1);
}

const [name, email, companyName] = args;

// Executar
createTenant(name, email, companyName || null);

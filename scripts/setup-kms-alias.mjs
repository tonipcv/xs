#!/usr/bin/env node
/*
  Setup KMS Alias
  ---------------
  Verifica se o alias existe e cria se necessário.
*/

import { KMSClient, DescribeKeyCommand, CreateAliasCommand, ListAliasesCommand } from '@aws-sdk/client-kms'

const region = process.env.AWS_REGION || 'sa-east-1'
const keyId = '70945ad8-3acc-4c54-9ce0-4728d7abb27f'
const aliasName = 'alias/xase-evidence-bundles'

function log(level, message, ctx = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, message, ...ctx }))
}

async function main() {
  console.log('\n🔧 KMS Alias Setup\n')
  
  const kms = new KMSClient({ region })
  
  // 1. Verificar se a chave existe
  try {
    log('info', 'setup.check_key', { keyId, region })
    const keyRes = await kms.send(new DescribeKeyCommand({ KeyId: keyId }))
    log('info', 'setup.key_found', {
      keyId: keyRes.KeyMetadata.KeyId,
      keyState: keyRes.KeyMetadata.KeyState,
      keyUsage: keyRes.KeyMetadata.KeyUsage,
      keySpec: keyRes.KeyMetadata.KeySpec,
    })
  } catch (e) {
    log('error', 'setup.key_not_found', { error: e.message, code: e.name })
    console.log('\n❌ Key not found. Check key ID and region.\n')
    process.exit(1)
  }
  
  // 2. Verificar se o alias já existe
  try {
    log('info', 'setup.check_alias', { aliasName })
    const aliasesRes = await kms.send(new ListAliasesCommand({ KeyId: keyId }))
    const existingAlias = aliasesRes.Aliases?.find(a => a.AliasName === aliasName)
    
    if (existingAlias) {
      log('info', 'setup.alias_exists', { aliasName, targetKeyId: existingAlias.TargetKeyId })
      console.log('\n✅ Alias already exists!\n')
      console.log(`   Alias: ${aliasName}`)
      console.log(`   Target Key: ${existingAlias.TargetKeyId}\n`)
      process.exit(0)
    }
  } catch (e) {
    log('warn', 'setup.check_alias_failed', { error: e.message })
  }
  
  // 3. Criar alias
  try {
    log('info', 'setup.create_alias', { aliasName, keyId })
    await kms.send(new CreateAliasCommand({
      AliasName: aliasName,
      TargetKeyId: keyId,
    }))
    log('info', 'setup.alias_created', { aliasName, keyId })
    console.log('\n✅ Alias created successfully!\n')
    console.log(`   Alias: ${aliasName}`)
    console.log(`   Target Key: ${keyId}\n`)
    process.exit(0)
  } catch (e) {
    log('error', 'setup.create_alias_failed', { error: e.message, code: e.name })
    console.log('\n❌ Failed to create alias:', e.message, '\n')
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('❌ Setup failed:', e)
  process.exit(99)
})

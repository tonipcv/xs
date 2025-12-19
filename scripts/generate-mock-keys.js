#!/usr/bin/env node
'use strict'

/**
 * Gera par de chaves RSA para MockKMS (desenvolvimento)
 * 
 * Uso:
 *   node scripts/generate-mock-keys.js
 * 
 * Saída:
 *   - Imprime chaves PEM no console
 *   - Copie para .env como XASE_MOCK_PRIVATE_KEY_PEM e XASE_MOCK_PUBLIC_KEY_PEM
 */

const crypto = require('crypto')

console.log('Gerando par de chaves RSA 2048...\n')

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
})

console.log('=== PRIVATE KEY (XASE_MOCK_PRIVATE_KEY_PEM) ===')
console.log(privateKey)

console.log('\n=== PUBLIC KEY (XASE_MOCK_PUBLIC_KEY_PEM) ===')
console.log(publicKey)

// Calcular fingerprint
const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex')
console.log('\n=== KEY FINGERPRINT ===')
console.log(fingerprint)
console.log('(Primeiros 16 chars):', fingerprint.substring(0, 16))

console.log('\n=== INSTRUÇÕES ===')
console.log('1. Copie as chaves acima para seu .env:')
console.log('')
console.log('XASE_MOCK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----...')
console.log('XASE_MOCK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----...')
console.log('')
console.log('2. Reinicie o servidor Next.js')
console.log('3. As assinaturas agora serão consistentes entre restarts')
console.log('')
console.log('⚠️  NUNCA commite a chave privada no Git!')
console.log('⚠️  Use .env.local (já está no .gitignore)')

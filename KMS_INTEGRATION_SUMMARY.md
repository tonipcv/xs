# AWS KMS Integration - Summary

## ✅ Status: PRODUCTION-READY

A integração com AWS KMS para assinatura criptográfica de Evidence Bundles está **completa e testada**.

## 🎯 O Que Foi Implementado

### 1. Worker com KMS Signing

**Arquivo**: `scripts/worker-bundles-prisma.mjs`

- **Função `signWithKMS()`**:
  - Aceita hash SHA-256 do `records.json`
  - Chama AWS KMS Sign com `ECDSA_SHA_256`
  - Retorna assinatura em base64
  - Fallback para hash-only se KMS não configurado

- **Integração no fluxo**:
  - Gera `records.json` → calcula hash → assina com KMS → grava `signature.json`
  - Formato da assinatura:
    ```json
    {
      "algorithm": "ECDSA_SHA_256",
      "keyId": "alias/xase-evidence-bundles",
      "signedAt": "2025-12-27T20:30:00.000Z",
      "hash": "9c1e4d2a...",
      "signature": "MEQCIGk..."
    }
    ```

### 2. Verificação Offline

**Arquivo dentro do bundle**: `verify.js`

- Verifica hash do `records.json`
- Se KMS signature presente:
  - Busca `public-key.pem` no diretório
  - Verifica assinatura ECDSA
  - Exibe resultado detalhado
- Se hash-only:
  - Verifica apenas integridade do hash

**Script standalone**: `scripts/verify-kms-signature.mjs`

- Verifica bundles extraídos
- Suporta path customizado para chave pública
- Logs estruturados JSON

### 3. Testes

**Script de teste**: `scripts/test-kms-signing.mjs`

- Valida configuração (AWS_REGION, KMS_KEY_ID)
- Testa operação Sign
- Busca chave pública (opcional)
- Salva chave pública em `/tmp/kms-public-key.der`
- Converte para PEM com openssl

### 4. Documentação

**Atualizado**: `EVIDENCE_BUNDLES_RBAC_STORAGE.md`

- Seção completa sobre KMS
- Instruções de configuração
- Comandos de verificação offline
- Frase pronta para auditores
- Custo estimado

**README dentro do bundle**:
- Instruções de verificação
- Comandos para obter chave pública
- Status de compliance

## 📋 Configuração

### Variáveis de Ambiente

```env
# AWS KMS
AWS_REGION=us-east-1
KMS_KEY_ID=alias/xase-evidence-bundles

# AWS Credentials
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

### IAM Permissions

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:*:key/*"
    }
  ]
}
```

### Dependências

```bash
npm i @aws-sdk/client-kms
```

## 🧪 Como Testar

### 1. Testar Integração KMS

```bash
export AWS_REGION=us-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...

node scripts/test-kms-signing.mjs
```

**Resultado esperado**:
```
✅ Passed: 3
❌ Failed: 0
🎉 KMS integration working correctly!
```

### 2. Gerar Bundle com KMS

```bash
# Iniciar worker com KMS configurado
export AWS_REGION=us-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
node scripts/worker-bundles-prisma.mjs --poll-ms 2000

# Criar bundle via UI ou API
# Worker vai assinar com KMS automaticamente
```

### 3. Verificar Assinatura

```bash
# Extrair bundle ZIP
unzip bundle_xxx.zip -d extracted/

# Obter chave pública (uma vez)
aws kms get-public-key \
  --key-id alias/xase-evidence-bundles \
  --region us-east-1 \
  --output json > public-key.json

jq -r '.PublicKey' public-key.json | base64 --decode > public-key.der
openssl ec -inform DER -pubin -in public-key.der -out public-key.pem

# Verificar
cd extracted/
node verify.js
```

**Resultado esperado**:
```
✅ VERIFICATION PASSED (KMS ECDSA)
   Algorithm: ECDSA_SHA_256
   Key ID: alias/xase-evidence-bundles
   Signed at: 2025-12-27T20:30:00.000Z
```

## 🔐 Compliance

### Garantias Criptográficas

- ✅ **Integridade**: SHA-256 hash
- ✅ **Não-repúdio**: ECDSA signature com chave privada no HSM
- ✅ **Verificação offline**: Independente da plataforma
- ✅ **Cadeia de custódia**: Auditável via AuditLog
- ✅ **WORM**: Imutabilidade garantida
- ✅ **Tamper-evident**: Qualquer modificação invalida assinatura

### Frase para Auditor

> "Evidence Bundles are cryptographically signed using an asymmetric key stored in AWS KMS (HSM). The private key never leaves the HSM and cannot be exported. Integrity can be verified offline using the public key, independently of our platform."

### Certificações Suportadas

- **ISO 27001**: Controles criptográficos, gestão de chaves
- **SOC 2 Type II**: Integridade, não-repúdio, auditabilidade
- **LGPD/GDPR**: Proteção de dados, cadeia de custódia

## 💰 Custo

- **KMS key**: ~US$ 1/mês (chave assimétrica)
- **Sign operations**: US$ 0.03 por 10.000 operações
- **GetPublicKey**: gratuito

**Exemplo**: 1000 bundles/mês = ~US$ 1.30/mês total

## 🚀 Próximos Passos (Opcional)

### 1. IAM Role para Worker

Substituir credenciais estáticas por IAM role:

```bash
# EC2/ECS: usar instance profile
# Lambda: usar execution role
# Remover AWS_ACCESS_KEY_ID e AWS_SECRET_ACCESS_KEY
```

### 2. Rotação de Chave

Manter `KMS_KEY_ID` como alias facilita rotação:

```bash
# Criar nova chave
aws kms create-key --key-spec ECC_NIST_P256 --key-usage SIGN_VERIFY

# Atualizar alias
aws kms update-alias \
  --alias-name alias/xase-evidence-bundles \
  --target-key-id <new-key-id>

# Bundles antigos continuam verificáveis com chave pública antiga
```

### 3. Multi-Region

Para HA, replicar chave KMS:

```bash
aws kms replicate-key \
  --key-id <key-id> \
  --replica-region us-west-2
```

## 📊 Métricas de Sucesso

- [x] KMS key criada e configurada
- [x] Worker assina bundles com ECDSA
- [x] Verificação offline funciona
- [x] Fallback hash-only para dev
- [x] Documentação completa
- [x] Scripts de teste
- [x] README no bundle com instruções

## ✅ Checklist Final

- [x] `@aws-sdk/client-kms` instalado
- [x] Worker com função `signWithKMS()`
- [x] `verify.js` atualizado para KMS
- [x] Script `test-kms-signing.mjs`
- [x] Script `verify-kms-signature.mjs`
- [x] Documentação atualizada
- [x] README no bundle com instruções
- [x] Fallback hash-only para dev
- [x] Logs estruturados
- [x] Observabilidade (requestId)

---

**Status**: ✅ PRODUCTION-READY
**Data**: 27 de dezembro de 2025
**Versão**: 1.0.0

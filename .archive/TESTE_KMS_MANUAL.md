# 🧪 Teste KMS Manual - Passo a Passo

## ❌ Problemas Identificados

1. **AWS CLI não instalado**: `zsh: command not found: aws`
2. **Credenciais AWS não configuradas**: `Could not load credentials from any providers`
3. **Bundle não extraído**: `extracted-bundle/records.json` não existe

## ✅ Solução Completa

### 1. Instalar AWS CLI (se necessário)

```bash
# macOS (Homebrew)
brew install awscli

# Ou download direto
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Verificar instalação
aws --version
```

### 2. Configurar Credenciais AWS

**Opção A: Criar arquivo de credenciais**

```bash
mkdir -p ~/.aws

cat > ~/.aws/credentials << 'EOF'
[default]
aws_access_key_id = YOUR_ACCESS_KEY_HERE
aws_secret_access_key = YOUR_SECRET_KEY_HERE
EOF

cat > ~/.aws/config << 'EOF'
[default]
region = sa-east-1
EOF
```

**Opção B: Exportar variáveis de ambiente**

```bash
export AWS_ACCESS_KEY_ID=YOUR_ACCESS_KEY_HERE
export AWS_SECRET_ACCESS_KEY=YOUR_SECRET_KEY_HERE
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
```

**Opção C: Usar IAM role (se em EC2/ECS/Lambda)**

Já funciona automaticamente, apenas exporte região e key ID:
```bash
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
```

### 3. Verificar Credenciais

```bash
aws sts get-caller-identity --region sa-east-1
```

Deve retornar algo como:
```json
{
    "UserId": "AIDAXXXXXXXXX",
    "Account": "975049923967",
    "Arn": "arn:aws:iam::975049923967:user/seu-usuario"
}
```

### 4. Testar Acesso à Chave KMS

```bash
aws kms describe-key --key-id alias/xase-evidence-bundles --region sa-east-1
```

Deve retornar detalhes da chave sem erro.

### 5. Testar Assinatura KMS (Script)

```bash
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles

node scripts/test-kms-signing.mjs
```

**Resultado esperado**:
```
✅ Passed: 3
❌ Failed: 0
🎉 KMS integration working correctly!
```

### 6. Rodar Worker com KMS

```bash
# No mesmo terminal (para herdar variáveis)
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles

node scripts/worker-bundles-prisma.mjs --poll-ms 2000
```

**Logs esperados**:
```json
{"ts":"...","level":"info","message":"worker.start","pollMs":2000}
```

### 7. Gerar Bundle (UI)

1. Abrir: http://localhost:3000/xase/bundles
2. Clicar "Create Bundle"
3. Preencher:
   - Purpose: AUDIT
   - Description: "Teste KMS"
   - Date range: últimos 30 dias (ou vazio)
4. Submeter

**Aguardar**:
- Worker loga: `worker.job:claimed` → `worker.job:success`
- Bundle status: `READY`

### 8. Baixar e Extrair Bundle

1. Clicar "Download" no bundle READY
2. Extrair ZIP:
   ```bash
   mkdir extracted-bundle
   unzip bundle_*.zip -d extracted-bundle/
   ```

### 9. Verificar Assinatura KMS

**A) Verificação rápida (hash)**:
```bash
cd extracted-bundle/
node verify.js
```

**B) Verificação completa (ECDSA com chave pública)**:

```bash
# 1. Obter chave pública do KMS (uma vez)
aws kms get-public-key \
  --key-id alias/xase-evidence-bundles \
  --region sa-east-1 \
  --output json > public-key.json

# 2. Converter para DER
jq -r '.PublicKey' public-key.json | base64 --decode > public-key.der

# 3. Converter para PEM
openssl ec -inform DER -pubin -in public-key.der -out public-key.pem

# 4. Verificar assinatura
cd extracted-bundle/
node verify.js
```

**Resultado esperado (com KMS)**:
```
✅ VERIFICATION PASSED (KMS ECDSA)
   Algorithm: ECDSA_SHA_256
   Key ID: alias/xase-evidence-bundles
   Signed at: 2025-12-27T...
```

**Resultado esperado (sem KMS)**:
```
✅ HASH VERIFICATION PASSED (no KMS signature)
```

### 10. Verificar signature.json

```bash
cd extracted-bundle/
cat signature.json
```

**Com KMS configurado**:
```json
{
  "algorithm": "ECDSA_SHA_256",
  "keyId": "alias/xase-evidence-bundles",
  "signedAt": "2025-12-27T21:30:00.000Z",
  "hash": "9c1e4d2a...",
  "signature": "MEQCIGk..."
}
```

**Sem KMS (fallback)**:
```json
{
  "algorithm": "SHA256",
  "hash": "9c1e4d2a...",
  "signedAt": "2025-12-27T21:30:00.000Z",
  "signedBy": "local"
}
```

## 🔍 Troubleshooting

### "aws: command not found"
- Instale AWS CLI (passo 1)

### "Could not load credentials from any providers"
- Configure credenciais (passo 2)
- Verifique com `aws sts get-caller-identity`

### "AccessDeniedException"
- Verifique IAM permissions: `kms:Sign`, `kms:GetPublicKey`
- Verifique key policy da chave KMS

### Worker usa hash-only (não KMS)
- Verifique variáveis no terminal do worker:
  ```bash
  env | grep -E 'AWS_REGION|KMS_KEY_ID'
  ```
- Reinicie worker após exportar variáveis

### "records.json not found"
- Extraia o bundle ZIP antes de verificar
- Use path correto: `--bundle-dir ./extracted-bundle`

### Assinatura falha na verificação
- Certifique-se de usar a chave pública correta (mesma região)
- Verifique se o bundle foi gerado COM KMS (veja signature.json)

## ✅ Checklist de Sucesso

- [ ] AWS CLI instalado e funcionando
- [ ] Credenciais AWS configuradas
- [ ] `aws sts get-caller-identity` funciona
- [ ] `aws kms describe-key` funciona
- [ ] `node scripts/test-kms-signing.mjs` passa (3/3)
- [ ] Worker rodando com variáveis exportadas
- [ ] Bundle gerado com status READY
- [ ] `signature.json` contém `algorithm: ECDSA_SHA_256`
- [ ] `node verify.js` retorna "VERIFICATION PASSED (KMS ECDSA)"

## 📊 Resultado Final Esperado

```
🎉 KMS integration working correctly!

Bundle gerado com:
- Algorithm: ECDSA_SHA_256
- Key ID: alias/xase-evidence-bundles
- Signature: base64 válida
- Verification: ✅ PASSED

Compliance:
✅ Integridade (SHA-256)
✅ Não-repúdio (ECDSA com HSM)
✅ Verificação offline (independente da AWS)
✅ Cadeia de custódia (audit trail)
✅ WORM (imutável)
✅ Tamper-evident (adulteração detectada)
```

## 🚀 Próximos Passos (Após Sucesso)

1. **Produção**: Usar IAM role em vez de credenciais estáticas
2. **Rotação**: Manter alias para facilitar rotação de chave
3. **Multi-region**: Replicar chave para HA
4. **Alerting**: Monitorar falhas de assinatura
5. **Documentação**: Atualizar README com instruções de verificação

---

**Status**: Aguardando configuração de credenciais AWS
**Próximo passo**: Configurar credenciais (passo 2) e rodar teste (passo 5)

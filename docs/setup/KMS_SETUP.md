# XASE Core - Setup KMS (Passo a Passo)

## Opção 1: Mock KMS (Desenvolvimento)

### 1. Gerar par de chaves

```bash
node scripts/generate-mock-keys.js
```

### 2. Copiar chaves para `.env.local`

```bash
# .env.local
XASE_KMS_TYPE=mock
XASE_MOCK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----"

XASE_MOCK_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu...
-----END PUBLIC KEY-----"
```

### 3. Reiniciar servidor

```bash
npm run dev
```

### 4. Testar

```bash
export XASE_API_KEY="xase_pk_..." BASE_URL="http://localhost:3001"
node scripts/create-record.js
node scripts/export-bundle.js <transaction_id> evidence.zip
node scripts/verify-bundle.js evidence.zip
```

**Resultado esperado:**
```
✓ Hash match: true
✓ Signature valid: true
ℹ️ Key fingerprint: a1b2c3d4e5f6...
```

---

## Opção 2: AWS KMS (Produção)

### 1. Criar chave no AWS KMS

```bash
aws kms create-key \
  --key-usage SIGN_VERIFY \
  --customer-master-key-spec RSA_2048 \
  --description "XASE Evidence Signing Key" \
  --region us-east-1
```

**Salve o `KeyId` retornado:**
```json
{
  "KeyMetadata": {
    "KeyId": "abc-def-ghi-jkl",
    "Arn": "arn:aws:kms:us-east-1:123456789:key/abc-def-ghi-jkl"
  }
}
```

### 2. Criar alias (opcional, mas recomendado)

```bash
aws kms create-alias \
  --alias-name alias/xase-signing-key \
  --target-key-id abc-def-ghi-jkl \
  --region us-east-1
```

### 3. Criar IAM Policy (mínimo necessário)

Arquivo: `xase-kms-policy.json`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSignOnly",
      "Effect": "Allow",
      "Action": [
        "kms:Sign",
        "kms:GetPublicKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:123456789:key/abc-def-ghi-jkl",
      "Condition": {
        "StringEquals": {
          "kms:SigningAlgorithm": "RSASSA_PKCS1_V1_5_SHA_256"
        }
      }
    }
  ]
}
```

Criar policy:
```bash
aws iam create-policy \
  --policy-name XaseKMSSigningPolicy \
  --policy-document file://xase-kms-policy.json
```

### 4. Criar IAM User e anexar policy

```bash
# Criar usuário
aws iam create-user --user-name xase-signing-service

# Anexar policy
aws iam attach-user-policy \
  --user-name xase-signing-service \
  --policy-arn arn:aws:iam::123456789:policy/XaseKMSSigningPolicy

# Criar access key
aws iam create-access-key --user-name xase-signing-service
```

**Salve `AccessKeyId` e `SecretAccessKey`**

### 5. Configurar variáveis de ambiente

```bash
# .env.local (ou .env.production)
XASE_KMS_TYPE=aws
XASE_KMS_KEY_ID=arn:aws:kms:us-east-1:123456789:key/abc-def-ghi-jkl
XASE_KMS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

### 6. Habilitar CloudTrail (auditoria)

```bash
aws cloudtrail create-trail \
  --name xase-kms-audit \
  --s3-bucket-name my-cloudtrail-bucket \
  --is-multi-region-trail

aws cloudtrail start-logging --name xase-kms-audit
```

### 7. Testar assinatura

```bash
npm run dev

export XASE_API_KEY="xase_pk_..." BASE_URL="https://your-domain.com"
node scripts/create-record.js
node scripts/export-bundle.js <transaction_id> evidence.zip
node scripts/verify-bundle.js evidence.zip
```

**Verificar CloudTrail:**
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=Sign \
  --max-results 10
```

### 8. Publicar fingerprint da chave pública

```bash
# Obter chave pública
aws kms get-public-key \
  --key-id abc-def-ghi-jkl \
  --output text \
  --query PublicKey | base64 -d > public-key.der

# Converter DER para PEM
openssl rsa -pubin -inform DER -in public-key.der -outform PEM -out public-key.pem

# Calcular fingerprint
openssl dgst -sha256 public-key.pem
```

**Publicar em:**
- `https://xase.ai/.well-known/signing-keys.json`
- `https://docs.xase.ai/security/keys`
- `SECURITY.md` no GitHub

Exemplo `signing-keys.json`:
```json
{
  "keys": [
    {
      "key_id": "arn:aws:kms:us-east-1:123456789:key/abc-def-ghi-jkl",
      "fingerprint": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6",
      "algorithm": "RSA-SHA256",
      "valid_from": "2025-01-01T00:00:00Z",
      "valid_until": "2026-01-01T00:00:00Z",
      "status": "active"
    }
  ]
}
```

---

## Opção 3: GCP KMS (Alternativa)

### 1. Criar keyring e chave

```bash
gcloud kms keyrings create xase-signing \
  --location us-east1

gcloud kms keys create xase-evidence-key \
  --keyring xase-signing \
  --location us-east1 \
  --purpose asymmetric-signing \
  --default-algorithm rsa-sign-pkcs1-2048-sha256
```

### 2. Criar service account

```bash
gcloud iam service-accounts create xase-signing-service \
  --display-name "XASE Signing Service"

gcloud kms keys add-iam-policy-binding xase-evidence-key \
  --keyring xase-signing \
  --location us-east1 \
  --member serviceAccount:xase-signing-service@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/cloudkms.signerVerifier

gcloud iam service-accounts keys create key.json \
  --iam-account xase-signing-service@PROJECT_ID.iam.gserviceaccount.com
```

### 3. Configurar

```bash
# .env.local
XASE_KMS_TYPE=gcp
XASE_KMS_KEY_NAME=projects/PROJECT_ID/locations/us-east1/keyRings/xase-signing/cryptoKeys/xase-evidence-key/cryptoKeyVersions/1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

**Nota:** Implementação GCP KMS requer adaptação do código (não incluída neste MVP).

---

## Monitoramento e Alertas

### CloudWatch Alarms (AWS)

```bash
# Alarme: muitas assinaturas
aws cloudwatch put-metric-alarm \
  --alarm-name xase-high-signing-volume \
  --metric-name CallCount \
  --namespace AWS/KMS \
  --statistic Sum \
  --period 3600 \
  --threshold 10000 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:xase-alerts

# Alarme: falhas
aws cloudwatch put-metric-alarm \
  --alarm-name xase-kms-errors \
  --metric-name ErrorCount \
  --namespace AWS/KMS \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789:xase-alerts
```

### Logs Customizados

No código, já temos auditoria via `logAudit()`:
- `HASH_SIGNED` - sucesso
- `SIGN_REJECTED` - validação falhou
- `SIGN_RATE_LIMITED` - limite excedido
- `SIGN_KMS_ERROR` - erro no KMS

Query exemplo (CloudWatch Logs Insights):
```
fields @timestamp, action, tenantId, resourceId, status
| filter action = "HASH_SIGNED"
| stats count() by tenantId
| sort count desc
```

---

## Rotação de Chaves

### Quando rotacionar?

- **Anualmente** (recomendado)
- **Após incidente de segurança**
- **Mudança de compliance**

### Processo

1. **Criar nova chave**
```bash
aws kms create-key \
  --key-usage SIGN_VERIFY \
  --customer-master-key-spec RSA_2048 \
  --description "XASE Evidence Signing Key v2"
```

2. **Atualizar `XASE_KMS_KEY_ID`** (deploy gradual)

3. **Publicar novo fingerprint** em canais oficiais

4. **Manter chave antiga ativa por 90 dias** (para verificação de provas antigas)

5. **Desabilitar chave antiga**
```bash
aws kms disable-key --key-id OLD_KEY_ID
```

6. **Agendar exclusão** (após 7-30 dias)
```bash
aws kms schedule-key-deletion --key-id OLD_KEY_ID --pending-window-in-days 30
```

---

## Troubleshooting

### Erro: "Module not found: @aws-sdk/client-kms"

```bash
npm i @aws-sdk/client-kms
```

### Erro: "AccessDeniedException"

Verificar IAM policy:
```bash
aws kms get-key-policy --key-id abc-def --policy-name default
```

### Erro: "InvalidSignatureException"

- Verificar se está assinando hash (64 hex chars)
- Verificar `MessageType: 'DIGEST'`
- Verificar algoritmo: `RSASSA_PKCS1_V1_5_SHA_256`

### Verificação offline falha

- Verificar se `public_key_pem` está no `proof.json`
- Verificar se está verificando o **hash** (não o JSON canônico)
- Verificar fingerprint contra canal oficial

---

## Custos AWS KMS

- **Chave assimétrica:** $1/mês
- **Assinaturas:** $0.03 por 10.000 requests
- **GetPublicKey:** $0.03 por 10.000 requests

**Exemplo:**
- 1 milhão de assinaturas/mês = $3
- 1 chave = $1
- **Total:** ~$4/mês

**CloudTrail:** ~$2/mês (primeiros 5GB grátis)

---

## Checklist Final

- [ ] Chave criada no KMS
- [ ] IAM policy mínima configurada
- [ ] Variáveis de ambiente definidas
- [ ] CloudTrail habilitado
- [ ] Fingerprint publicado
- [ ] Teste E2E passou
- [ ] Verificação offline funciona
- [ ] Alertas configurados
- [ ] Documentação atualizada
- [ ] Plano de rotação definido

---

## Próximos Passos

1. **TSA (Timestamp Authority)** - adicionar carimbo de tempo confiável
2. **Multi-region** - replicar chaves para DR
3. **HSM dedicado** - migrar para CloudHSM (compliance avançado)
4. **Blockchain anchoring** - âncora em blockchain público (opcional)

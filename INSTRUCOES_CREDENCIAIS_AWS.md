# 🔑 Como Obter e Configurar Credenciais AWS

## ❌ Problema Atual

O teste KMS falha com:
```
CredentialsProviderError: Could not load credentials from any providers
```

Isso significa que você precisa de **credenciais AWS válidas** (Access Key ID + Secret Access Key).

---

## ✅ SOLUÇÃO: Obter Credenciais AWS

### Opção 1: Criar IAM User com Acesso KMS (Recomendado para Testes)

1. **Acessar AWS Console**
   - Ir para: https://console.aws.amazon.com/iam/
   - Login na conta: `975049923967`

2. **Criar IAM User**
   - IAM → Users → Create user
   - Nome: `xase-kms-worker`
   - Access type: ☑️ Programmatic access (Access key)
   - Next

3. **Adicionar Permissões**
   - Attach policies directly
   - Criar policy inline ou usar managed policy
   
   **Policy JSON**:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "kms:Sign",
           "kms:GetPublicKey",
           "kms:DescribeKey"
         ],
         "Resource": "arn:aws:kms:sa-east-1:975049923967:key/70945ad8-3acc-4c54-9ce0-4728d7abb27f"
       }
     ]
   }
   ```

4. **Criar User e Copiar Credenciais**
   - Finish
   - **IMPORTANTE**: Copiar:
     - Access key ID (ex: `AKIA...`)
     - Secret access key (ex: `wJalrXUtn...`)
   - ⚠️ **Você só verá o Secret uma vez!**

5. **Adicionar ao .env**
   ```bash
   # Editar /Users/albertalves/xase-dashboard/.env
   AWS_ACCESS_KEY_ID=AKIA...
   AWS_SECRET_ACCESS_KEY=wJalrXUtn...
   ```

### Opção 2: Usar Credenciais Existentes

Se você já tem um IAM user ou root account:

1. **IAM → Users → Seu usuário → Security credentials**
2. **Create access key**
3. **Copiar Access Key ID e Secret**
4. **Adicionar ao .env** (mesmo formato acima)

### Opção 3: Usar AWS CLI Profile (Se Já Configurado)

Se você já usa AWS CLI em outro projeto:

```bash
# Ver profiles existentes
cat ~/.aws/credentials

# Usar profile específico
export AWS_PROFILE=seu-perfil
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles

node scripts/test-kms-signing.mjs
```

---

## 🧪 Testar Credenciais

### 1. Instalar AWS CLI (se ainda não tiver)

```bash
# macOS
brew install awscli

# Ou download direto
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

### 2. Configurar Credenciais

```bash
aws configure
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: wJalrXUtn...
# Default region: sa-east-1
# Default output format: json
```

### 3. Testar Acesso

```bash
# Testar identidade
aws sts get-caller-identity --region sa-east-1

# Testar acesso à chave KMS
aws kms describe-key --key-id alias/xase-evidence-bundles --region sa-east-1

# Testar get public key
aws kms get-public-key --key-id alias/xase-evidence-bundles --region sa-east-1
```

Se todos funcionarem, suas credenciais estão OK!

---

## 🚀 Próximos Passos (Após Configurar Credenciais)

### 1. Atualizar .env

```bash
# Editar: /Users/albertalves/xase-dashboard/.env
AWS_REGION=sa-east-1
KMS_KEY_ID=alias/xase-evidence-bundles
AWS_ACCESS_KEY_ID=AKIA...  # ← Suas credenciais reais aqui
AWS_SECRET_ACCESS_KEY=wJalrXUtn...  # ← Suas credenciais reais aqui
```

### 2. Testar KMS (com dotenv)

```bash
# Instalar dotenv-cli (para carregar .env em scripts)
npm install -g dotenv-cli

# Testar KMS
dotenv -e .env node scripts/test-kms-signing.mjs
```

**OU exportar manualmente**:

```bash
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=wJalrXUtn...

node scripts/test-kms-signing.mjs
```

**Resultado esperado**:
```
✅ Passed: 3
❌ Failed: 0
🎉 KMS integration working correctly!
```

### 3. Rodar Worker com KMS

```bash
# Exportar variáveis (mesmo terminal)
export AWS_REGION=sa-east-1
export KMS_KEY_ID=alias/xase-evidence-bundles
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=wJalrXUtn...

# Rodar worker
node scripts/worker-bundles-prisma.mjs --poll-ms 2000
```

### 4. Gerar Bundle e Verificar

1. UI: http://localhost:3000/xase/bundles → Create Bundle
2. Aguardar: `worker.job:success`
3. Download ZIP
4. Extrair e verificar `signature.json`:
   ```json
   {
     "algorithm": "ECDSA_SHA_256",
     "keyId": "alias/xase-evidence-bundles",
     "signature": "MEQCIGk..."
   }
   ```

5. Obter chave pública e verificar:
   ```bash
   aws kms get-public-key --key-id alias/xase-evidence-bundles --region sa-east-1 --output json > public-key.json
   jq -r '.PublicKey' public-key.json | base64 --decode > public-key.der
   openssl ec -inform DER -pubin -in public-key.der -out public-key.pem
   
   cd extracted-bundle/
   node verify.js
   ```

**Resultado esperado**:
```
✅ VERIFICATION PASSED (KMS ECDSA)
   Algorithm: ECDSA_SHA_256
   Key ID: alias/xase-evidence-bundles
   Signed at: 2025-12-27T...
```

---

## 🔒 Segurança

### ⚠️ NUNCA commitar credenciais

O `.env` já está no `.gitignore` (você removeu temporariamente, mas deve readicionar):

```bash
# Readicionar .env ao .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
echo "!.env.example" >> .gitignore
```

### ✅ Boas Práticas

1. **Usar IAM role em produção** (EC2/ECS/Lambda)
2. **Rotacionar access keys regularmente**
3. **Princípio do menor privilégio** (apenas kms:Sign, kms:GetPublicKey)
4. **Monitorar uso** (CloudTrail logs)

---

## 📝 Resumo

1. ✅ Criar IAM user com permissões KMS
2. ✅ Copiar Access Key ID + Secret
3. ✅ Adicionar ao `.env`
4. ✅ Testar com `aws sts get-caller-identity`
5. ✅ Rodar `node scripts/test-kms-signing.mjs`
6. ✅ Rodar worker com variáveis exportadas
7. ✅ Gerar bundle e verificar assinatura ECDSA

---

**Status**: ⏸️ AGUARDANDO VOCÊ ADICIONAR CREDENCIAIS AWS AO .env
**Próximo passo**: Obter credenciais (Opção 1 acima) e atualizar `.env`

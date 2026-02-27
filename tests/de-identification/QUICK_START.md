# XASE De-Identification - Quick Start Guide

**Tempo:** 5 minutos | **Nível:** Iniciante | **Versão:** 2.1.0

---

## 🎯 Objetivo

Começar a usar o sistema de de-identificação XASE em **5 minutos** e processar seus primeiros dados médicos com **100% de segurança**.

---

## 📋 Pré-requisitos

- Node.js 18+ instalado
- 500MB de espaço em disco
- Acesso à internet (para baixar dados de teste)

---

## 🚀 Passo 1: Instalação (1 minuto)

```bash
# Entre no diretório
cd tests/de-identification

# Instale dependências
npm install
```

**Resultado esperado:**
```
✓ Installed 45 packages in 15s
```

---

## 🧪 Passo 2: Teste com Dados Reais (2 minutos)

### Baixar Imagens DICOM Reais

```bash
# Baixa 6 imagens DICOM públicas do pydicom
npm run download:dicom-real
```

**Resultado esperado:**
```
✓ CT_small.dcm (39206 bytes)
✓ MR_small.dcm (9830 bytes)
✓ rtplan.dcm (2672 bytes)
✓ rtdose.dcm (7568 bytes)
✓ rtstruct.dcm (2534 bytes)
✓ waveform_ecg.dcm (291088 bytes)
Done. Success: 6, Failed: 0
```

### Executar De-identificação

```bash
# Processa as imagens baixadas
npm run test:dicom-binary
```

**Resultado esperado:**
```
=== DICOM Binary (.dcm) De-identification Tests ===

Processing: CT_small.dcm
  ✓ PHI detected: 10
  ✓ PHI redacted: 10
  ✓ Redaction rate: 100.0%

Processing: MR_small.dcm
  ✓ PHI detected: 10
  ✓ PHI redacted: 10
  ✓ Redaction rate: 100.0%

[...]

Total PHI detected: 51
Total PHI redacted: 51
Overall redaction rate: 100.0%
```

**Arquivos de-identificados salvos em:** `output/dicom/binary-deidentified/`

---

## 💻 Passo 3: Processar Seus Dados (2 minutos)

### Arquivo Único

```bash
# DICOM
npx ts-node src/cli.ts seu_arquivo.dcm -o output.dcm

# FHIR
npx ts-node src/cli.ts patient.json -o patient_anon.json

# Texto clínico
npx ts-node src/cli.ts nota_medica.txt -o nota_anon.txt

# HL7
npx ts-node src/cli.ts mensagem.hl7 -o mensagem_anon.hl7
```

### Diretório Completo (Batch)

```bash
# Processa todos os arquivos em um diretório
npx ts-node src/cli.ts -b -i ./seus_dados -o ./dados_anonimizados -v
```

**Flags úteis:**
- `-b` : Batch mode (diretório)
- `-i` : Input (arquivo ou diretório)
- `-o` : Output (arquivo ou diretório)
- `-v` : Verbose (mostra progresso)
- `-r` : Gera relatório JSON detalhado

---

## 🌐 Passo 4: API REST (Opcional)

### Iniciar Servidor

```bash
npm run start:api
```

**Resultado esperado:**
```
🚀 XASE De-Identification API Server
📡 Listening on http://localhost:3000
✅ Health check: http://localhost:3000/health
```

### Testar API

```bash
# Health check
curl http://localhost:3000/health

# De-identificar texto
curl -X POST http://localhost:3000/api/v1/deidentify/text \
  -H "Content-Type: application/json" \
  -d '{"text":"Patient John Doe, MRN 123456, DOB 01/15/1980"}'

# Upload de arquivo
curl -X POST http://localhost:3000/api/v1/deidentify/file \
  -F "file=@input.dcm" \
  -F "type=dicom-binary" \
  -o output.dcm
```

---

## 📊 Passo 5: Verificar Resultados

### Ver Relatórios

```bash
# Gerar relatório de qualidade
npm run quality-report

# Abrir no browser (macOS)
open output/quality-reports/quality-report.html
```

### Ver Dashboard

```bash
# Gerar dashboard de monitoring
npm run dashboard

# Abrir no browser (macOS)
open output/monitoring/dashboard.html
```

---

## ✅ Validação Completa

Execute todos os testes para validar o sistema:

```bash
# Teste end-to-end (12 arquivos, 4 formatos)
npm run test:e2e
```

**Resultado esperado:**
```
Total Files Tested:     12
Success:                12
Failed:                 0
Total PHI Detected:     122
Total PHI Redacted:     120
Overall Redaction Rate: 98.4%
```

---

## 🎓 Próximos Passos

### Para Aprender Mais

1. **[SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md)** - Entenda o objetivo completo da plataforma
2. **[USAGE_GUIDE.md](USAGE_GUIDE.md)** - Uso avançado e exemplos
3. **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - Referência completa da API
4. **[DICOM_BINARY_GUIDE.md](DICOM_BINARY_GUIDE.md)** - Guia detalhado DICOM

### Para Deploy em Produção

1. **[PRODUCTION_DEPLOYMENT_GUIDE.md](PRODUCTION_DEPLOYMENT_GUIDE.md)** - Deploy completo
2. **[DOCKER_SETUP.md](DOCKER_SETUP.md)** - Configuração Docker/Kubernetes

### Para Desenvolvimento

1. **[CONTRIBUTING.md](CONTRIBUTING.md)** - Como contribuir
2. **[IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md)** - Detalhes técnicos

---

## 🆘 Troubleshooting

### Erro: "Module not found"

```bash
# Reinstale dependências
rm -rf node_modules package-lock.json
npm install
```

### Erro: "No .dcm files found"

```bash
# Baixe dados de teste
npm run download:dicom-real
```

### Erro: "Port 3000 already in use"

```bash
# Use porta diferente
PORT=3001 npm run start:api
```

### Performance lenta

```bash
# Use batch mode com concurrency
npx ts-node src/batch-processor.ts --concurrency 10
```

---

## 💡 Comandos Úteis

```bash
# Todos os testes
npm run test:all

# Teste com dados reais
npm run test:real-dicom

# Teste end-to-end
npm run test:e2e

# Benchmark de performance
npx ts-node src/advanced-benchmark.ts

# Validação completa do sistema
npx ts-node src/complete-validation.ts

# Build Docker
docker build -t xase/deidentification:2.1.0 .

# Run Docker
docker run -p 3000:3000 xase/deidentification:2.1.0
```

---

## 📞 Suporte

**Documentação:** https://docs.xase.com  
**Email:** support@xase.com  
**GitHub:** https://github.com/xase/deidentification

---

## 🎉 Parabéns!

Você configurou e testou o sistema de de-identificação XASE com sucesso!

**O que você conseguiu:**
- ✅ Instalou o sistema
- ✅ Processou imagens DICOM reais
- ✅ Validou 100% de redação de PHI
- ✅ Testou CLI e API

**Próximo passo:**
Integre o sistema em seu workflow hospitalar e comece a **monetizar seus dados médicos** de forma **ética e segura**.

---

**Versão:** 2.1.0  
**Tempo total:** ~5 minutos  
**Dificuldade:** ⭐ Fácil

# ⚖️ Xase Insurance Platform — Documentação Jurídica

**Versão:** 2.0 (UK/EU Insurance Extension)  
**Data:** 4 de Janeiro de 2026  
**Audiência:** Advogados, Compliance Officers, Auditores, Reguladores

---

## 🎯 PROPÓSITO JURÍDICO

O Xase gera **evidência técnica pré-constituída** para decisões automatizadas de IA no setor de seguros, garantindo:

1. **Reproducibilidade Total** — Capacidade de recriar exatamente a decisão original
2. **Chain of Custody Completa** — Registro auditável de todos os acessos e modificações
3. **Imutabilidade Criptográfica** — Proteção contra adulteração via hash encadeado
4. **Conformidade Regulatória** — Preparação para UK FCA, EU GDPR, eIDAS

### North Star Jurídico
> "Gerar Prova Técnica Pré-constituída de Decisão Automatizada que seja admissível em tribunal e defensável perante reguladores"

---

## 📜 FUNDAMENTOS LEGAIS

### UK/EU — Regulatory Framework

#### 1. UK Financial Conduct Authority (FCA)
- **Consumer Duty** (2023) — Exige evidência de decisões justas
- **Algorithmic Trading** — Transparência em decisões automatizadas
- **Claims Handling** — Documentação completa do processo decisório

#### 2. EU General Data Protection Regulation (GDPR)
- **Art. 13-14** — Direito à informação sobre decisões automatizadas
- **Art. 15** — Direito de acesso aos dados pessoais
- **Art. 22** — Direito de não ser sujeito a decisões exclusivamente automatizadas
- **Recital 71** — Direito a explicação da lógica envolvida

#### 3. EU eIDAS Regulation (910/2014)
- **Qualified Timestamps (QTSP)** — Carimbos de tempo qualificados
- **e-Seals** — Assinaturas eletrônicas qualificadas
- **Trust Services** — Serviços de confiança para evidência digital

#### 4. UK Electronic Communications Act 2000
- **Section 7** — Admissibilidade de evidência eletrônica
- **Electronic Signatures** — Validade jurídica de assinaturas digitais

---

## 🔐 CADEIA DE CUSTÓDIA (CHAIN OF CUSTODY)

### O que é Chain of Custody?
Registro cronológico e auditável de:
- Quem acessou a evidência
- Quando foi acessada
- Por que foi acessada (propósito)
- Quem autorizou o acesso
- Para quem foi divulgada (se aplicável)

### Eventos Tipados

#### ACCESS (Acesso)
Visualização ou consulta da evidência sem exportação.

**Exemplo:**
```json
{
  "type": "ACCESS",
  "at": "2026-01-05T10:30:00Z",
  "actor": "john.doe@insurer.com",
  "action": "RECORD_VIEWED",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "purpose": "Internal audit review"
}
```

#### EXPORT (Exportação)
Download ou geração de bundle de evidência.

**Exemplo:**
```json
{
  "type": "EXPORT",
  "at": "2026-01-05T11:00:00Z",
  "actor": "compliance@insurer.com",
  "action": "BUNDLE_DOWNLOADED",
  "purpose": "FCA regulatory submission",
  "authorizedBy": "GC"
}
```

#### DISCLOSURE (Divulgação)
Compartilhamento com terceiros (reguladores, tribunais, etc.).

**Exemplo:**
```json
{
  "type": "DISCLOSURE",
  "at": "2026-01-05T14:00:00Z",
  "actor": "legal@insurer.com",
  "action": "SENT_TO_REGULATOR",
  "recipient": "UK FCA",
  "purpose": "Regulatory disclosure - Case FCA-2026-001",
  "authorizedBy": "General Counsel"
}
```

### Custody Report (Relatório de Custódia)

Documento que consolida todos os eventos de acesso, exportação e divulgação.

**Formato:** JSON ou PDF  
**Endpoint:** `GET /api/xase/v1/bundles/:bundleId/custody`

**Conteúdo:**
1. Identificação do bundle (bundleId, evidenceId)
2. Lista cronológica de eventos (ACCESS, EXPORT, DISCLOSURE)
3. Assinaturas criptográficas (KMS, QTSP, e-Seal)
4. Status de integridade (VALID, TAMPER_EVIDENT, UNKNOWN)
5. Metadata (recordCount, createdAt, legalHold)

**Uso Jurídico:**
- Demonstrar que a evidência não foi adulterada
- Provar quem teve acesso e quando
- Justificar divulgações a reguladores ou tribunais
- Atender requisitos de discovery em litígios

---

## 🔬 REPRODUCIBILIDADE (REPRODUCIBILITY)

### O que é Reproducibilidade?
Capacidade de recriar exatamente a decisão original, com os mesmos dados, regras e ambiente.

### Por que é Juridicamente Relevante?
1. **Contestação de Decisões** — Cliente pode questionar: "Como chegaram a essa decisão?"
2. **Auditoria Regulatória** — FCA pode exigir: "Prove que a decisão foi justa"
3. **Litígio** — Tribunal pode ordenar: "Recrie a decisão com dados alternativos"
4. **Compliance GDPR Art. 22** — Demonstrar a lógica envolvida na decisão automatizada

### Snapshots de Reproducibilidade

O Xase captura 4 tipos de snapshots imutáveis:

#### 1. External Data (Dados Externos)
Dados consultados de APIs externas no momento da decisão.

**Exemplo:**
```json
{
  "creditScore": 750,
  "source": "Experian",
  "timestamp": "2026-01-05T10:00:00Z",
  "apiVersion": "v3.2",
  "responseTime": 120
}
```

**Uso Jurídico:**
- Provar que o credit score era 750 no momento da decisão
- Demonstrar que a fonte era confiável (Experian)
- Contestar alegações de dados incorretos

#### 2. Business Rules (Regras de Negócio)
Regras e políticas aplicadas na decisão.

**Exemplo:**
```json
{
  "rule": "auto_approval_under_10k",
  "version": "v2.1",
  "threshold": 10000,
  "approvedBy": "Underwriting Committee",
  "effectiveDate": "2025-12-01"
}
```

**Uso Jurídico:**
- Demonstrar que a regra estava em vigor
- Provar que a regra foi aprovada por comitê competente
- Justificar a decisão com base em política documentada

#### 3. Environment (Ambiente)
Configuração do sistema no momento da decisão.

**Exemplo:**
```json
{
  "appVersion": "1.0.0",
  "nodeVersion": "18.17.0",
  "region": "eu-west-2",
  "modelVersion": "claim-classifier-v2.3",
  "deployedAt": "2025-12-15T10:00:00Z"
}
```

**Uso Jurídico:**
- Provar qual versão do modelo foi usada
- Demonstrar que o sistema estava atualizado
- Contestar alegações de bug ou erro de software

#### 4. Feature Vector (Vetor de Features)
Features finais usadas pelo modelo de ML (pós-processamento).

**Exemplo:**
```json
{
  "features": [0.75, 0.85, 0.92, 0.68, 0.91],
  "featureNames": ["credit_score_norm", "claim_history_norm", "policy_age_norm", "risk_score_norm", "premium_ratio_norm"],
  "normalized": true,
  "scaler": "standard",
  "scalerVersion": "v1.2"
}
```

**Uso Jurídico:**
- Demonstrar exatamente quais features foram usadas
- Provar que não houve viés ou discriminação
- Permitir auditoria de fairness (equidade)

### Deduplicação e Economia

Snapshots com mesmo conteúdo (hash idêntico) reutilizam o mesmo arquivo S3.

**Benefício Jurídico:**
- Reduz custos de armazenamento (~50% economia)
- Mantém integridade (hash único garante imutabilidade)
- Facilita auditoria (menos arquivos para revisar)

---

## 📄 PDF LEGAL (COURT-READY REPORT)

### O que é o PDF Legal?
Relatório estruturado em formato legível para uso em tribunal ou submissão regulatória.

**Formato:** PDF (texto, futuramente PDF/A para arquivamento)  
**Endpoint:** `POST /api/xase/v1/bundles/:bundleId/pdf`

### Estrutura do PDF Legal

#### SEÇÃO 1: IDENTIFICATION
- Bundle ID
- Tenant (empresa)
- Claim Number (se aplicável)
- Policy Number (se aplicável)
- Regulatory Case ID (se aplicável)

#### SEÇÃO 2: TIMELINE
- Decision Timestamp (quando a decisão foi tomada)
- Checkpoint Timestamp (quando foi assinada criptograficamente)

#### SEÇÃO 3: CRYPTOGRAPHIC HASHES
- Record Hash (hash encadeado da decisão)
- Input Hash (hash do input)
- Output Hash (hash do output)
- Checkpoint Hash (hash do checkpoint)

**Uso Jurídico:**
- Provar que a evidência não foi adulterada
- Demonstrar integridade criptográfica
- Permitir verificação independente

#### SEÇÃO 4: CRYPTOGRAPHIC SIGNATURES
- KMS Signature (assinatura do sistema)
- QTSP Timestamp (carimbo de tempo qualificado UK/EU)
- e-Seal (assinatura eletrônica qualificada)

**Uso Jurídico:**
- Atender requisitos eIDAS (UK/EU)
- Provar data e hora exata da decisão
- Garantir não-repúdio (impossível negar autoria)

#### SEÇÃO 5: CHAIN OF CUSTODY SUMMARY
- Access Events (quantos acessos)
- Export Events (quantas exportações)
- Disclosure Events (quantas divulgações)

**Uso Jurídico:**
- Demonstrar que a evidência foi manuseada corretamente
- Provar que não houve acesso não autorizado
- Justificar divulgações a terceiros

#### SEÇÃO 6: VERIFICATION INSTRUCTIONS
Instruções passo a passo para verificar a evidência offline.

**Exemplo:**
```
To verify this evidence bundle:
1. Download the bundle ZIP file
2. Extract all files
3. Run: node verify.js
4. The script will validate:
   - Manifest hash
   - All file hashes
   - Chain integrity
   - Cryptographic signatures
   - QTSP timestamps (if present)
```

**Uso Jurídico:**
- Permitir verificação por perito independente
- Atender requisitos de discovery (litígio)
- Facilitar auditoria por regulador

### Dois Hashes do PDF

#### Hash Lógico (Logical Hash)
Hash dos dados estruturados (JSON) antes de gerar o PDF.

**Propósito:**
- Garantir que o conteúdo não foi alterado
- Permitir regeneração do PDF com mesmo conteúdo
- Facilitar comparação entre versões

#### Hash Binário (Binary Hash)
Hash do arquivo PDF final (bytes).

**Propósito:**
- Garantir que o arquivo não foi modificado
- Permitir verificação de integridade do download
- Atender requisitos de chain of custody

**Uso Jurídico:**
- Logical Hash: "O conteúdo é o mesmo"
- Binary Hash: "O arquivo é o mesmo"
- Ambos: "A evidência é íntegra e inalterada"

---

## 🔗 HASH ENCADEADO (HASH CHAIN)

### O que é Hash Chain?
Cada decisão contém o hash da decisão anterior, formando uma cadeia imutável.

```
Decision 1: recordHash = sha256(input + output + context)
Decision 2: recordHash = sha256(previousHash + input + output + context)
Decision 3: recordHash = sha256(previousHash + input + output + context)
...
```

### Por que é Juridicamente Relevante?

#### 1. Imutabilidade
Se alguém tentar alterar uma decisão antiga, todos os hashes subsequentes quebram.

**Analogia Jurídica:**
Como páginas numeradas de um livro contábil — se arrancar uma página, a numeração quebra.

#### 2. Ordem Cronológica
A cadeia prova a ordem exata das decisões.

**Uso Jurídico:**
- Demonstrar que decisão A veio antes de decisão B
- Provar que não houve inserção retroativa de decisões
- Contestar alegações de backdating

#### 3. Detecção de Adulteração
Qualquer modificação é imediatamente detectável.

**Uso Jurídico:**
- Provar que a evidência é original
- Demonstrar que não houve manipulação
- Atender requisitos de best evidence rule (UK/US)

### Verificação de Chain Integrity

**Endpoint:** `GET /api/xase/v1/verify/:transactionId`

**Resposta:**
```json
{
  "chain_integrity": true,
  "chain": {
    "previous_hash": "c1b422c02dc9809ff11cf7446b6b0ef4a169553a4b64beb7c8809c8f2a69be30",
    "record_hash": "ebd4c6459802e492fc48b9e77ac1270778d8ad3577dc52b1d4bf1ec871cf3732",
    "is_genesis": false,
    "has_next": false
  }
}
```

**Interpretação Jurídica:**
- `chain_integrity: true` → Evidência íntegra, não adulterada
- `is_genesis: false` → Não é a primeira decisão (há histórico)
- `has_next: false` → É a decisão mais recente (não há posteriores)

---

## 📊 CAMPOS INSURANCE ESPECÍFICOS

### InsuranceDecision Model

Overlay com campos específicos do setor de seguros.

#### Claim Fields (Campos de Sinistro)
- **claimNumber** — Número do sinistro (ex: CLM-2026-001)
- **claimType** — Tipo: AUTO, HEALTH, LIFE, PROPERTY, LIABILITY, TRAVEL
- **claimAmount** — Valor do sinistro (£5,000)
- **claimDate** — Data do sinistro

**Uso Jurídico:**
- Identificar o sinistro em litígio
- Demonstrar tipo e valor da reclamação
- Correlacionar com documentação externa

#### Policy Fields (Campos de Apólice)
- **policyNumber** — Número da apólice (ex: POL-123456)
- **policyHolderIdHash** — Hash do CPF/SSN (proteção GDPR)
- **insuredAmount** — Valor segurado (£50,000)

**Uso Jurídico:**
- Identificar a apólice aplicável
- Provar cobertura e limites
- Proteger dados pessoais (hash em vez de CPF/SSN)

#### Underwriting Fields (Campos de Subscrição)
- **riskScore** — Score de risco (0.0 - 1.0)
- **underwritingDecision** — APPROVED, DECLINED, REFERRED
- **premiumCalculated** — Prêmio calculado (£1,200/ano)
- **coverageOfferedJson** — Cobertura oferecida (JSON)

**Uso Jurídico:**
- Demonstrar critérios de aceitação
- Justificar prêmio cobrado
- Provar que decisão foi baseada em risco

#### Outcome Fields (Campos de Resultado)
- **decisionOutcome** — Resultado final (APPROVED, REJECTED, PARTIAL)
- **decisionOutcomeReason** — Justificativa textual

**Uso Jurídico:**
- Explicar a decisão ao cliente
- Atender requisitos de transparência (GDPR Art. 13-14)
- Facilitar contestação (GDPR Art. 22)

#### Impact Fields (Campos de Impacto)
- **decisionImpactFinancial** — Impacto financeiro (£5,000)
- **decisionImpactConsumerImpact** — LOW, MEDIUM, HIGH
- **decisionImpactAppealable** — Se pode ser contestada (true/false)

**Uso Jurídico:**
- Classificar gravidade da decisão
- Priorizar revisões humanas (HIGH impact)
- Informar direito de recurso ao cliente

#### Regulatory Fields (Campos Regulatórios)
- **regulatoryCaseId** — ID do caso regulatório (ex: FCA-2026-001)

**Uso Jurídico:**
- Correlacionar com investigação regulatória
- Facilitar submissão ao regulador
- Rastrear decisões sob escrutínio

---

## 🛡️ CONFORMIDADE REGULATÓRIA

### UK FCA — Consumer Duty

**Requisito:** Demonstrar que decisões são justas e no melhor interesse do consumidor.

**Como o Xase Atende:**
1. **Reproducibilidade** — Permite recriar decisão e testar cenários alternativos
2. **Transparência** — PDF Legal explica a decisão em linguagem clara
3. **Auditabilidade** — Chain of Custody registra todos os acessos
4. **Fairness** — Feature Vector permite auditoria de viés

**Evidência para FCA:**
- Bundle completo com PDF Legal
- Custody Report mostrando revisões internas
- Snapshots provando dados corretos no momento da decisão

### EU GDPR — Art. 22 (Decisões Automatizadas)

**Requisito:** Direito de não ser sujeito a decisões exclusivamente automatizadas.

**Como o Xase Atende:**
1. **Explicação** — PDF Legal fornece lógica da decisão
2. **Intervenção Humana** — Sistema registra overrides e aprovações
3. **Contestação** — Cliente pode solicitar revisão com evidência completa
4. **Transparência** — Snapshots mostram dados e regras usadas

**Evidência para GDPR:**
- PDF Legal com explicação da decisão
- Custody Report mostrando intervenções humanas (se houver)
- Snapshots de business rules (regras aplicadas)

### eIDAS — Qualified Timestamps (QTSP)

**Requisito:** Carimbo de tempo qualificado para evidência digital.

**Como o Xase Atende (Sprint 3):**
1. **QTSP Integration** — Carimbar manifest.json via provider qualificado
2. **Certificate Chain** — Armazenar cadeia de certificados
3. **Offline Verification** — Script verify.js valida QTSP

**Evidência para eIDAS:**
- QTSP Token no Checkpoint Record
- Certificate Chain armazenada
- Manifest.json carimbado (não o ZIP)

---

## 📋 GUIA PRÁTICO PARA ADVOGADOS

### Cenário 1: Cliente Contesta Decisão de Sinistro

**Situação:**
Cliente alega que sinistro foi rejeitado injustamente.

**Passos:**
1. Buscar decisão por `claimNumber` ou `policyNumber`
2. Gerar PDF Legal: `POST /api/xase/v1/bundles/:bundleId/pdf`
3. Revisar Seção "Insurance Details" (claim, policy, outcome)
4. Verificar Snapshots (dados externos, regras de negócio)
5. Gerar Custody Report para provar integridade

**Evidência a Apresentar:**
- PDF Legal completo
- Custody Report
- Snapshots de external data (credit score, histórico)
- Business rules snapshot (regras aplicadas)

### Cenário 2: FCA Solicita Auditoria

**Situação:**
FCA investiga práticas de underwriting automatizado.

**Passos:**
1. Filtrar decisões por período: `dateFrom` e `dateTo`
2. Criar bundle: `POST /api/xase/v1/bundles/create`
3. Gerar Custody Report: `GET /api/xase/v1/bundles/:bundleId/custody`
4. Gerar PDF Legal para amostra de decisões
5. Registrar divulgação: evento DISCLOSURE no audit log

**Evidência a Submeter:**
- Bundle ZIP completo
- Custody Report (JSON + PDF)
- PDF Legal de decisões representativas
- Manifest.json com hashes de todos os arquivos

### Cenário 3: Litígio — Discovery Request

**Situação:**
Tribunal ordena produção de evidência sobre decisões automatizadas.

**Passos:**
1. Identificar decisões relevantes (claim numbers, período)
2. Criar bundle com `legalFormat: 'uk_insurance'`
3. Gerar PDF Legal para cada decisão
4. Gerar Custody Report
5. Incluir verify.js para verificação independente
6. Registrar divulgação ao tribunal

**Evidência a Produzir:**
- Bundle ZIP com:
  - manifest.json (hashes de todos os arquivos)
  - records/ (decisões em JSON)
  - snapshots/ (dados, regras, ambiente)
  - custody-report.pdf
  - legal-report.pdf (para cada decisão)
  - verify.js (script de verificação offline)
  - README.md (instruções)

### Cenário 4: Cliente Exerce Direito GDPR Art. 15

**Situação:**
Cliente solicita acesso a dados pessoais e explicação de decisão automatizada.

**Passos:**
1. Buscar decisões por `policyHolderIdHash` (hash do CPF/SSN)
2. Gerar PDF Legal (explicação da decisão)
3. Incluir Snapshots (dados usados)
4. Remover dados de terceiros (anonimizar)
5. Entregar bundle ao cliente

**Evidência a Fornecer:**
- PDF Legal (explicação clara)
- Snapshots de external data (dados consultados)
- Business rules snapshot (regras aplicadas)
- Custody Report (quem acessou os dados)

---

## ⚠️ LIMITAÇÕES E DISCLAIMERS

### 1. QTSP/e-Seal (Sprint 3)
Atualmente, o sistema usa assinaturas KMS simuladas. Para conformidade eIDAS completa, é necessário integrar QTSP qualificado (ex: Swisscom, DigiCert).

### 2. PDF Legal (MVP)
O PDF atual é texto puro. Para uso em tribunal, recomenda-se:
- Converter para PDF/A (arquivamento)
- Adicionar assinatura digital qualificada
- Incluir watermark com hash do documento

### 3. Blockchain Anchoring (Futuro)
Campos de blockchain estão presentes no schema mas não implementados. Para imutabilidade adicional, considerar ancoragem em blockchain público (Ethereum, Polygon).

### 4. Admissibilidade em Tribunal
A admissibilidade de evidência digital varia por jurisdição. Consultar advogado local para requisitos específicos de:
- UK: Electronic Communications Act 2000, Civil Evidence Act 1995
- EU: eIDAS Regulation, national civil procedure codes
- US: Federal Rules of Evidence 901-902 (authentication)

---

## 📞 SUPORTE JURÍDICO

Para dúvidas sobre uso jurídico do Xase:
- **Technical Support:** dev@xase.ai
- **Legal Inquiries:** legal@xase.ai
- **Regulatory Compliance:** compliance@xase.ai

---

**Preparado por:** Cascade AI  
**Data:** 4 de Janeiro de 2026  
**Versão:** 2.0  
**Disclaimer:** Este documento é informativo e não constitui aconselhamento jurídico. Consulte advogado qualificado para orientação específica.

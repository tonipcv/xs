# 🎯 Plano de Execução Q1 2026 - Xase.ai
## Sprint-by-Sprint Tactical Plan

**Período:** Janeiro - Março 2026  
**Objetivo:** Tornar Xase 100% compliance com EU AI Act High-Risk  
**Meta:** 3 features críticas entregues

---

## 📅 CRONOGRAMA EXECUTIVO

```
JAN 2026          FEV 2026          MAR 2026
├─ Sprint 1-2     ├─ Sprint 3-4     ├─ Sprint 5-6
│  High-Risk      │  Evidence Pack   │  Post-Market
│  Classification │  Generator       │  Monitoring
│                 │                  │
└─ 2 semanas      └─ 2 semanas      └─ 2 semanas
```

---

## 🚀 SPRINT 1-2: HIGH-RISK CLASSIFICATION ENGINE

### 📋 Objetivo
Implementar classificação automática de risco baseada no EU AI Act Anexo III

### 🎯 Entregáveis
1. ✅ Enum `RiskLevel` no Prisma
2. ✅ Campo `riskLevel` em `DecisionRecord`
3. ✅ Tabela `RiskClassification` com mapeamento Anexo III
4. ✅ API `/api/xase/v1/classify-risk`
5. ✅ UI de classificação manual
6. ✅ Sugestão automática baseada em `decisionType`
7. ✅ Documentação completa

### 📐 Arquitetura Técnica

#### 1. Database Schema (Prisma)
```prisma
// Adicionar ao schema.prisma

enum RiskLevel {
  UNACCEPTABLE  // Art. 5 - Proibido
  HIGH          // Anexo III - Alto risco
  LIMITED       // Art. 52 - Transparência
  MINIMAL       // Livre
  
  @@map("xase_risk_level")
}

model RiskClassification {
  id                String    @id @default(cuid())
  tenantId          String    @map("tenant_id")
  
  // Identificação
  classificationId  String    @unique @map("classification_id")
  name              String    // Ex: "Credit Scoring System"
  description       String?   @db.Text
  
  // Classificação
  riskLevel         RiskLevel @map("risk_level")
  annexIIICategory  String?   @map("annexiii_category") // Ex: "8. Credit scoring"
  justification     String    @db.Text // Obrigatório
  
  // Domínio
  domain            String    // FINANCE, HEALTH, BIOMETRIC, EDUCATION, etc
  useCase           String    // Ex: "loan_approval", "fraud_detection"
  
  // Metadata
  regulatoryBasis   String?   @db.Text @map("regulatory_basis")
  assessmentDate    DateTime  @default(now()) @map("assessment_date")
  assessedBy        String?   @map("assessed_by")
  
  // Status
  isActive          Boolean   @default(true) @map("is_active")
  reviewDate        DateTime? @map("review_date")
  
  // Timestamps
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  
  // Relações
  tenant            Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([riskLevel])
  @@index([domain])
  @@index([useCase])
  @@map("xase_risk_classifications")
}

// Adicionar campo em DecisionRecord
model DecisionRecord {
  // ... campos existentes ...
  
  // Classificação de risco
  riskLevel              RiskLevel? @map("risk_level")
  riskClassificationId   String?    @map("risk_classification_id")
  
  // ... resto do modelo ...
}
```

#### 2. API Endpoint
```typescript
// src/app/api/xase/v1/classify-risk/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { validateApiKey } from '@/lib/xase/auth';
import { getTenantContext } from '@/lib/xase/server-auth';
import { requireTenant, requireRole } from '@/lib/xase/rbac';

const ClassificationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  domain: z.enum(['FINANCE', 'HEALTH', 'BIOMETRIC', 'EDUCATION', 'EMPLOYMENT', 'LAW_ENFORCEMENT', 'MIGRATION', 'JUSTICE', 'OTHER']),
  useCase: z.string(),
  riskLevel: z.enum(['UNACCEPTABLE', 'HIGH', 'LIMITED', 'MINIMAL']),
  annexIIICategory: z.string().optional(),
  justification: z.string().min(10),
  regulatoryBasis: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    // Auth
    const ctx = await getTenantContext();
    requireTenant(ctx);
    requireRole(ctx, ['OWNER', 'ADMIN']);
    
    // Validate
    const body = await request.json();
    const data = ClassificationSchema.parse(body);
    
    // Create
    const classification = await prisma.riskClassification.create({
      data: {
        tenantId: ctx.tenantId!,
        classificationId: `risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: data.name,
        description: data.description,
        domain: data.domain,
        useCase: data.useCase,
        riskLevel: data.riskLevel,
        annexIIICategory: data.annexIIICategory,
        justification: data.justification,
        regulatoryBasis: data.regulatoryBasis,
        assessedBy: ctx.userId,
      },
    });
    
    return NextResponse.json({
      success: true,
      classification_id: classification.classificationId,
      risk_level: classification.riskLevel,
    }, { status: 201 });
    
  } catch (error) {
    console.error('Error creating risk classification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantContext();
    requireTenant(ctx);
    
    const classifications = await prisma.riskClassification.findMany({
      where: { tenantId: ctx.tenantId!, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    
    return NextResponse.json({ classifications });
    
  } catch (error) {
    console.error('Error listing classifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

#### 3. Auto-Suggestion Logic
```typescript
// src/lib/xase/risk-classifier.ts

export interface RiskSuggestion {
  riskLevel: 'UNACCEPTABLE' | 'HIGH' | 'LIMITED' | 'MINIMAL';
  annexIIICategory?: string;
  confidence: number;
  reasoning: string;
}

// Mapeamento baseado no Anexo III do EU AI Act
const ANNEX_III_MAPPING: Record<string, RiskSuggestion> = {
  // 1. Biometric identification
  'biometric_identification': {
    riskLevel: 'HIGH',
    annexIIICategory: '1. Biometric identification and categorisation',
    confidence: 0.95,
    reasoning: 'Real-time remote biometric identification systems (Annex III, point 1)',
  },
  
  // 2. Critical infrastructure
  'infrastructure_safety': {
    riskLevel: 'HIGH',
    annexIIICategory: '2. Critical infrastructure',
    confidence: 0.90,
    reasoning: 'AI systems used as safety components in critical infrastructure (Annex III, point 2)',
  },
  
  // 3. Education and vocational training
  'education_assessment': {
    riskLevel: 'HIGH',
    annexIIICategory: '3. Education and vocational training',
    confidence: 0.85,
    reasoning: 'AI systems for educational assessment and admission (Annex III, point 3)',
  },
  
  // 4. Employment
  'recruitment': {
    riskLevel: 'HIGH',
    annexIIICategory: '4. Employment, workers management and access to self-employment',
    confidence: 0.90,
    reasoning: 'AI systems for recruitment and employment decisions (Annex III, point 4)',
  },
  
  // 5. Essential services
  'credit_scoring': {
    riskLevel: 'HIGH',
    annexIIICategory: '5. Access to essential private and public services',
    confidence: 0.95,
    reasoning: 'AI systems for creditworthiness assessment (Annex III, point 5b)',
  },
  'emergency_dispatch': {
    riskLevel: 'HIGH',
    annexIIICategory: '5. Access to essential private and public services',
    confidence: 0.95,
    reasoning: 'AI systems for emergency response dispatch (Annex III, point 5a)',
  },
  
  // 6. Law enforcement
  'law_enforcement': {
    riskLevel: 'HIGH',
    annexIIICategory: '6. Law enforcement',
    confidence: 0.95,
    reasoning: 'AI systems for law enforcement purposes (Annex III, point 6)',
  },
  
  // 7. Migration and border control
  'migration_assessment': {
    riskLevel: 'HIGH',
    annexIIICategory: '7. Migration, asylum and border control management',
    confidence: 0.95,
    reasoning: 'AI systems for migration and asylum decisions (Annex III, point 7)',
  },
  
  // 8. Justice
  'legal_decision': {
    riskLevel: 'HIGH',
    annexIIICategory: '8. Administration of justice and democratic processes',
    confidence: 0.95,
    reasoning: 'AI systems assisting judicial authorities (Annex III, point 8)',
  },
  
  // Limited risk (Art. 52)
  'chatbot': {
    riskLevel: 'LIMITED',
    confidence: 0.80,
    reasoning: 'AI systems that interact with humans (Art. 52 - transparency obligations)',
  },
  'emotion_recognition': {
    riskLevel: 'LIMITED',
    confidence: 0.85,
    reasoning: 'Emotion recognition systems (Art. 52 - transparency obligations)',
  },
  'deepfake': {
    riskLevel: 'LIMITED',
    confidence: 0.95,
    reasoning: 'Deep fake content generation (Art. 52 - transparency obligations)',
  },
  
  // Unacceptable risk (Art. 5)
  'social_scoring': {
    riskLevel: 'UNACCEPTABLE',
    confidence: 0.95,
    reasoning: 'Social scoring by public authorities (Art. 5 - prohibited)',
  },
  'subliminal_manipulation': {
    riskLevel: 'UNACCEPTABLE',
    confidence: 0.95,
    reasoning: 'Subliminal manipulation causing harm (Art. 5 - prohibited)',
  },
  
  // Minimal risk (default)
  'spam_filter': {
    riskLevel: 'MINIMAL',
    confidence: 0.70,
    reasoning: 'No specific high-risk characteristics identified',
  },
  'recommendation_system': {
    riskLevel: 'MINIMAL',
    confidence: 0.60,
    reasoning: 'General recommendation system without high-risk context',
  },
};

export function suggestRiskLevel(
  decisionType: string,
  domain?: string
): RiskSuggestion {
  // Exact match
  if (ANNEX_III_MAPPING[decisionType]) {
    return ANNEX_III_MAPPING[decisionType];
  }
  
  // Fuzzy match by keywords
  const lowerType = decisionType.toLowerCase();
  
  if (lowerType.includes('biometric') || lowerType.includes('facial') || lowerType.includes('fingerprint')) {
    return ANNEX_III_MAPPING['biometric_identification'];
  }
  
  if (lowerType.includes('credit') || lowerType.includes('loan') || lowerType.includes('mortgage')) {
    return ANNEX_III_MAPPING['credit_scoring'];
  }
  
  if (lowerType.includes('recruit') || lowerType.includes('hiring') || lowerType.includes('employment')) {
    return ANNEX_III_MAPPING['recruitment'];
  }
  
  if (lowerType.includes('education') || lowerType.includes('exam') || lowerType.includes('grade')) {
    return ANNEX_III_MAPPING['education_assessment'];
  }
  
  if (lowerType.includes('law') || lowerType.includes('police') || lowerType.includes('crime')) {
    return ANNEX_III_MAPPING['law_enforcement'];
  }
  
  if (lowerType.includes('migration') || lowerType.includes('visa') || lowerType.includes('asylum')) {
    return ANNEX_III_MAPPING['migration_assessment'];
  }
  
  if (lowerType.includes('judge') || lowerType.includes('court') || lowerType.includes('legal')) {
    return ANNEX_III_MAPPING['legal_decision'];
  }
  
  if (lowerType.includes('chatbot') || lowerType.includes('assistant') || lowerType.includes('conversational')) {
    return ANNEX_III_MAPPING['chatbot'];
  }
  
  // Domain-based fallback
  if (domain === 'FINANCE') {
    return {
      riskLevel: 'HIGH',
      annexIIICategory: '5. Access to essential private and public services',
      confidence: 0.60,
      reasoning: 'Financial domain typically involves high-risk decisions',
    };
  }
  
  if (domain === 'HEALTH') {
    return {
      riskLevel: 'HIGH',
      annexIIICategory: '2. Critical infrastructure',
      confidence: 0.60,
      reasoning: 'Healthcare domain typically involves high-risk decisions',
    };
  }
  
  // Default: minimal risk
  return {
    riskLevel: 'MINIMAL',
    confidence: 0.50,
    reasoning: 'No high-risk characteristics identified. Manual review recommended.',
  };
}
```

#### 4. UI Component
```typescript
// src/app/xase/risk-classification/page.tsx

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function RiskClassificationPage() {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    domain: 'OTHER',
    useCase: '',
    riskLevel: 'MINIMAL',
    justification: '',
  });
  
  const [suggestion, setSuggestion] = useState<any>(null);
  
  const handleSuggest = async () => {
    const res = await fetch('/api/xase/v1/suggest-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decisionType: formData.useCase,
        domain: formData.domain,
      }),
    });
    const data = await res.json();
    setSuggestion(data);
    setFormData(prev => ({
      ...prev,
      riskLevel: data.riskLevel,
      justification: data.reasoning,
    }));
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/xase/v1/classify-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    if (res.ok) {
      alert('Classification created successfully!');
      // Reset form
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Risk Classification</h1>
      
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">System Name</label>
            <Input
              value={formData.name}
              onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., Credit Scoring System"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Domain</label>
            <Select
              value={formData.domain}
              onChange={e => setFormData(prev => ({ ...prev, domain: e.target.value }))}
            >
              <option value="FINANCE">Finance</option>
              <option value="HEALTH">Health</option>
              <option value="BIOMETRIC">Biometric</option>
              <option value="EDUCATION">Education</option>
              <option value="EMPLOYMENT">Employment</option>
              <option value="LAW_ENFORCEMENT">Law Enforcement</option>
              <option value="MIGRATION">Migration</option>
              <option value="JUSTICE">Justice</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Use Case</label>
            <Input
              value={formData.useCase}
              onChange={e => setFormData(prev => ({ ...prev, useCase: e.target.value }))}
              placeholder="e.g., credit_scoring, loan_approval"
              required
            />
            <Button type="button" onClick={handleSuggest} className="mt-2">
              Suggest Risk Level
            </Button>
          </div>
          
          {suggestion && (
            <Card className="p-4 bg-blue-50">
              <h3 className="font-semibold mb-2">AI Suggestion</h3>
              <div className="space-y-2">
                <div>
                  <Badge>{suggestion.riskLevel}</Badge>
                  <span className="ml-2 text-sm">Confidence: {(suggestion.confidence * 100).toFixed(0)}%</span>
                </div>
                {suggestion.annexIIICategory && (
                  <p className="text-sm"><strong>Annex III:</strong> {suggestion.annexIIICategory}</p>
                )}
                <p className="text-sm">{suggestion.reasoning}</p>
              </div>
            </Card>
          )}
          
          <div>
            <label className="block text-sm font-medium mb-2">Risk Level</label>
            <Select
              value={formData.riskLevel}
              onChange={e => setFormData(prev => ({ ...prev, riskLevel: e.target.value }))}
              required
            >
              <option value="UNACCEPTABLE">Unacceptable (Prohibited)</option>
              <option value="HIGH">High Risk (Annex III)</option>
              <option value="LIMITED">Limited Risk (Transparency)</option>
              <option value="MINIMAL">Minimal Risk</option>
            </Select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Justification (Required)</label>
            <Textarea
              value={formData.justification}
              onChange={e => setFormData(prev => ({ ...prev, justification: e.target.value }))}
              rows={4}
              placeholder="Explain why this risk level is appropriate..."
              required
            />
          </div>
          
          <Button type="submit" className="w-full">
            Create Classification
          </Button>
        </form>
      </Card>
    </div>
  );
}
```

### ✅ Definition of Done
- [ ] Prisma migration executada
- [ ] API testada com Postman/curl
- [ ] UI funcional e responsiva
- [ ] Testes unitários (>80% coverage)
- [ ] Documentação atualizada
- [ ] Code review aprovado
- [ ] Deploy em staging

### 📊 Métricas de Sucesso
- Tempo de classificação < 30 segundos
- Sugestão automática com >70% de precisão
- 100% das classificações com justificativa

---

## 🚀 SPRINT 3-4: EU AI ACT EVIDENCE PACK GENERATOR

### 📋 Objetivo
Gerar pacote de evidências completo no formato EU AI Act

### 🎯 Entregáveis
1. ✅ Geração de ZIP com estrutura padronizada
2. ✅ Template PDF de relatório
3. ✅ Inclusão de decisões, intervenções, model cards
4. ✅ Assinatura digital do bundle (KMS mock)
5. ✅ Manifest.json com metadados
6. ✅ Download seguro com expiração
7. ✅ UI de criação de bundle

### 📐 Estrutura do Evidence Pack

```
evidence_pack_bundle_abc123.zip
├── manifest.json                    # Metadados do pacote
├── report.pdf                       # Relatório executivo
├── decisions/
│   ├── decision_txn_001.json       # Decisão individual
│   ├── decision_txn_002.json
│   └── ...
├── interventions/
│   ├── intervention_001.json       # Intervenção humana
│   └── ...
├── model_cards/
│   ├── model_credit_v1.json        # Model card
│   └── ...
├── checkpoints/
│   ├── checkpoint_001.json         # Checkpoint de integridade
│   └── ...
├── policies/
│   ├── policy_credit_v1.json       # Política versionada
│   └── ...
└── signatures/
    ├── bundle.sig                   # Assinatura digital
    └── certificate.pem              # Certificado público
```

### 📄 manifest.json Schema
```json
{
  "bundle_id": "bundle_abc123",
  "bundle_version": "1.0",
  "generated_at": "2026-01-15T10:30:00Z",
  "tenant_id": "tenant_xyz",
  "tenant_name": "Acme Corp",
  "purpose": "AUDIT",
  "description": "Q4 2025 compliance audit",
  "period": {
    "from": "2025-10-01T00:00:00Z",
    "to": "2025-12-31T23:59:59Z"
  },
  "contents": {
    "decisions": 1523,
    "interventions": 42,
    "model_cards": 3,
    "checkpoints": 12,
    "policies": 2
  },
  "integrity": {
    "bundle_hash": "sha256:abc123...",
    "signature_algorithm": "RSA-SHA256",
    "signed_by": "Xase KMS",
    "signed_at": "2026-01-15T10:30:00Z"
  },
  "compliance": {
    "eu_ai_act_version": "2024-06-13",
    "articles_covered": ["Art. 9", "Art. 10", "Art. 11", "Art. 13", "Art. 14", "Art. 15"],
    "risk_level": "HIGH",
    "annex_iii_category": "5. Access to essential private and public services"
  },
  "metadata": {
    "format_version": "1.0",
    "generator": "Xase Evidence Pack Generator v1.0",
    "retention_until": "2032-01-15T00:00:00Z"
  }
}
```

### 🔧 Implementation

```typescript
// src/lib/xase/evidence-pack-generator.ts

import JSZip from 'jszip';
import { prisma } from '@/lib/prisma';
import { generatePDF } from '@/lib/xase/pdf-generator';
import { signData } from '@/lib/xase/kms';
import { hashObject } from '@/lib/xase/crypto';

export interface EvidencePackOptions {
  bundleId: string;
  tenantId: string;
  dateFrom?: Date;
  dateTo?: Date;
  purpose: string;
  description?: string;
}

export async function generateEvidencePack(options: EvidencePackOptions): Promise<Buffer> {
  const zip = new JSZip();
  
  // 1. Fetch data
  const [decisions, interventions, modelCards, checkpoints, policies] = await Promise.all([
    fetchDecisions(options),
    fetchInterventions(options),
    fetchModelCards(options),
    fetchCheckpoints(options),
    fetchPolicies(options),
  ]);
  
  // 2. Add decisions
  const decisionsFolder = zip.folder('decisions')!;
  for (const decision of decisions) {
    decisionsFolder.file(
      `decision_${decision.transactionId}.json`,
      JSON.stringify(decision, null, 2)
    );
  }
  
  // 3. Add interventions
  const interventionsFolder = zip.folder('interventions')!;
  for (const intervention of interventions) {
    interventionsFolder.file(
      `intervention_${intervention.id}.json`,
      JSON.stringify(intervention, null, 2)
    );
  }
  
  // 4. Add model cards
  const modelCardsFolder = zip.folder('model_cards')!;
  for (const card of modelCards) {
    modelCardsFolder.file(
      `model_${card.modelId}_${card.modelVersion}.json`,
      JSON.stringify(card, null, 2)
    );
  }
  
  // 5. Add checkpoints
  const checkpointsFolder = zip.folder('checkpoints')!;
  for (const checkpoint of checkpoints) {
    checkpointsFolder.file(
      `checkpoint_${checkpoint.checkpointNumber}.json`,
      JSON.stringify(checkpoint, null, 2)
    );
  }
  
  // 6. Add policies
  const policiesFolder = zip.folder('policies')!;
  for (const policy of policies) {
    policiesFolder.file(
      `policy_${policy.policyId}_${policy.version}.json`,
      JSON.stringify(policy, null, 2)
    );
  }
  
  // 7. Generate PDF report
  const pdfBuffer = await generatePDF({
    bundleId: options.bundleId,
    tenant: await prisma.tenant.findUnique({ where: { id: options.tenantId } }),
    decisions,
    interventions,
    modelCards,
    checkpoints,
    policies,
  });
  zip.file('report.pdf', pdfBuffer);
  
  // 8. Create manifest
  const manifest = {
    bundle_id: options.bundleId,
    bundle_version: '1.0',
    generated_at: new Date().toISOString(),
    tenant_id: options.tenantId,
    purpose: options.purpose,
    description: options.description,
    period: {
      from: options.dateFrom?.toISOString(),
      to: options.dateTo?.toISOString(),
    },
    contents: {
      decisions: decisions.length,
      interventions: interventions.length,
      model_cards: modelCards.length,
      checkpoints: checkpoints.length,
      policies: policies.length,
    },
    compliance: {
      eu_ai_act_version: '2024-06-13',
      articles_covered: ['Art. 9', 'Art. 10', 'Art. 11', 'Art. 13', 'Art. 14', 'Art. 15'],
    },
  };
  
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  // 9. Generate ZIP
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  
  // 10. Sign bundle (mock for now)
  const bundleHash = hashObject(zipBuffer);
  const signature = await signData(bundleHash);
  
  const signaturesFolder = zip.folder('signatures')!;
  signaturesFolder.file('bundle.sig', signature);
  
  // 11. Regenerate with signature
  return await zip.generateAsync({ type: 'nodebuffer' });
}
```

### ✅ Definition of Done
- [ ] ZIP gerado com estrutura correta
- [ ] PDF report com logo e formatação
- [ ] Assinatura digital (mock) incluída
- [ ] Upload para S3/R2 funcional
- [ ] Download com URL assinada
- [ ] UI de criação e download
- [ ] Testes end-to-end

---

## 🚀 SPRINT 5-6: POST-MARKET MONITORING MODULE

### 📋 Objetivo
Implementar monitoramento contínuo pós-implantação (Art. 61)

### 🎯 Entregáveis
1. ✅ Tabela `MonitoringRule` para regras
2. ✅ Detecção de desvios (drift, performance)
3. ✅ Workflow de incident flags
4. ✅ Relatórios periódicos automáticos
5. ✅ Integração com Alert system
6. ✅ Dashboard de monitoramento
7. ✅ Notificações (email/webhook)

### 📐 Database Schema

```prisma
model MonitoringRule {
  id                String    @id @default(cuid())
  tenantId          String    @map("tenant_id")
  
  // Identificação
  ruleName          String    @map("rule_name")
  ruleType          String    @map("rule_type") // DRIFT, PERFORMANCE, VOLUME, INTERVENTION_RATE
  description       String?   @db.Text
  
  // Escopo
  modelId           String?   @map("model_id")
  policyId          String?   @map("policy_id")
  decisionType      String?   @map("decision_type")
  riskLevel         RiskLevel? @map("risk_level")
  
  // Condições
  metricName        String    @map("metric_name")
  operator          String    // GT, LT, GTE, LTE, EQ
  thresholdValue    Float     @map("threshold_value")
  timeWindowMinutes Int       @map("time_window_minutes")
  
  // Ações
  severity          String    // LOW, MEDIUM, HIGH, CRITICAL
  actionType        String    @map("action_type") // ALERT, FLAG_INCIDENT, NOTIFY_AUTHORITY
  notificationChannels String? @db.Text @map("notification_channels")
  
  // Status
  isActive          Boolean   @default(true) @map("is_active")
  lastTriggeredAt   DateTime? @map("last_triggered_at")
  triggerCount      Int       @default(0) @map("trigger_count")
  
  // Timestamps
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")
  
  // Relações
  tenant            Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([isActive])
  @@index([ruleType])
  @@map("xase_monitoring_rules")
}

model PeriodicReport {
  id              String    @id @default(cuid())
  tenantId        String    @map("tenant_id")
  
  // Identificação
  reportId        String    @unique @map("report_id")
  reportType      String    @map("report_type") // DAILY, WEEKLY, MONTHLY, QUARTERLY
  
  // Período
  periodStart     DateTime  @map("period_start")
  periodEnd       DateTime  @map("period_end")
  
  // Conteúdo
  summary         String    @db.Text
  metrics         String    @db.Text // JSON
  incidents       String?   @db.Text // JSON
  recommendations String?   @db.Text
  
  // Storage
  storageUrl      String?   @map("storage_url")
  reportHash      String?   @map("report_hash")
  
  // Status
  status          String    @default("PENDING") // PENDING, GENERATED, SENT
  sentAt          DateTime? @map("sent_at")
  
  // Timestamps
  createdAt       DateTime  @default(now()) @map("created_at")
  
  // Relações
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId])
  @@index([reportType])
  @@index([periodStart, periodEnd])
  @@map("xase_periodic_reports")
}
```

### 🔧 Monitoring Engine

```typescript
// src/lib/xase/monitoring-engine.ts

export async function evaluateMonitoringRules(tenantId: string): Promise<void> {
  const rules = await prisma.monitoringRule.findMany({
    where: { tenantId, isActive: true },
  });
  
  for (const rule of rules) {
    try {
      const triggered = await evaluateRule(rule);
      
      if (triggered) {
        await handleRuleTrigger(rule);
      }
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
    }
  }
}

async function evaluateRule(rule: MonitoringRule): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - rule.timeWindowMinutes * 60 * 1000);
  
  // Build where clause
  const where: any = {
    tenantId: rule.tenantId,
    timestamp: { gte: windowStart, lte: now },
  };
  
  if (rule.modelId) where.modelId = rule.modelId;
  if (rule.policyId) where.policyId = rule.policyId;
  if (rule.decisionType) where.decisionType = rule.decisionType;
  
  // Calculate metric
  let metricValue: number;
  
  switch (rule.metricName) {
    case 'override_rate':
      const total = await prisma.decisionRecord.count({ where });
      const overrides = await prisma.humanIntervention.count({
        where: {
          tenantId: rule.tenantId,
          action: 'OVERRIDE',
          timestamp: { gte: windowStart, lte: now },
        },
      });
      metricValue = total > 0 ? (overrides / total) * 100 : 0;
      break;
      
    case 'avg_confidence':
      const result = await prisma.decisionRecord.aggregate({
        where,
        _avg: { confidence: true },
      });
      metricValue = result._avg.confidence || 0;
      break;
      
    case 'decision_volume':
      metricValue = await prisma.decisionRecord.count({ where });
      break;
      
    default:
      console.warn(`Unknown metric: ${rule.metricName}`);
      return false;
  }
  
  // Evaluate condition
  switch (rule.operator) {
    case 'GT': return metricValue > rule.thresholdValue;
    case 'LT': return metricValue < rule.thresholdValue;
    case 'GTE': return metricValue >= rule.thresholdValue;
    case 'LTE': return metricValue <= rule.thresholdValue;
    case 'EQ': return metricValue === rule.thresholdValue;
    default: return false;
  }
}

async function handleRuleTrigger(rule: MonitoringRule): Promise<void> {
  // Update trigger count
  await prisma.monitoringRule.update({
    where: { id: rule.id },
    data: {
      lastTriggeredAt: new Date(),
      triggerCount: { increment: 1 },
    },
  });
  
  // Create alert
  await prisma.alert.create({
    data: {
      tenantId: rule.tenantId,
      alertType: rule.ruleType,
      severity: rule.severity,
      title: `Monitoring rule triggered: ${rule.ruleName}`,
      message: `Rule "${rule.ruleName}" has been triggered. Threshold: ${rule.thresholdValue}, Operator: ${rule.operator}`,
      metricName: rule.metricName,
      resourceType: 'MONITORING_RULE',
      resourceId: rule.id,
    },
  });
  
  // Flag incident if critical
  if (rule.severity === 'CRITICAL' && rule.actionType === 'FLAG_INCIDENT') {
    // TODO: Create incident record
  }
  
  // Send notifications
  if (rule.notificationChannels) {
    // TODO: Send email/webhook
  }
}
```

### ✅ Definition of Done
- [ ] Monitoring rules funcionais
- [ ] Cron job executando a cada 5 minutos
- [ ] Alertas criados automaticamente
- [ ] Dashboard de monitoramento
- [ ] Relatórios periódicos gerados
- [ ] Notificações enviadas
- [ ] Documentação completa

---

## 📊 RECURSOS NECESSÁRIOS

### Time
- **1 Senior Backend Engineer** (full-time)
- **1 Frontend Engineer** (full-time)
- **1 DevOps Engineer** (part-time, 50%)
- **1 Product Manager** (part-time, 25%)

### Infraestrutura
- **Staging Environment** (AWS/GCP)
- **S3/R2 Bucket** para storage
- **KMS** (AWS KMS ou similar)
- **Monitoring** (Sentry, Datadog)

### Ferramentas
- **Jira/Linear** para gestão
- **Figma** para UI/UX
- **Postman** para testes de API
- **Playwright** para testes E2E

---

## 🎯 MÉTRICAS DE SUCESSO Q1 2026

### Técnicas
- [ ] 3 features entregues no prazo
- [ ] 0 bugs críticos em produção
- [ ] >90% test coverage
- [ ] <200ms latência de API

### Negócio
- [ ] 5 beta testers confirmados
- [ ] 2 clientes pagantes (early adopters)
- [ ] $50k MRR ao final de Q1
- [ ] 1 case study publicado

### Compliance
- [ ] 100% Art. 9-15 implementados
- [ ] 1 auditoria interna aprovada
- [ ] Documentação legal revisada

---

## 📅 MILESTONES

| Data | Milestone | Entregável |
|------|-----------|------------|
| 15 Jan | Sprint 1 Complete | High-Risk Classification (Backend) |
| 31 Jan | Sprint 2 Complete | High-Risk Classification (UI) |
| 15 Fev | Sprint 3 Complete | Evidence Pack Generator (Backend) |
| 28 Fev | Sprint 4 Complete | Evidence Pack Generator (UI) |
| 15 Mar | Sprint 5 Complete | Post-Market Monitoring (Backend) |
| 31 Mar | Sprint 6 Complete | Post-Market Monitoring (UI) |
| 31 Mar | **Q1 2026 Complete** | **3 Features Críticas Entregues** |

---

## 🚨 RISCOS & MITIGAÇÕES

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Atraso em Sprint 1 | 🟡 MÉDIA | 🔴 ALTO | Buffer de 1 semana, daily standups |
| KMS complexidade subestimada | 🟠 ALTA | 🟡 MÉDIO | Usar mock em Q1, implementar real em Q2 |
| Falta de beta testers | 🟡 MÉDIA | 🟠 MÉDIO | Outreach proativo, incentivos |
| Mudança de prioridades | 🟡 MÉDIA | 🟠 MÉDIO | Roadmap aprovado por C-level |

---

## ✅ CHECKLIST SEMANAL

### Semana 1-2 (Sprint 1)
- [ ] Kickoff meeting com time
- [ ] Prisma migration criada
- [ ] API `/classify-risk` implementada
- [ ] Testes unitários escritos
- [ ] Code review

### Semana 3-4 (Sprint 2)
- [ ] UI de classificação implementada
- [ ] Integração frontend-backend
- [ ] Testes E2E
- [ ] Deploy em staging
- [ ] Demo para stakeholders

### Semana 5-6 (Sprint 3)
- [ ] Evidence pack generator implementado
- [ ] PDF template criado
- [ ] S3 integration configurada
- [ ] Testes de geração de ZIP

### Semana 7-8 (Sprint 4)
- [ ] UI de criação de bundle
- [ ] Download seguro implementado
- [ ] Testes de integridade
- [ ] Documentação atualizada

### Semana 9-10 (Sprint 5)
- [ ] Monitoring engine implementado
- [ ] Cron job configurado
- [ ] Alertas integrados
- [ ] Testes de regras

### Semana 11-12 (Sprint 6)
- [ ] Dashboard de monitoramento
- [ ] Relatórios periódicos
- [ ] Notificações configuradas
- [ ] **Q1 2026 COMPLETE!**

---

**Documento preparado por:** Cascade AI  
**Data:** Dezembro 2025  
**Próxima revisão:** Semanalmente durante Q1 2026

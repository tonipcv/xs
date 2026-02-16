# PLANO DE AÇÃO - XASE UX & PERFORMANCE
## Objetivo: Atingir Score 9/10 em UX e Performance

**Status Atual:** Performance 7/10 (Sidecar ✅ corrigido) | UX 6/10
**Meta:** Performance 9.5/10 | UX 9/10

---

## 🚀 FASE 1: QUICK WINS (Semana 1-2) - PRIORIDADE MÁXIMA

### ✅ Sidecar Rust - JÁ CORRIGIDO
- Cache Arc<Vec<u8>> implementado
- RwLock/DashMap para concorrência
- Watermark no prefetch
- **Throughput: 3-10 GB/s alcançado**

### 🔥 CRÍTICO 1: Lease 72h + Auto-renew (2 dias)
**Problema:** Max TTL = 8h, treinos longos em H100 falham
**Impacto:** Perde clientes enterprise

**Implementação:**
1. Atualizar schema Prisma - `Lease.ttlSeconds` max 259200 (72h)
2. Adicionar campos `autoRenew`, `maxRenewals`, `budgetLimit`
3. Background job para auto-renovação 30min antes de expirar
4. API endpoint `PATCH /api/v1/leases/:id/extend`

**Arquivos:**
- `prisma/schema.prisma`
- `src/app/api/v1/leases/route.ts`
- `src/lib/jobs/lease-auto-renew.ts` (novo)

---

### 🔥 CRÍTICO 2: SDK Auto-recovery (2 dias)
**Problema:** Socket crash mata training job
**Impacto:** Frustração, perda de tempo de GPU

**Implementação:**
```python
# packages/sdk-py/src/xase/sidecar/dataset.py
class SidecarDataset(IterableDataset):
    def __init__(self, ..., max_retries=3, backoff_base=2):
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        
    def __iter__(self):
        for segment_id in self.segment_ids:
            for attempt in range(self.max_retries):
                try:
                    data = self._read_from_socket(segment_id)
                    yield data
                    break
                except (ConnectionError, TimeoutError, BrokenPipeError) as e:
                    if attempt < self.max_retries - 1:
                        wait = self.backoff_base ** attempt
                        logger.warning(f"Socket error, retry {attempt+1}/{self.max_retries} in {wait}s")
                        time.sleep(wait)
                        self._reconnect()
                    else:
                        logger.error(f"Failed after {self.max_retries} retries")
                        raise
```

**Arquivos:**
- `packages/sdk-py/src/xase/sidecar/dataset.py`
- `packages/sdk-py/src/xase/sidecar/connection.py` (novo)

---

### 🔥 CRÍTICO 3: Alertas de Lease (1 dia)
**Problema:** Sem avisos de expiração, surpresas
**Impacto:** Perda de dados, frustração

**Implementação:**
1. Background job verifica leases expirando em 30min/5min
2. Enviar notificações via:
   - Email (Resend/SendGrid)
   - Push notification (OneSignal já configurado)
   - Webhook para sistema do cliente

**Arquivos:**
- `src/lib/jobs/lease-expiry-alerts.ts` (novo)
- `src/lib/notifications/email.ts`
- `src/lib/notifications/push.ts`

---

### 🎯 CRÍTICO 4: Analytics com Gráficos (3 dias)
**Problema:** Só números pontuais, sem tendências
**Impacto:** AI Holder não vê valor, churn

**Implementação:**
```typescript
// src/components/xase/analytics/RevenueChart.tsx
import { Line } from 'react-chartjs-2'

export function RevenueChart({ data }: { data: RevenueData[] }) {
  const chartData = {
    labels: data.map(d => d.date),
    datasets: [{
      label: 'Revenue',
      data: data.map(d => d.amount),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1
    }]
  }
  
  return <Line data={chartData} options={{
    responsive: true,
    plugins: {
      title: { display: true, text: 'Revenue Trend (30 days)' }
    }
  }} />
}
```

**Componentes:**
- Revenue Chart (line) - 30 dias
- Top Clients (bar chart)
- Usage Heatmap (hora do dia)
- Dataset Performance (pie chart)

**Arquivos:**
- `src/components/xase/analytics/RevenueChart.tsx` (novo)
- `src/components/xase/analytics/TopClientsChart.tsx` (novo)
- `src/components/xase/analytics/UsageHeatmap.tsx` (novo)
- `src/app/xase/ai-holder/analytics/page.tsx` (atualizar)

---

### 🎯 CRÍTICO 5: Unificar Policy + Offer → Access Plan (3 dias)
**Problema:** Confusão total entre Policy e Offer
**Impacto:** Abandono no onboarding

**Implementação:**
1. Criar novo conceito "Access Plan" que unifica ambos
2. Wizard de 3 passos:
   - Step 1: Basic Info (nome, dataset, descrição)
   - Step 2: Pricing (templates: Starter/Pro/Enterprise)
   - Step 3: Constraints (TTL, horas, regras de acesso)
3. Preview lateral em tempo real

**Arquivos:**
- `src/components/xase/access-plan/AccessPlanWizard.tsx` (novo)
- `src/components/xase/access-plan/PricingTemplates.tsx` (novo)
- `src/components/xase/access-plan/LivePreview.tsx` (novo)
- `src/app/xase/ai-holder/access-plans/new/page.tsx` (novo)

---

## 📊 FASE 2: UX INTELLIGENCE (Semana 3-4)

### AI Lab Improvements

#### 6. Real-time Training Dashboard (3 dias)
**Componentes:**
- Throughput gauge (MB/s)
- Cache hit rate (%)
- GPU utilization (%)
- Cost tracker ($X/$Y budget)
- Lease countdown timer

**Arquivos:**
- `src/components/xase/training/TrainingDashboard.tsx` (novo)
- `src/app/xase/ai-lab/training/[sessionId]/page.tsx` (novo)

#### 7. Cost Estimator Pre-Lease (2 dias)
**Features:**
- Calcular custo baseado em: dataset size, epochs, GPU type
- Mostrar breakdown: data lease + GPU cost
- Comparar opções de pricing

**Arquivos:**
- `src/components/xase/marketplace/CostEstimator.tsx` (novo)
- `src/lib/xase/cost-calculator.ts` (novo)

#### 8. HuggingFace Trainer Integration (3 dias)
```python
# packages/sdk-py/src/xase/integrations/huggingface.py
from datasets import IterableDataset as HFIterableDataset
from xase.sidecar import SidecarDataset

class XaseAudioDataset(HFIterableDataset):
    def __init__(self, api_key, dataset_id, socket_path, **kwargs):
        self._xase_dataset = SidecarDataset(
            api_key=api_key,
            dataset_id=dataset_id,
            socket_path=socket_path
        )
        super().__init__(**kwargs)
    
    def __iter__(self):
        for audio_bytes in self._xase_dataset:
            # Converter para formato HF
            yield {
                "audio": audio_bytes,
                "sampling_rate": 16000,
            }

# Uso:
from transformers import Trainer
from xase.integrations.huggingface import XaseAudioDataset

dataset = XaseAudioDataset(
    api_key="xase_pk_...",
    dataset_id="ds_...",
    socket_path="/var/run/xase/sidecar.sock"
)

trainer = Trainer(
    model=model,
    train_dataset=dataset,
    # Funciona nativamente!
)
```

**Arquivos:**
- `packages/sdk-py/src/xase/integrations/huggingface.py` (novo)
- `packages/sdk-py/examples/huggingface_trainer.py` (novo)

---

### AI Holder Improvements

#### 9. Preview de Audio no Dataset (2 dias)
**Features:**
- Player inline com waveform
- Metadados: duração, SNR, formato
- Paginação para grandes datasets

**Arquivos:**
- `src/components/xase/dataset/AudioPreview.tsx` (novo)
- `src/components/xase/dataset/WaveformVisualizer.tsx` (novo)

#### 10. Calculadora de Receita (1 dia)
**Features:**
- "Se 10 labs comprarem: $X/mês"
- Projeção baseada em pricing e demanda
- Comparação com market data

**Arquivos:**
- `src/components/xase/pricing/RevenueCalculator.tsx` (novo)

---

## 🎨 FASE 3: DIFERENCIAIS ÚNICOS (Mês 2-3)

### 11. Watermark Verification no SDK (2 dias)
```python
# packages/sdk-py/src/xase/sidecar/dataset.py
class SidecarDataset(IterableDataset):
    def __iter__(self):
        for segment_id in self.segment_ids:
            audio_bytes = self._read_from_socket(segment_id)
            
            # Verificar watermark
            is_watermarked = self._verify_watermark(audio_bytes)
            contract_id = self._extract_contract_id(audio_bytes)
            
            yield {
                "audio": audio_bytes,
                "is_watermarked": is_watermarked,
                "contract_id": contract_id,
                "segment_id": segment_id
            }
```

### 12. Evidence Snapshots por Epoch (2 dias)
```python
# packages/sdk-py/src/xase/evidence.py
def snapshot_evidence(session_id: str, epoch: int) -> EvidenceSnapshot:
    """Criar snapshot de evidência após cada epoch"""
    return {
        "session_id": session_id,
        "epoch": epoch,
        "merkle_root": "0x3a7f...",
        "segments_accessed": 1234,
        "cost_so_far": 234.50,
        "timestamp": datetime.now()
    }
```

### 13. Compliance Report Generator (3 dias)
**Features:**
- Templates: GDPR, SOC 2, HIPAA, Custom
- Export: PDF, JSON
- Dados: sessions, suppliers, watermarks, violations

**Arquivos:**
- `src/components/xase/compliance/ReportGenerator.tsx` (novo)
- `src/lib/xase/compliance/report-builder.ts` (novo)

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Semana 1-2 (Quick Wins)
- [ ] Lease 72h + auto-renew (backend + API)
- [ ] SDK auto-recovery (Python)
- [ ] Alertas de lease (email + push)
- [ ] Analytics com gráficos (React + Chart.js)
- [ ] Unificar Policy/Offer → Access Plan

### Semana 3-4 (UX Intelligence)
- [ ] Real-time training dashboard
- [ ] Cost estimator pre-lease
- [ ] HuggingFace Trainer integration
- [ ] Preview de audio no dataset
- [ ] Calculadora de receita

### Mês 2-3 (Diferenciais)
- [ ] Watermark verification SDK
- [ ] Evidence snapshots por epoch
- [ ] Compliance report generator
- [ ] Multi-dataset federation
- [ ] One-click Sidecar deploy

---

## 🎯 MÉTRICAS DE SUCESSO

### Performance
- ✅ Sidecar throughput: 3-10 GB/s (alcançado)
- [ ] GPU utilization: >95% durante treino
- [ ] Cache hit rate: >90%
- [ ] Latência socket: <1ms

### UX AI Holder
- [ ] Onboarding completion: >80%
- [ ] Time to first offer: <15min
- [ ] Analytics engagement: >60% weekly
- [ ] Churn rate: <5% monthly

### UX AI Lab
- [ ] Lease success rate: >95%
- [ ] Training job completion: >90%
- [ ] Time to first training: <30min
- [ ] SDK adoption: >70% use SidecarDataset

### Business
- [ ] Revenue per holder: >$500/month
- [ ] Active labs: >50
- [ ] Dataset catalog: >100
- [ ] NPS Score: >50

---

## 🚀 PRÓXIMOS PASSOS IMEDIATOS

1. **HOJE:** Começar implementação Lease 72h + auto-renew
2. **Amanhã:** SDK auto-recovery + testes
3. **Dia 3-4:** Analytics com gráficos
4. **Dia 5-7:** Unificar Policy/Offer + Alertas

**Objetivo:** Ter os 5 quick wins implementados em 7 dias.

---

*Plano criado: 16/02/2026*
*Baseado em: XASE_UX_PERFORMANCE_ANALYSIS.md*

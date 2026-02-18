# Clinical Data Governance - Exemplos de Uso

## 🎯 Configuração Rápida

### 1. Audio Pipeline - Mascaramento de Voz

```bash
# Configurar variáveis de ambiente
export DATA_PIPELINE=audio
export AUDIO_F0_SHIFT_SEMITONES=2.0      # Aumenta pitch em 2 semitons
export AUDIO_ENABLE_DIARIZATION=true     # Identifica speakers
export AUDIO_ENABLE_REDACTION=true       # Remove PHI do áudio
export CONTRACT_ID=hospital_xyz_2024
export XASE_API_KEY=your_api_key
export LEASE_ID=lease_123
export BUCKET_NAME=medical-audio-bucket
export BUCKET_PREFIX=consultations/

# Executar sidecar
./target/release/xase-sidecar
```

**O que acontece:**
1. Áudio é baixado do S3
2. Pitch é alterado (+2 semitons) para mascarar biometria vocal
3. Diarização identifica quem está falando (SPEAKER_00, SPEAKER_01, etc)
4. Transcrição + NER detecta nomes/CPFs e silencia essas regiões
5. Watermark é aplicado para proveniência
6. Áudio processado é servido via Unix socket

**Exemplo de uso no Python:**
```python
import socket
import struct

def get_audio_segment(segment_id):
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect('/var/run/xase/sidecar.sock')
    
    # Enviar segment_id
    seg_bytes = segment_id.encode('utf-8')
    sock.sendall(struct.pack('>I', len(seg_bytes)))
    sock.sendall(seg_bytes)
    
    # Receber áudio processado
    length = struct.unpack('>I', sock.recv(4))[0]
    audio_data = sock.recv(length)
    
    sock.close()
    return audio_data

# Obter áudio com F0 shift + redação aplicados
audio = get_audio_segment('seg_00001')
with open('processed_audio.wav', 'wb') as f:
    f.write(audio)
```

### 2. DICOM Pipeline - Imagens Médicas

```bash
# Configurar variáveis de ambiente
export DATA_PIPELINE=dicom
export DICOM_STRIP_TAGS=PatientName,PatientID,InstitutionName,ReferringPhysicianName
export DICOM_ENABLE_OCR=true             # Remove texto queimado na imagem
export DICOM_ENABLE_NIFTI=false          # Manter formato DICOM
export CONTRACT_ID=radiology_dept_2024
export XASE_API_KEY=your_api_key
export LEASE_ID=lease_456
export BUCKET_NAME=medical-imaging-bucket
export BUCKET_PREFIX=xrays/

# Build com features DICOM completas
cargo build --release --features dicom-full

# Executar
./target/release/xase-sidecar
```

**O que acontece:**
1. DICOM é baixado do S3
2. Tags PHI são removidas (PatientName, PatientID, etc)
3. OCR detecta texto queimado na imagem (ex: "John Doe" em ultrassom)
4. Regiões com texto são preenchidas com preto
5. DICOM de-identificado é servido

**Exemplo de conversão para NIfTI:**
```bash
# Para pesquisa/IA, converter para NIfTI
export DICOM_ENABLE_NIFTI=true

# Agora o sidecar retorna arquivos .nii em vez de DICOM
# Útil para pipelines de deep learning
```

### 3. FHIR Pipeline - Dados Estruturados

```bash
# Configurar variáveis de ambiente
export DATA_PIPELINE=fhir
export FHIR_REDACT_PATHS=$.patient,$.identifier,$.name
export FHIR_DATE_SHIFT_DAYS=30           # Shift datas em 30 dias
export FHIR_ENABLE_NLP=true              # Redactar narrativas
export CONTRACT_ID=ehr_system_2024
export XASE_API_KEY=your_api_key
export LEASE_ID=lease_789
export BUCKET_NAME=medical-records-bucket
export BUCKET_PREFIX=fhir/

# Executar
./target/release/xase-sidecar
```

**O que acontece:**
1. JSON FHIR é baixado do S3
2. Chaves especificadas são removidas ($.patient, $.identifier)
3. Todas as datas são shiftadas +30 dias (preserva ordem temporal)
4. Texto narrativo é processado com NLP para remover nomes/emails/telefones
5. FHIR de-identificado é servido

**Exemplo FHIR antes:**
```json
{
  "resourceType": "Patient",
  "birthDate": "1980-05-15",
  "identifier": [{"value": "12345"}],
  "text": {
    "div": "Patient: john.doe@hospital.com, Phone: 555-1234"
  }
}
```

**Exemplo FHIR depois:**
```json
{
  "resourceType": "Patient",
  "birthDate": "1980-06-14",
  "text": {
    "div": "Patient: [REDACTED_EMAIL], Phone: [REDACTED_PHONE]"
  }
}
```

### 4. HL7 v2.x Pipeline - Mensagens Hospitalares

```bash
# Mesma configuração do FHIR
export DATA_PIPELINE=fhir  # Auto-detecta HL7 vs FHIR
export FHIR_DATE_SHIFT_DAYS=30
export BUCKET_PREFIX=hl7/

# Executar
./target/release/xase-sidecar
```

**O que acontece:**
1. Mensagem HL7 é baixada do S3
2. Sidecar detecta formato HL7 (começa com MSH|)
3. Segmento PID é processado:
   - PatientID redactado
   - PatientName redactado
   - DOB shiftado +30 dias
4. Mensagem HL7 de-identificada é servida

**Exemplo HL7 antes:**
```
PID|1|12345|67890|DOE^JOHN^A|19800515|M|
```

**Exemplo HL7 depois:**
```
PID|1|[REDACTED]|[REDACTED]|[REDACTED]|19800614|M|
```

## 🔧 Configurações Avançadas

### Múltiplos Pipelines (Multi-Tenant)

```bash
# Instância 1: Audio
export DATA_PIPELINE=audio
export SOCKET_PATH=/var/run/xase/audio.sock
./xase-sidecar &

# Instância 2: DICOM
export DATA_PIPELINE=dicom
export SOCKET_PATH=/var/run/xase/dicom.sock
./xase-sidecar &

# Instância 3: FHIR
export DATA_PIPELINE=fhir
export SOCKET_PATH=/var/run/xase/fhir.sock
./xase-sidecar &
```

### Telemetria e Monitoramento

```bash
# Telemetria é enviada a cada 10s para XASE_BASE_URL/api/v1/sidecar/telemetry
export XASE_BASE_URL=https://xase.ai

# Métricas incluem:
# - processed_bytes: Total processado
# - redactions: Total de redações
# - cache_hit_rate: Taxa de acerto do cache
# - cache_entries: Número de itens em cache
```

### Cache Tuning

```bash
# Aumentar cache para datasets grandes
export CACHE_SIZE_GB=500

# Cache usa DashMap (lock-free) para alta concorrência
# Prefetch automático mantém cache quente
```

## 🧪 Testes Locais

### Testar Audio Pipeline

```bash
cd sidecar

# Criar WAV de teste
python3 << EOF
import wave
import struct
import math

with wave.open('test_audio.wav', 'w') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(16000)
    for i in range(16000):  # 1 segundo
        sample = int(math.sin(i * 440 * 2 * math.pi / 16000) * 10000)
        wav.writeframes(struct.pack('<h', sample))
EOF

# Testar F0 shift
cargo test test_audio_f0_shift -- --nocapture

# Testar pipeline completo
cargo test test_audio_pipeline_full_processing -- --nocapture
```

### Testar FHIR Pipeline

```bash
# Usar fixture de teste
cargo test test_fhir_date_shifting -- --nocapture
cargo test test_fhir_nlp_redaction -- --nocapture

# Testar com arquivo real
cat tests/fixtures/sample_fhir.json | \
  cargo run --bin fhir_processor -- --date-shift 30 --nlp
```

### Testar HL7 Pipeline

```bash
# Usar fixture de teste
cargo test test_hl7v2_deidentification -- --nocapture

# Testar com arquivo real
cat tests/fixtures/sample_hl7.txt | \
  cargo run --bin hl7_processor -- --date-shift 30
```

## 📊 Métricas e Compliance

### Verificar Métricas

```bash
# Métricas são expostas via telemetria
# Acessar via API:
curl -H "X-API-Key: $XASE_API_KEY" \
  https://xase.ai/api/v1/sidecar/telemetry?sessionId=SESSION_ID

# Resposta:
{
  "processed_bytes": 1234567890,
  "redactions": 42,
  "cache_hit_rate": 0.85,
  "uptime_seconds": 3600
}
```

### Compliance Checks

```bash
# HIPAA Safe Harbor: Verificar que todas as 18 identifiers foram removidas
cargo test test_hipaa_safe_harbor_compliance

# LGPD Saúde: Verificar consent tracking
curl -H "X-API-Key: $XASE_API_KEY" \
  https://xase.ai/api/v1/compliance/lgpd/health-consent?datasetId=DATASET_ID
```

## 🚀 Deploy em Produção

### Docker

```dockerfile
FROM rust:1.75 as builder
WORKDIR /app
COPY sidecar/ .
RUN cargo build --release --features dicom-full,audio-full,nlp-full

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates
COPY --from=builder /app/target/release/xase-sidecar /usr/local/bin/
CMD ["xase-sidecar"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xase-sidecar-audio
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: sidecar
        image: xase/sidecar:latest
        env:
        - name: DATA_PIPELINE
          value: "audio"
        - name: AUDIO_F0_SHIFT_SEMITONES
          value: "2.0"
        - name: AUDIO_ENABLE_DIARIZATION
          value: "true"
        volumeMounts:
        - name: socket
          mountPath: /var/run/xase
      volumes:
      - name: socket
        emptyDir: {}
```

## 📝 Troubleshooting

### Pipeline não processa

```bash
# Verificar logs
tail -f /var/log/xase-sidecar.log

# Verificar configuração
env | grep -E '(DATA_PIPELINE|AUDIO|DICOM|FHIR)'

# Testar conectividade S3
aws s3 ls s3://$BUCKET_NAME/$BUCKET_PREFIX
```

### Performance baixa

```bash
# Aumentar cache
export CACHE_SIZE_GB=1000

# Aumentar workers de prefetch (código)
# Editar prefetch.rs: handles.len() < 32 (padrão: 16)

# Verificar cache hit rate
# Deve ser > 80% em produção
```

### Erros de feature

```bash
# Se erro "feature not enabled"
# Rebuild com features necessárias:
cargo build --release --features dicom-full,audio-full,nlp-full
```

## ✅ Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Features corretas compiladas
- [ ] S3 bucket acessível
- [ ] Unix socket path tem permissões corretas
- [ ] Telemetria funcionando
- [ ] Cache size adequado para workload
- [ ] Métricas sendo coletadas
- [ ] Compliance verificado (HIPAA/LGPD)
- [ ] Testes de integração passando
- [ ] Monitoring/alerting configurado

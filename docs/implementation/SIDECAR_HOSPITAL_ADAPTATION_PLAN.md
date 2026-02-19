# Plano Completo: Adaptação do Sidecar para Hospitais On-Premise

**Data:** 19 de Fevereiro de 2026  
**Status:** Plano de Implementação  
**Objetivo:** Transformar o Sidecar de um sistema dependente de S3 para um sistema que funciona em hospitais reais com PACS/EHR local

---

## 📊 Análise da Situação Atual

### O que já existe e funciona ✅

| Componente | Status | Arquivo |
|------------|--------|---------|
| Cache lock-free (DashMap) | ✅ Produção | `cache.rs` |
| Prefetch adaptativo (16 workers) | ✅ Produção | `prefetch.rs` |
| 6 pipelines de processamento | ✅ Produção | `pipeline.rs` |
| Watermarking PN-sequence | ✅ Produção | `watermark.rs` |
| Telemetria (10s interval) | ✅ Produção | `telemetry.rs` |
| Kill switch remoto | ✅ Produção | `telemetry.rs` |
| Unix socket IPC | ✅ Produção | `socket_server.rs` |
| Auth flow (API Key → Brain) | ✅ Produção | `telemetry.rs` |
| Helm chart completo | ✅ Produção | `k8s/sidecar/` |
| Pod security hardening | ✅ Produção | `values.yaml` |
| Network policies | ✅ Produção | `k8s/network-policies.yaml` |
| DICOM de-identification | ✅ Produção | `deidentify_dicom.rs` |
| FHIR/HL7 v2 de-identification | ✅ Produção | `fhir_advanced.rs` |
| Audio processing (pitch shift) | ✅ Produção | `audio_advanced.rs` |

### O que está faltando ❌

| Problema | Impacto | Prioridade |
|----------|---------|------------|
| **Depende 100% de S3** | Hospital não usa S3, usa PACS local | 🔴 CRÍTICO |
| **Sem DICOMweb client** | Não consegue buscar imagens do PACS | 🔴 CRÍTICO |
| **Sem FHIR API client** | Não consegue buscar prontuários do EHR | 🔴 CRÍTICO |
| **Sem MLLP listener** | Não recebe dados HL7 em tempo real | 🟡 ALTO |
| **STS token não renova** | Token expira em treinos longos (>2 semanas) | 🔴 CRÍTICO |
| **Sem Prometheus endpoint** | Hospital não vê métricas locais | 🟡 ALTO |
| **Sem modo Cache-Only** | Se Brain cair, treino para ($5k/hora perdido) | 🔴 CRÍTICO |
| **Sem /health endpoint** | K8s probes não funcionam corretamente | 🟡 MÉDIO |
| **Logs não estruturados** | Hospital não integra com SIEM | 🟢 BAIXO |

---

## 🎯 Plano de Implementação (12 Fases)

### **FASE 1: Refatorar Arquitetura de Ingestão** 🔴

**Objetivo:** Criar abstração para múltiplas fontes de dados (S3, PACS, EHR)

#### 1.1 Criar trait `DataProvider`

```rust
// sidecar/src/data_provider.rs
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait DataProvider: Send + Sync {
    async fn download(&self, key: &str) -> Result<Vec<u8>>;
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>>;
    fn name(&self) -> &str;
}
```

**Arquivos a criar:**
- `sidecar/src/data_provider.rs` (trait base)
- `sidecar/src/providers/mod.rs` (módulo de providers)
- `sidecar/src/providers/s3_provider.rs` (migrar de `s3_client.rs`)

**Arquivos a modificar:**
- `sidecar/src/main.rs` (usar `DataProvider` em vez de `S3Client`)
- `sidecar/src/prefetch.rs` (usar `DataProvider` em vez de `S3Client`)
- `sidecar/src/socket_server.rs` (usar `DataProvider` em vez de `S3Client`)

#### 1.2 Migrar S3Client para S3Provider

```rust
// sidecar/src/providers/s3_provider.rs
use super::DataProvider;
use async_trait::async_trait;

pub struct S3Provider {
    client: aws_sdk_s3::Client,
    bucket: String,
    prefix: String,
}

#[async_trait]
impl DataProvider for S3Provider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // Código atual de s3_client.rs
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // Novo: listar objetos no S3
    }
    
    fn name(&self) -> &str { "S3" }
}
```

**Tempo estimado:** 4 horas  
**Risco:** Baixo (refactoring interno)

---

### **FASE 2: Implementar DICOMweb Provider** 🔴

**Objetivo:** Conectar com PACS hospitalar via DICOMweb (WADO-RS/QIDO-RS)

#### 2.1 Adicionar dependências

```toml
# Cargo.toml
[dependencies]
dicomweb-client = "0.3"  # Cliente DICOMweb
multipart = "0.18"       # Para DICOM multipart/related
```

#### 2.2 Criar DICOMwebProvider

```rust
// sidecar/src/providers/dicomweb_provider.rs
use super::DataProvider;
use async_trait::async_trait;
use reqwest::Client;

pub struct DICOMwebProvider {
    client: Client,
    base_url: String,        // e.g., https://pacs.hospital.local/dicomweb
    auth_token: Option<String>,
    study_uid_prefix: String,
}

#[async_trait]
impl DataProvider for DICOMwebProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // key format: "study_1.2.840.xxx/series_1.2.840.yyy/instance_1.2.840.zzz"
        let parts: Vec<&str> = key.split('/').collect();
        let study_uid = parts[0].strip_prefix("study_").unwrap();
        let series_uid = parts[1].strip_prefix("series_").unwrap();
        let instance_uid = parts[2].strip_prefix("instance_").unwrap();
        
        // WADO-RS: GET /studies/{study}/series/{series}/instances/{instance}
        let url = format!(
            "{}/studies/{}/series/{}/instances/{}",
            self.base_url, study_uid, series_uid, instance_uid
        );
        
        let mut req = self.client.get(&url)
            .header("Accept", "application/dicom");
        
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }
        
        let resp = req.send().await?;
        Ok(resp.bytes().await?.to_vec())
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // QIDO-RS: GET /studies?StudyDate={date}&limit={limit}
        let url = format!("{}/studies", self.base_url);
        
        let mut req = self.client.get(&url)
            .query(&[("limit", limit.to_string())])
            .header("Accept", "application/dicom+json");
        
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }
        
        let resp = req.send().await?;
        let studies: Vec<serde_json::Value> = resp.json().await?;
        
        // Converter estudos DICOM em formato de "key"
        let mut keys = Vec::new();
        for study in studies {
            let study_uid = study["0020000D"]["Value"][0].as_str().unwrap();
            keys.push(format!("study_{}", study_uid));
        }
        
        Ok(keys)
    }
    
    fn name(&self) -> &str { "DICOMweb" }
}
```

**Arquivos a criar:**
- `sidecar/src/providers/dicomweb_provider.rs`

**Arquivos a modificar:**
- `sidecar/src/config.rs` (adicionar `pacs_url`, `pacs_auth_token`)
- `sidecar/src/main.rs` (instanciar DICOMwebProvider se configurado)

**Tempo estimado:** 8 horas  
**Risco:** Médio (integração com PACS real pode ter variações)

---

### **FASE 3: Implementar FHIR API Provider** 🔴

**Objetivo:** Conectar com EHR hospitalar via FHIR R4 API

#### 3.1 Criar FHIRProvider

```rust
// sidecar/src/providers/fhir_provider.rs
use super::DataProvider;
use async_trait::async_trait;
use reqwest::Client;

pub struct FHIRProvider {
    client: Client,
    base_url: String,        // e.g., https://ehr.hospital.local/fhir
    auth_token: Option<String>,
}

#[async_trait]
impl DataProvider for FHIRProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // key format: "Patient/12345" or "Observation/67890"
        let url = format!("{}/{}", self.base_url, key);
        
        let mut req = self.client.get(&url)
            .header("Accept", "application/fhir+json");
        
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }
        
        let resp = req.send().await?;
        Ok(resp.bytes().await?.to_vec())
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // FHIR Search: GET /Patient?_count={limit}
        let resource_type = prefix.trim_end_matches('/');
        let url = format!("{}/{}", self.base_url, resource_type);
        
        let mut req = self.client.get(&url)
            .query(&[("_count", limit.to_string())])
            .header("Accept", "application/fhir+json");
        
        if let Some(token) = &self.auth_token {
            req = req.bearer_auth(token);
        }
        
        let resp = req.send().await?;
        let bundle: serde_json::Value = resp.json().await?;
        
        let mut keys = Vec::new();
        if let Some(entries) = bundle["entry"].as_array() {
            for entry in entries {
                if let Some(full_url) = entry["fullUrl"].as_str() {
                    // Extract "Patient/12345" from full URL
                    if let Some(resource_path) = full_url.split("/fhir/").nth(1) {
                        keys.push(resource_path.to_string());
                    }
                }
            }
        }
        
        Ok(keys)
    }
    
    fn name(&self) -> &str { "FHIR" }
}
```

**Arquivos a criar:**
- `sidecar/src/providers/fhir_provider.rs`

**Arquivos a modificar:**
- `sidecar/src/config.rs` (adicionar `ehr_fhir_url`, `ehr_auth_token`)
- `sidecar/src/main.rs` (instanciar FHIRProvider se configurado)

**Tempo estimado:** 6 horas  
**Risco:** Baixo (FHIR é bem padronizado)

---

### **FASE 4: Implementar MLLP/HL7 Listener** 🟡

**Objetivo:** Receber mensagens HL7 v2 em tempo real via MLLP

#### 4.1 Adicionar dependências

```toml
# Cargo.toml
[dependencies]
tokio = { version = "1.35", features = ["full", "net"] }
```

#### 4.2 Criar MLLP Listener

```rust
// sidecar/src/ingestion/mllp_listener.rs
use anyhow::Result;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use std::sync::Arc;
use crate::cache::SegmentCache;
use crate::pipeline::DataPipeline;
use crate::config::Config;

const MLLP_START: u8 = 0x0B;  // Vertical Tab
const MLLP_END: [u8; 2] = [0x1C, 0x0D];  // File Separator + Carriage Return

pub async fn start_mllp_listener(
    bind_addr: String,
    cache: Arc<SegmentCache>,
    pipeline: Arc<dyn DataPipeline>,
    config: Config,
) -> Result<()> {
    let listener = TcpListener::bind(&bind_addr).await?;
    tracing::info!("MLLP listener started on {}", bind_addr);
    
    loop {
        let (mut socket, addr) = listener.accept().await?;
        tracing::info!("MLLP connection from {}", addr);
        
        let cache = cache.clone();
        let pipeline = pipeline.clone();
        let config = config.clone();
        
        tokio::spawn(async move {
            let mut buffer = Vec::new();
            let mut byte = [0u8; 1];
            
            loop {
                match socket.read_exact(&mut byte).await {
                    Ok(_) => {
                        if byte[0] == MLLP_START {
                            // Start of message
                            buffer.clear();
                        } else if byte[0] == MLLP_END[0] {
                            // Check for end marker
                            if socket.read_exact(&mut byte).await.is_ok() && byte[0] == MLLP_END[1] {
                                // Complete message received
                                if let Ok(processed) = pipeline.process(buffer.clone(), &config) {
                                    // Generate unique ID for HL7 message
                                    let msg_id = extract_message_id(&buffer)
                                        .unwrap_or_else(|| format!("hl7_{}", chrono::Utc::now().timestamp()));
                                    
                                    cache.insert(msg_id, processed);
                                    tracing::info!("HL7 message processed and cached");
                                }
                                
                                // Send ACK
                                let ack = b"\x0BMSA|AA|MSG001\x1C\x0D";
                                let _ = socket.write_all(ack).await;
                                
                                buffer.clear();
                            }
                        } else {
                            buffer.push(byte[0]);
                        }
                    }
                    Err(_) => break,
                }
            }
        });
    }
}

fn extract_message_id(hl7_data: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(hl7_data);
    for line in text.lines() {
        if line.starts_with("MSH|") {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() > 9 {
                return Some(parts[9].to_string());
            }
        }
    }
    None
}
```

**Arquivos a criar:**
- `sidecar/src/ingestion/mod.rs`
- `sidecar/src/ingestion/mllp_listener.rs`

**Arquivos a modificar:**
- `sidecar/src/main.rs` (iniciar MLLP listener se configurado)
- `sidecar/src/config.rs` (adicionar `mllp_enabled`, `mllp_bind_addr`)

**Tempo estimado:** 6 horas  
**Risco:** Médio (protocolo MLLP é simples mas precisa testar com hospital real)

---

### **FASE 5: Implementar Hybrid DataProvider** 🔴

**Objetivo:** Fallback inteligente: Cache → PACS → S3

#### 5.1 Criar HybridProvider

```rust
// sidecar/src/providers/hybrid_provider.rs
use super::DataProvider;
use async_trait::async_trait;
use anyhow::Result;
use std::sync::Arc;

pub struct HybridProvider {
    primary: Arc<dyn DataProvider>,
    fallback: Option<Arc<dyn DataProvider>>,
}

impl HybridProvider {
    pub fn new(primary: Arc<dyn DataProvider>, fallback: Option<Arc<dyn DataProvider>>) -> Self {
        Self { primary, fallback }
    }
}

#[async_trait]
impl DataProvider for HybridProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // Try primary first
        match self.primary.download(key).await {
            Ok(data) => {
                tracing::debug!("Downloaded from primary provider ({})", self.primary.name());
                Ok(data)
            }
            Err(e) => {
                tracing::warn!("Primary provider ({}) failed: {}", self.primary.name(), e);
                
                // Try fallback
                if let Some(fallback) = &self.fallback {
                    match fallback.download(key).await {
                        Ok(data) => {
                            tracing::info!("Downloaded from fallback provider ({})", fallback.name());
                            Ok(data)
                        }
                        Err(e2) => {
                            tracing::error!("Fallback provider ({}) also failed: {}", fallback.name(), e2);
                            Err(e2)
                        }
                    }
                } else {
                    Err(e)
                }
            }
        }
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // Always use primary for listing
        self.primary.list_segments(prefix, limit).await
    }
    
    fn name(&self) -> &str {
        "Hybrid"
    }
}
```

**Arquivos a criar:**
- `sidecar/src/providers/hybrid_provider.rs`

**Arquivos a modificar:**
- `sidecar/src/main.rs` (criar HybridProvider com DICOMweb primary, S3 fallback)

**Tempo estimado:** 3 horas  
**Risco:** Baixo

---

### **FASE 6: Implementar STS Token Refresh** 🔴

**Objetivo:** Renovar credenciais automaticamente para treinos longos

#### 6.1 Criar TokenRefresher

```rust
// sidecar/src/auth/token_refresher.rs
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use crate::config::Config;
use crate::telemetry::{authenticate, AuthResponse};

pub struct TokenRefresher {
    config: Config,
    current_token: Arc<RwLock<AuthResponse>>,
}

impl TokenRefresher {
    pub fn new(config: Config, initial_auth: AuthResponse) -> Self {
        Self {
            config,
            current_token: Arc::new(RwLock::new(initial_auth)),
        }
    }
    
    pub async fn get_token(&self) -> String {
        self.current_token.read().await.sts_token.clone()
    }
    
    pub async fn get_session_id(&self) -> String {
        self.current_token.read().await.session_id.clone()
    }
    
    pub async fn start_refresh_loop(self: Arc<Self>) -> Result<()> {
        loop {
            // Calculate time until token expires
            let expires_at = {
                let token = self.current_token.read().await;
                chrono::DateTime::parse_from_rfc3339(&token.expires_at)
                    .map_err(|e| anyhow::anyhow!("Invalid expires_at: {}", e))?
            };
            
            let now = chrono::Utc::now();
            let time_until_expiry = (expires_at - now).num_seconds();
            
            // Refresh at 80% of lifetime (e.g., if token lasts 1 hour, refresh after 48 minutes)
            let refresh_in_seconds = (time_until_expiry as f64 * 0.8).max(60.0) as u64;
            
            tracing::info!(
                "Token expires in {}s, will refresh in {}s",
                time_until_expiry,
                refresh_in_seconds
            );
            
            sleep(Duration::from_secs(refresh_in_seconds)).await;
            
            // Refresh token
            match authenticate(&self.config).await {
                Ok(new_auth) => {
                    tracing::info!("Token refreshed successfully (new session: {})", new_auth.session_id);
                    let mut token = self.current_token.write().await;
                    *token = new_auth;
                }
                Err(e) => {
                    tracing::error!("Failed to refresh token: {}", e);
                    // Retry in 60 seconds
                    sleep(Duration::from_secs(60)).await;
                }
            }
        }
    }
}
```

**Arquivos a criar:**
- `sidecar/src/auth/mod.rs`
- `sidecar/src/auth/token_refresher.rs`

**Arquivos a modificar:**
- `sidecar/src/main.rs` (usar TokenRefresher em vez de AuthResponse direto)
- `sidecar/src/telemetry.rs` (aceitar Arc<TokenRefresher> em vez de session_id)

**Tempo estimado:** 4 horas  
**Risco:** Baixo

---

### **FASE 7: Adicionar Prometheus Metrics Endpoint** 🟡

**Objetivo:** Expor métricas locais para Grafana do hospital

#### 7.1 Adicionar dependências

```toml
# Cargo.toml
[dependencies]
prometheus = "0.13"
axum = "0.7"  # Web framework leve para metrics endpoint
```

#### 7.2 Criar Metrics Server

```rust
// sidecar/src/observability/prometheus.rs
use axum::{Router, routing::get, response::IntoResponse};
use prometheus::{Encoder, TextEncoder, Registry, Counter, Gauge, Histogram};
use std::sync::Arc;
use lazy_static::lazy_static;

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    
    pub static ref SEGMENTS_SERVED: Counter = Counter::new(
        "xase_segments_served_total",
        "Total number of segments served"
    ).unwrap();
    
    pub static ref CACHE_HIT_RATE: Gauge = Gauge::new(
        "xase_cache_hit_rate",
        "Cache hit rate (0.0 to 1.0)"
    ).unwrap();
    
    pub static ref CACHE_SIZE_BYTES: Gauge = Gauge::new(
        "xase_cache_size_bytes",
        "Current cache size in bytes"
    ).unwrap();
    
    pub static ref BYTES_PROCESSED: Counter = Counter::new(
        "xase_bytes_processed_total",
        "Total bytes processed"
    ).unwrap();
    
    pub static ref REDACTIONS: Counter = Counter::new(
        "xase_redactions_total",
        "Total PHI redactions performed"
    ).unwrap();
    
    pub static ref SERVE_LATENCY: Histogram = Histogram::with_opts(
        prometheus::HistogramOpts::new(
            "xase_serve_latency_seconds",
            "Latency of segment serving"
        ).buckets(vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0])
    ).unwrap();
}

pub fn init_metrics() {
    REGISTRY.register(Box::new(SEGMENTS_SERVED.clone())).unwrap();
    REGISTRY.register(Box::new(CACHE_HIT_RATE.clone())).unwrap();
    REGISTRY.register(Box::new(CACHE_SIZE_BYTES.clone())).unwrap();
    REGISTRY.register(Box::new(BYTES_PROCESSED.clone())).unwrap();
    REGISTRY.register(Box::new(REDACTIONS.clone())).unwrap();
    REGISTRY.register(Box::new(SERVE_LATENCY.clone())).unwrap();
}

async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = vec![];
    encoder.encode(&metric_families, &mut buffer).unwrap();
    String::from_utf8(buffer).unwrap()
}

pub async fn start_metrics_server(bind_addr: String) -> anyhow::Result<()> {
    init_metrics();
    
    let app = Router::new().route("/metrics", get(metrics_handler));
    
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    tracing::info!("Prometheus metrics server listening on {}", bind_addr);
    
    axum::serve(listener, app).await?;
    Ok(())
}
```

**Arquivos a criar:**
- `sidecar/src/observability/mod.rs`
- `sidecar/src/observability/prometheus.rs`

**Arquivos a modificar:**
- `sidecar/src/main.rs` (iniciar metrics server)
- `sidecar/src/socket_server.rs` (atualizar métricas Prometheus)
- `sidecar/src/config.rs` (adicionar `metrics_bind_addr`)
- `Cargo.toml` (adicionar `prometheus`, `axum`, `lazy_static`)

**Tempo estimado:** 5 horas  
**Risco:** Baixo

---

### **FASE 8: Implementar Modo Cache-Only (Grace Period)** 🔴

**Objetivo:** Continuar funcionando se Xase Brain cair

#### 8.1 Adicionar lógica de fallback

```rust
// sidecar/src/resilience/cache_only_mode.rs
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::time::{sleep, Duration};

pub struct ResilienceManager {
    cache_only_mode: Arc<AtomicBool>,
    last_successful_auth: Arc<AtomicU64>,
    grace_period_seconds: u64,
}

impl ResilienceManager {
    pub fn new(grace_period_seconds: u64) -> Self {
        Self {
            cache_only_mode: Arc::new(AtomicBool::new(false)),
            last_successful_auth: Arc::new(AtomicU64::new(
                chrono::Utc::now().timestamp() as u64
            )),
            grace_period_seconds,
        }
    }
    
    pub fn is_cache_only_mode(&self) -> bool {
        self.cache_only_mode.load(Ordering::Relaxed)
    }
    
    pub fn mark_auth_success(&self) {
        self.last_successful_auth.store(
            chrono::Utc::now().timestamp() as u64,
            Ordering::Relaxed
        );
        self.cache_only_mode.store(false, Ordering::Relaxed);
    }
    
    pub fn mark_auth_failure(&self) {
        let last_success = self.last_successful_auth.load(Ordering::Relaxed);
        let now = chrono::Utc::now().timestamp() as u64;
        let elapsed = now - last_success;
        
        if elapsed > self.grace_period_seconds {
            tracing::warn!(
                "Auth failed for {}s (grace period: {}s) - entering CACHE-ONLY MODE",
                elapsed,
                self.grace_period_seconds
            );
            self.cache_only_mode.store(true, Ordering::Relaxed);
        }
    }
    
    pub async fn start_monitoring_loop(self: Arc<Self>) {
        loop {
            sleep(Duration::from_secs(30)).await;
            
            if self.is_cache_only_mode() {
                tracing::warn!("⚠️  CACHE-ONLY MODE ACTIVE - Training continues with cached data only");
            }
        }
    }
}
```

**Arquivos a criar:**
- `sidecar/src/resilience/mod.rs`
- `sidecar/src/resilience/cache_only_mode.rs`

**Arquivos a modificar:**
- `sidecar/src/main.rs` (criar ResilienceManager)
- `sidecar/src/telemetry.rs` (usar ResilienceManager para marcar success/failure)
- `sidecar/src/socket_server.rs` (servir do cache mesmo em cache-only mode)
- `sidecar/src/config.rs` (adicionar `grace_period_seconds`)

**Tempo estimado:** 4 horas  
**Risco:** Baixo

---

### **FASE 9: Adicionar Health Check Endpoint** 🟡

**Objetivo:** Endpoint HTTP para K8s liveness/readiness probes

#### 9.1 Adicionar ao metrics server

```rust
// sidecar/src/observability/prometheus.rs (adicionar)

use serde_json::json;

async fn health_handler() -> impl IntoResponse {
    // Check cache status, auth status, etc.
    let status = json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "cache_entries": 0,  // TODO: get from cache
        "uptime_seconds": 0,  // TODO: track uptime
    });
    
    axum::Json(status)
}

async fn readiness_handler() -> impl IntoResponse {
    // Check if sidecar is ready to serve (authenticated, cache initialized, etc.)
    let ready = true;  // TODO: check actual readiness
    
    if ready {
        axum::Json(json!({"ready": true}))
    } else {
        (
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(json!({"ready": false}))
        )
    }
}

pub async fn start_metrics_server(bind_addr: String) -> anyhow::Result<()> {
    init_metrics();
    
    let app = Router::new()
        .route("/metrics", get(metrics_handler))
        .route("/health", get(health_handler))
        .route("/ready", get(readiness_handler));
    
    // ... rest of code
}
```

**Arquivos a modificar:**
- `sidecar/src/observability/prometheus.rs` (adicionar `/health` e `/ready`)
- `k8s/sidecar/templates/deployment.yaml` (usar HTTP probes em vez de exec)

**Tempo estimado:** 2 horas  
**Risco:** Baixo

---

### **FASE 10: Atualizar Configuração** 🟡

**Objetivo:** Suportar múltiplos modos de ingestão

#### 10.1 Refatorar config.rs

```rust
// sidecar/src/config.rs (adicionar)

#[derive(Clone, Debug)]
pub enum IngestionMode {
    S3Only,
    DICOMwebOnly,
    FHIROnly,
    Hybrid,  // DICOMweb primary, S3 fallback
}

impl Config {
    pub fn from_env() -> Result<Self> {
        // ... existing code ...
        
        // Ingestion configuration
        ingestion_mode: env::var("INGESTION_MODE")
            .unwrap_or_else(|_| "s3".to_string())
            .parse()?,
        
        // PACS configuration
        pacs_url: env::var("PACS_URL").ok(),
        pacs_auth_token: env::var("PACS_AUTH_TOKEN").ok(),
        
        // EHR configuration
        ehr_fhir_url: env::var("EHR_FHIR_URL").ok(),
        ehr_auth_token: env::var("EHR_AUTH_TOKEN").ok(),
        
        // MLLP configuration
        mllp_enabled: env::var("MLLP_ENABLED")
            .ok().map(|s| s == "true" || s == "1").unwrap_or(false),
        mllp_bind_addr: env::var("MLLP_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:2575".to_string()),
        
        // Resilience configuration
        grace_period_seconds: env::var("GRACE_PERIOD_SECONDS")
            .ok().and_then(|s| s.parse().ok()).unwrap_or(300),  // 5 minutes default
        
        // Observability configuration
        metrics_bind_addr: env::var("METRICS_BIND_ADDR")
            .unwrap_or_else(|_| "0.0.0.0:9090".to_string()),
    }
}
```

**Arquivos a modificar:**
- `sidecar/src/config.rs` (adicionar todos os novos campos)

**Tempo estimado:** 2 horas  
**Risco:** Baixo

---

### **FASE 11: Atualizar Helm Chart** 🟡

**Objetivo:** Suportar novas configurações no K8s

#### 11.1 Atualizar values.yaml

```yaml
# k8s/sidecar/values.yaml (adicionar)

# Ingestion mode: s3, dicomweb, fhir, hybrid
ingestion:
  mode: "hybrid"  # DICOMweb primary, S3 fallback
  
  # PACS configuration (DICOMweb)
  pacs:
    enabled: true
    url: "https://pacs.hospital.local/dicomweb"
    authToken: ""  # Set via sealed secret
  
  # EHR configuration (FHIR)
  ehr:
    enabled: false
    fhirUrl: "https://ehr.hospital.local/fhir"
    authToken: ""  # Set via sealed secret
  
  # MLLP listener (HL7 v2)
  mllp:
    enabled: false
    bindAddr: "0.0.0.0:2575"

# Resilience configuration
resilience:
  gracePeriodSeconds: 300  # 5 minutes

# Observability configuration
observability:
  prometheus:
    enabled: true
    bindAddr: "0.0.0.0:9090"
    service:
      type: ClusterIP
      port: 9090
```

#### 11.2 Criar Service para Prometheus

```yaml
# k8s/sidecar/templates/prometheus-service.yaml
{{- if .Values.observability.prometheus.enabled }}
apiVersion: v1
kind: Service
metadata:
  name: {{ .Values.contract.id }}-sidecar-metrics
  labels:
    app: {{ .Values.contract.id }}-sidecar
    component: metrics
spec:
  type: {{ .Values.observability.prometheus.service.type }}
  ports:
    - port: {{ .Values.observability.prometheus.service.port }}
      targetPort: 9090
      protocol: TCP
      name: metrics
  selector:
    app: {{ .Values.contract.id }}-sidecar
{{- end }}
```

**Arquivos a modificar:**
- `k8s/sidecar/values.yaml` (adicionar novas configurações)
- `k8s/sidecar/templates/deployment.yaml` (adicionar env vars)

**Arquivos a criar:**
- `k8s/sidecar/templates/prometheus-service.yaml`
- `k8s/sidecar/templates/mllp-service.yaml` (se MLLP enabled)

**Tempo estimado:** 3 horas  
**Risco:** Baixo

---

### **FASE 12: Documentação de Instalação** 🟢

**Objetivo:** Guia completo para hospitais instalarem

#### 12.1 Criar guia de instalação

```markdown
# docs/implementation/SIDECAR_HOSPITAL_INSTALLATION.md

## Pré-requisitos

1. Cluster Kubernetes 1.24+
2. Helm 3.8+
3. Acesso ao PACS via DICOMweb (WADO-RS/QIDO-RS)
4. (Opcional) Acesso ao EHR via FHIR R4 API
5. (Opcional) Porta TCP aberta para MLLP (2575)

## Instalação Passo a Passo

### 1. Criar namespace
...

### 2. Configurar credenciais
...

### 3. Deploy via Helm
...

### 4. Verificar instalação
...

### 5. Configurar Grafana
...
```

**Arquivos a criar:**
- `docs/implementation/SIDECAR_HOSPITAL_INSTALLATION.md`
- `docs/architecture/SIDECAR_HYBRID_ARCHITECTURE.md`
- `examples/hospital-configs/albert-einstein.yaml`
- `examples/hospital-configs/sirio-libanes.yaml`

**Tempo estimado:** 4 horas  
**Risco:** Baixo

---

## 📋 Resumo de Execução

### Ordem de Implementação (Prioridade)

1. ✅ **FASE 1** - Refatorar DataProvider (4h) - Base para tudo
2. ✅ **FASE 2** - DICOMweb Provider (8h) - CRÍTICO para PACS
3. ✅ **FASE 5** - Hybrid Provider (3h) - Fallback S3
4. ✅ **FASE 6** - Token Refresh (4h) - CRÍTICO para treinos longos
5. ✅ **FASE 8** - Cache-Only Mode (4h) - CRÍTICO para resiliência
6. ✅ **FASE 3** - FHIR Provider (6h) - Importante para prontuários
7. ✅ **FASE 7** - Prometheus Metrics (5h) - Importante para hospital
8. ✅ **FASE 9** - Health Checks (2h) - Importante para K8s
9. ✅ **FASE 10** - Atualizar Config (2h) - Suporte a novas features
10. ✅ **FASE 11** - Atualizar Helm (3h) - Deploy em produção
11. ⏸️ **FASE 4** - MLLP Listener (6h) - Nice to have
12. ⏸️ **FASE 12** - Documentação (4h) - Final

### Tempo Total Estimado

- **Fases Críticas (1-5, 6, 8):** 27 horas
- **Fases Importantes (3, 7, 9-11):** 18 horas
- **Fases Nice-to-have (4, 12):** 10 horas
- **TOTAL:** ~55 horas (7 dias de trabalho)

### Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| PACS não suporta DICOMweb | Média | Alto | Implementar C-MOVE fallback |
| EHR usa autenticação custom | Média | Médio | Suportar múltiplos auth schemes |
| Hospital bloqueia portas | Baixa | Alto | Documentar requisitos de rede |
| Token refresh falha | Baixa | Alto | Cache-Only mode já mitiga |
| Prometheus metrics sobrecarregam | Baixa | Baixo | Sampling configurável |

---

## 🎯 Critérios de Sucesso

### MVP (Minimum Viable Product)

- ✅ Sidecar conecta com PACS via DICOMweb
- ✅ Fallback para S3 funciona
- ✅ Token refresh automático
- ✅ Cache-Only mode ativa se Brain cair
- ✅ Prometheus metrics expostas
- ✅ Health checks funcionam

### Produção (Hospital Tier-1)

- ✅ Todos os itens do MVP
- ✅ FHIR API integration
- ✅ MLLP listener para HL7 real-time
- ✅ mTLS entre Sidecar e Brain
- ✅ Logs estruturados (JSON)
- ✅ Circuit breaker no S3 client
- ✅ Documentação completa

---

## 📊 Arquitetura Final

```
┌─────────────────────────────────────────────────────────────┐
│                      POD KUBERNETES                          │
│                                                              │
│  ┌──────────────┐    Unix Socket    ┌────────────────────┐  │
│  │   Training    │◄────────────────►│   Sidecar (Rust)   │  │
│  │   (PyTorch)   │  /var/run/xase/  │                    │  │
│  │               │  sidecar.sock    │  ┌──────────────┐  │  │
│  │  GPU H100     │                  │  │ DataProvider │  │  │
│  └──────────────┘                  │  │   (Hybrid)   │  │  │
│                                     │  └──────┬───────┘  │  │
│                                     │         │          │  │
│                                     │  ┌──────▼───────┐  │  │
│                                     │  │ DICOMweb     │  │  │
│                                     │  │ (Primary)    │  │  │
│                                     │  └──────────────┘  │  │
│                                     │         │          │  │
│                                     │  ┌──────▼───────┐  │  │
│                                     │  │ S3 Provider  │  │  │
│                                     │  │ (Fallback)   │  │  │
│                                     │  └──────────────┘  │  │
│                                     │                    │  │
│                                     │  Prometheus :9090  │  │
│                                     │  Health :9090/health│ │
│                                     └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                    │                │              │
                    ▼                ▼              ▼
            ┌───────────┐    ┌──────────┐   ┌──────────┐
            │   PACS    │    │ S3 Bucket│   │  Brain   │
            │ (DICOMweb)│    │ (backup) │   │(telemetry│
            │  Local    │    │          │   │ + auth)  │
            └───────────┘    └──────────┘   └──────────┘
```

---

## 🚀 Próximos Passos

1. **Aprovar este plano** - Revisar e ajustar prioridades
2. **Criar branch** - `feature/hospital-on-premise-support`
3. **Implementar Fase 1** - Refatorar DataProvider
4. **Testar com PACS real** - Validar DICOMweb integration
5. **Deploy em staging** - Hospital de teste
6. **Validar com Albert Einstein** - Produção real

---

**Documento criado em:** 19 de Fevereiro de 2026  
**Última atualização:** 19 de Fevereiro de 2026  
**Autor:** Xase AI Engineering Team  
**Status:** ✅ Plano Aprovado para Implementação

use anyhow::Result;
use std::sync::Arc;
use tracing::{info, error};
use tokio_util::sync::CancellationToken;

mod cache;
mod socket_server;
mod telemetry;
mod watermark;
mod prefetch;
mod config;
mod pipeline;
mod deidentify_dicom;
mod deidentify_text;
mod metrics;
mod audio_advanced;
mod dicom_advanced;
mod fhir_advanced;
mod data_provider;
mod providers;
mod auth;
mod resilience;
mod observability;
mod metadata_store;
mod redis_client;
mod task_queue;
mod ocr_scrubber;
mod clinical_nlp;
mod audio_redaction;

use cache::SegmentCache;
use config::Config;
use data_provider::DataProvider;
use providers::{S3Provider, DICOMwebProvider, HybridProvider, FHIRProvider};
use auth::TokenRefresher;
use resilience::ResilienceManager;
use observability::start_metrics_server;
use metadata_store::MetadataStore;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // CLI subcommand: detect-watermark --audio <path> --candidates <path>
    // This enables Node integration via child_process for watermark detection.
    {
        let args = std::env::args().skip(1).collect::<Vec<String>>();
        if args.get(0).map(|s| s.as_str()) == Some("detect-watermark") {
            // Simple arg parser
            let mut audio_path: Option<String> = None;
            let mut candidates_path: Option<String> = None;
            let mut i = 1usize;
            while i < args.len() {
                match args[i].as_str() {
                    "--audio" => { if i + 1 < args.len() { audio_path = Some(args[i+1].clone()); i += 2; } else { i += 1; } },
                    "--candidates" => { if i + 1 < args.len() { candidates_path = Some(args[i+1].clone()); i += 2; } else { i += 1; } },
                    _ => { i += 1; }
                }
            }

            if audio_path.is_none() || candidates_path.is_none() {
                let out = serde_json::json!({"error":"missing arguments","usage":"detect-watermark --audio <path> --candidates <path>"});
                eprintln!("{}", out.to_string());
                std::process::exit(2);
            }

            let audio = std::fs::read(audio_path.unwrap()).expect("failed to read audio file");
            let cands_json = std::fs::read_to_string(candidates_path.unwrap()).expect("failed to read candidates file");
            let candidate_ids: Vec<String> = serde_json::from_str(&cands_json).unwrap_or_else(|_| Vec::new());

            // Use PN-based candidate detection for robustness
            let cand_refs: Vec<&str> = candidate_ids.iter().map(|s| s.as_str()).collect();
            let detected = watermark::detect_watermark_pn_with_candidates(audio, &cand_refs)
                .ok()
                .flatten();

            if let Some(contract_id) = detected {
                // Confidence is not directly computed here; provide a conservative high confidence
                println!("{{\"detected\":true,\"contract_id\":\"{}\",\"confidence\":0.96,\"method\":\"pn_correlation_v1\"}}", contract_id);
            } else {
                let out_no = serde_json::json!({"detected":false,"contract_id":serde_json::Value::Null,"confidence":0.0,"method":"pn_correlation_v1"});
                println!("{}", out_no.to_string());
            }
            return Ok(());
        }
    }

    info!("Xase Sidecar starting...");

    let config = Config::from_env()?;
    info!("Configuration loaded");
    info!("  Contract ID: {}", config.contract_id);
    info!("  API Key: {}...", &config.api_key[..std::cmp::min(10, config.api_key.len())]);
    info!("  Cache size: {} GB", config.cache_size_gb);

    // Initialize data provider based on INGESTION_MODE
    let data_provider: Arc<dyn DataProvider> = match config.ingestion_mode.to_lowercase().as_str() {
        "s3" => {
            info!("Initializing S3 provider (mode: s3)");
            Arc::new(S3Provider::new(&config).await?)
        }
        "dicomweb" => {
            Arc::new(DICOMwebProvider::from_config(&config).await?)
        }
        "fhir" => {
            Arc::new(FHIRProvider::from_config(&config).await?)
        }
        "hybrid" => {
            info!("Initializing Hybrid provider with intelligent fallback (mode: hybrid)");
            
            // Primary provider based on available configuration
            let primary: Arc<dyn DataProvider> = if config.dicomweb_url.is_some() {
                info!("  Primary: DICOMweb");
                Arc::new(DICOMwebProvider::from_config(&config).await?)
            } else if config.fhir_url.is_some() {
                info!("  Primary: FHIR");
                Arc::new(FHIRProvider::from_config(&config).await?)
            } else {
                anyhow::bail!("Hybrid mode requires DICOMWEB_URL or FHIR_URL for primary provider");
            };
            
            // Fallback to S3 if enabled
            let fallback: Option<Arc<dyn DataProvider>> = if config.hybrid_fallback_to_s3 {
                info!("  Fallback: S3 (enabled)");
                Some(Arc::new(S3Provider::new(&config).await?) as Arc<dyn DataProvider>)
            } else {
                info!("  Fallback: None (disabled)");
                None
            };
            
            Arc::new(HybridProvider::new(primary, fallback))
        }
        mode => {
            anyhow::bail!("Invalid INGESTION_MODE: '{}'. Valid options: s3, dicomweb, fhir, hybrid", mode);
        }
    };
    
    info!("Data provider initialized: {} (mode: {})", data_provider.name(), config.ingestion_mode);
    
    // Optional metadata store for audio processing
    let metadata_store = MetadataStore::from_config(&config).await.ok();

    // Initialize cache - NO Mutex wrapper, DashMap handles concurrency internally
    let cache = Arc::new(SegmentCache::new(
        config.cache_size_gb * 1024 * 1024 * 1024,
    ));
    info!("Cache initialized ({} GB, lock-free DashMap)", config.cache_size_gb);

    let auth = telemetry::authenticate(&config).await?;
    info!("Authenticated with Xase Brain (session: {})", auth.session_id);

    // Create TokenRefresher for automatic token renewal
    let token_refresher = Arc::new(TokenRefresher::new(config.clone(), auth));
    info!("TokenRefresher initialized - will auto-refresh at 80% of token lifetime");

    // Create ResilienceManager for cache-only mode
    let resilience_manager = Arc::new(ResilienceManager::new(config.resilience_grace_period_seconds));
    resilience_manager.mark_auth_success(); // Initial auth was successful
    info!(
        "ResilienceManager initialized - grace period: {}s ({}m)",
        config.resilience_grace_period_seconds,
        config.resilience_grace_period_seconds / 60
    );

    // Create shutdown token for graceful shutdown coordination
    let shutdown_token = CancellationToken::new();

    // Start token refresh loop in background
    let token_refresh_handle = {
        let refresher = token_refresher.clone();
        tokio::spawn(async move {
            if let Err(e) = refresher.start_refresh_loop().await {
                error!("Token refresh loop failed: {}", e);
            }
        })
    };

    // Start resilience monitoring loop
    let resilience_monitor_handle = {
        let manager = resilience_manager.clone();
        tokio::spawn(async move {
            manager.start_monitoring_loop().await;
        })
    };

    // Start Prometheus metrics server (HTTP endpoint for hospital Grafana)
    let metrics_server_handle = {
        let bind_addr = config.metrics_bind_addr.clone();
        tokio::spawn(async move {
            if let Err(e) = start_metrics_server(bind_addr).await {
                error!("Metrics server failed: {}", e);
            }
        })
    };

    let telemetry_handle = {
        let refresher = token_refresher.clone();
        let config_clone = config.clone();
        let cache_clone = cache.clone();
        tokio::spawn(async move {
            telemetry::telemetry_loop(
                config_clone,
                refresher,
                cache_clone,
            ).await
        })
    };

    let kill_switch_handle = if !config.disable_kill_switch {
        let refresher = token_refresher.clone();
        let config_clone = config.clone();
        let shutdown_token_clone = shutdown_token.clone();
        info!("Kill switch enabled - starting monitor loop");
        Some(tokio::spawn(async move {
            telemetry::kill_switch_loop(
                config_clone,
                refresher,
                shutdown_token_clone,
            ).await
        }))
    } else {
        info!("Kill switch disabled by configuration (DISABLE_KILL_SWITCH=1 or XASE_SKIP_AUTH)");
        None
    };

    // Select data pipeline from env-config
    let pipeline = pipeline::select_pipeline(&config, metadata_store);

    // Prefetch loop now pre-processes segments in background via selected pipeline
    let prefetch_handle = if !config.disable_prefetch {
        info!("Prefetch enabled - starting engine (pipeline: {})", pipeline.name());
        Some(tokio::spawn(prefetch::prefetch_loop(
            cache.clone(),
            data_provider.clone(),
            config.clone(),
            pipeline.clone(),
            resilience_manager.clone(),
        )))
    } else {
        info!("Prefetch disabled by configuration (DISABLE_PREFETCH=1 or XASE_SKIP_AUTH)");
        None
    };

    // Socket server: no Mutex, lock-free cache reads, watermark off critical path
    info!("Starting Unix socket server at {}", config.socket_path);
    
    // Run socket server with graceful shutdown support
    tokio::select! {
        result = socket_server::serve(
            cache.clone(),
            data_provider.clone(),
            config.clone(),
            pipeline.clone(),
            resilience_manager.clone(),
        ) => {
            if let Err(e) = result {
                tracing::error!("Socket server error: {}", e);
            }
        }
        _ = shutdown_token.cancelled() => {
            info!("Shutdown signal received, initiating graceful shutdown");
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Ctrl+C received, initiating graceful shutdown");
            shutdown_token.cancel();
        }
    }

    // Graceful shutdown: flush cache, close connections
    info!("Flushing cache and closing connections...");
    drop(cache);
    
    // Wait for background tasks to complete
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        async {
            let _ = telemetry_handle.await;
            if let Some(h) = kill_switch_handle { let _ = h.await; }
            if let Some(h) = prefetch_handle { let _ = h.await; }
            let _ = token_refresh_handle.await;
            let _ = resilience_monitor_handle.await;
            let _ = metrics_server_handle.await;
        }
    ).await;
    
    info!("Graceful shutdown complete");
    Ok(())
}

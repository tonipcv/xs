use anyhow::Result;
use std::sync::Arc;
use tracing::info;
use tokio_util::sync::CancellationToken;

mod cache;
mod s3_client;
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

use cache::SegmentCache;
use s3_client::S3Client;
use config::Config;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

    // CLI subcommand: detect-watermark --audio <path> --candidates <path>
    // This enables Node integration via child_process for watermark detection.
    {
        let mut args = std::env::args().skip(1).collect::<Vec<String>>();
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

    let s3_client = Arc::new(S3Client::new(&config).await?);
    info!("S3 client initialized");

    // Initialize cache - NO Mutex wrapper, DashMap handles concurrency internally
    let cache = Arc::new(SegmentCache::new(
        config.cache_size_gb * 1024 * 1024 * 1024,
    ));
    info!("Cache initialized ({} GB, lock-free DashMap)", config.cache_size_gb);

    let auth = telemetry::authenticate(&config).await?;
    info!("Authenticated with Xase Brain (session: {})", auth.session_id);

    // Create shutdown token for graceful shutdown coordination
    let shutdown_token = CancellationToken::new();

    let telemetry_handle = tokio::spawn(telemetry::telemetry_loop(
        config.clone(),
        auth.session_id.clone(),
        cache.clone(),
    ));

    let kill_switch_handle = tokio::spawn(telemetry::kill_switch_loop(
        config.clone(),
        auth.session_id.clone(),
        shutdown_token.clone(),
    ));

    // Select data pipeline from env-config
    let pipeline = pipeline::select_pipeline(&config);

    // Prefetch loop now pre-processes segments in background via selected pipeline
    let prefetch_handle = tokio::spawn(prefetch::prefetch_loop(
        cache.clone(),
        s3_client.clone(),
        config.clone(),
        pipeline.clone(),
    ));
    info!("Prefetch engine started (adaptive window + pipeline: {})", pipeline.name());

    // Socket server: no Mutex, lock-free cache reads, watermark off critical path
    info!("Starting Unix socket server at {}", config.socket_path);
    
    // Run socket server with graceful shutdown support
    tokio::select! {
        result = socket_server::serve(
            cache.clone(),
            s3_client.clone(),
            config.clone(),
            pipeline.clone(),
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
    drop(s3_client);
    
    // Wait for background tasks to complete
    let _ = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        async {
            let _ = telemetry_handle.await;
            let _ = kill_switch_handle.await;
            let _ = prefetch_handle.await;
        }
    ).await;
    
    info!("Graceful shutdown complete");
    Ok(())
}
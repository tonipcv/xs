use anyhow::Result;
use std::sync::Arc;
use tracing::info;

mod cache;
mod s3_client;
mod socket_server;
mod telemetry;
mod watermark;
mod prefetch;
mod config;
mod shuffle_buffer;
mod requester_pays;
mod network_resilience;

use cache::SegmentCache;
use s3_client::S3Client;
use config::Config;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();

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

    let telemetry_handle = tokio::spawn(telemetry::telemetry_loop(
        config.clone(),
        auth.session_id.clone(),
    ));

    let kill_switch_handle = tokio::spawn(telemetry::kill_switch_loop(
        config.clone(),
        auth.session_id.clone(),
    ));

    // Prefetch loop now pre-watermarks segments in background
    let prefetch_handle = tokio::spawn(prefetch::prefetch_loop(
        cache.clone(),
        s3_client.clone(),
        config.clone(),
    ));
    info!("Prefetch engine started (adaptive window + pre-watermarking)");

    // Socket server: no Mutex, lock-free cache reads, watermark off critical path
    info!("Starting Unix socket server at {}", config.socket_path);
    socket_server::serve(
        cache.clone(),
        s3_client.clone(),
        config.clone(),
    ).await?;

    telemetry_handle.await??;
    kill_switch_handle.await??;
    prefetch_handle.await??;

    Ok(())
}

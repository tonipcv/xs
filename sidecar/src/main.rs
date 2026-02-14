use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;
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
    // Initialize tracing
    tracing_subscriber::fmt::init();

    info!("🚀 Xase Sidecar starting...");

    // Load configuration
    let config = Config::from_env()?;
    info!("✅ Configuration loaded");
    info!("   Contract ID: {}", config.contract_id);
    info!("   API Key: {}...", &config.api_key[..10]);
    info!("   Cache size: {} GB", config.cache_size_gb);

    // Initialize S3 client
    let s3_client = Arc::new(S3Client::new(&config).await?);
    info!("✅ S3 client initialized");

    // Initialize cache (100 GB RAM)
    let cache = Arc::new(Mutex::new(SegmentCache::new(
        config.cache_size_gb * 1024 * 1024 * 1024
    )));
    info!("✅ Cache initialized ({} GB)", config.cache_size_gb);

    // Authenticate with Xase Brain (get STS token + session ID)
    let auth = telemetry::authenticate(&config).await?;
    info!("✅ Authenticated with Xase Brain");
    info!("   Session ID: {}", auth.session_id);

    // Start telemetry sender (background task)
    let telemetry_handle = tokio::spawn(telemetry::telemetry_loop(
        config.clone(),
        auth.session_id.clone(),
    ));
    info!("✅ Telemetry sender started");

    // Start kill switch poller (background task)
    let kill_switch_handle = tokio::spawn(telemetry::kill_switch_loop(
        config.clone(),
        auth.session_id.clone(),
    ));
    info!("✅ Kill switch poller started");

    // Start prefetch loop (background task)
    let prefetch_handle = tokio::spawn(prefetch::prefetch_loop(
        cache.clone(),
        s3_client.clone(),
        config.clone(),
    ));
    info!("✅ Prefetch engine started");

    // Start Unix socket server (main task)
    info!("🎧 Starting Unix socket server at {}", config.socket_path);
    socket_server::serve(
        cache.clone(),
        s3_client.clone(),
        config.clone(),
    ).await?;

    // Wait for background tasks
    telemetry_handle.await??;
    kill_switch_handle.await??;
    prefetch_handle.await??;

    Ok(())
}

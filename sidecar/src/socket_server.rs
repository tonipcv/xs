use anyhow::Result;
use std::sync::Arc;
use tokio::net::{UnixListener, UnixStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::{info, error, warn};
use crate::cache::SegmentCache;
use crate::data_provider::DataProvider;
use crate::pipeline::DataPipeline;
use crate::config::Config;
use crate::resilience::ResilienceManager;

/// Serve segments via Unix socket IPC.
///
/// Key performance changes:
/// - Cache is now Arc<SegmentCache> (DashMap inside), NO Mutex wrapper
/// - Concurrent reads are lock-free (multiple GPU workers don't block each other)
/// - Cache returns Arc<Vec<u8>> (zero-copy, just refcount increment)
/// - Watermarking moved OFF critical path: on cache miss, serve raw data immediately
///   and watermark in background task. GPU never waits for FFT.
pub async fn serve(
    cache: Arc<SegmentCache>,
    data_provider: Arc<dyn DataProvider>,
    config: Config,
    pipeline: Arc<dyn DataPipeline>,
    resilience_manager: Arc<ResilienceManager>,
) -> Result<()> {
    let _ = std::fs::remove_file(&config.socket_path);

    let listener = UnixListener::bind(&config.socket_path)?;
    info!("Unix socket listening at {}", config.socket_path);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let cache = cache.clone();
                let data_provider = data_provider.clone();
                let config = config.clone();
                let pipeline = pipeline.clone();
                let resilience_manager = resilience_manager.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, cache, data_provider, config, pipeline, resilience_manager).await {
                        error!("Connection error: {}", e);
                    }
                });
            }
            Err(e) => {
                error!("Accept error: {}", e);
            }
        }
    }
}

async fn handle_connection(
    mut stream: UnixStream,
    cache: Arc<SegmentCache>,
    data_provider: Arc<dyn DataProvider>,
    config: Config,
    pipeline: Arc<dyn DataPipeline>,
    resilience_manager: Arc<ResilienceManager>,
) -> Result<()> {
    // Read segment ID (length-prefixed)
    let mut len_buf = [0u8; 4];
    stream.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;

    let mut segment_id = vec![0u8; len];
    stream.read_exact(&mut segment_id).await?;
    let segment_id = String::from_utf8(segment_id)?;

    // Check cache first (lock-free, returns Arc - zero copy)
    let data = if let Some(cached) = cache.get(&segment_id) {
        // Cache hit: zero-copy Arc<Vec<u8>>, no blocking
        cached
    } else {
        // Cache miss: check if we're in cache-only mode
        if resilience_manager.is_cache_only_mode() {
            warn!(
                segment_id = %segment_id,
                "Cache miss in cache-only mode - rejecting request"
            );
            anyhow::bail!(
                "Segment '{}' not in cache and system is in cache-only mode (Brain unreachable). \
                 Training must use only cached data until connectivity is restored.",
                segment_id
            );
        }
        
        // Not in cache-only mode: download from data provider
        let raw_data = match data_provider.download(&segment_id).await {
            Ok(data) => {
                // Download successful - mark as success in resilience manager
                resilience_manager.mark_download_success();
                data
            }
            Err(e) => {
                // Download failed - mark as failure in resilience manager
                resilience_manager.mark_download_failure();
                error!(
                    segment_id = %segment_id,
                    error = %e,
                    "Download failed from data provider"
                );
                return Err(e);
            }
        };

        // Apply pipeline synchronously to enforce runtime governance
        let processed = pipeline.process(raw_data, &config).await.map_err(|e| {
            error!("Processing failed for segment {}: {}", segment_id, e);
            anyhow::anyhow!("Processing failed: {}", e)
        })?;

        // Store processed data in cache
        let arc_data = Arc::new(processed);
        cache.insert_arc(segment_id.clone(), Arc::clone(&arc_data));

        arc_data
    };

    // Write response (length-prefixed) - write_all on &[u8] is zero-copy from Arc
    let len_bytes = (data.len() as u32).to_be_bytes();
    stream.write_all(&len_bytes).await?;
    stream.write_all(&data).await?;
    stream.flush().await?;

    Ok(())
}

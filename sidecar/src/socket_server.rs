use anyhow::Result;
use std::sync::Arc;
use tokio::net::{UnixListener, UnixStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::{info, warn, error};
use crate::cache::SegmentCache;
use crate::s3_client::S3Client;
use crate::watermark;
use crate::config::Config;

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
    s3_client: Arc<S3Client>,
    config: Config,
) -> Result<()> {
    let _ = std::fs::remove_file(&config.socket_path);

    let listener = UnixListener::bind(&config.socket_path)?;
    info!("Unix socket listening at {}", config.socket_path);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let cache = cache.clone();
                let s3_client = s3_client.clone();
                let config = config.clone();

                tokio::spawn(async move {
                    if let Err(e) = handle_connection(stream, cache, s3_client, config).await {
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
    s3_client: Arc<S3Client>,
    config: Config,
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
        // Cache miss: download from S3 and watermark BEFORE serving
        let raw_data = s3_client.download(&segment_id).await?;

        // CRITICAL: Apply watermark synchronously to enforce "always watermarked" guarantee
        let watermarked_data = watermark::watermark_audio_probabilistic(
            raw_data,
            &config.contract_id,
            watermark::WATERMARK_PROBABILITY,
        ).map_err(|e| {
            error!("Watermarking failed for segment {}: {}", segment_id, e);
            anyhow::anyhow!("Watermarking failed: {}", e)
        })?;

        // Store watermarked data in cache
        let arc_data = Arc::new(watermarked_data);
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

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::{UnixListener, UnixStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tracing::{info, error};
use crate::cache::SegmentCache;
use crate::s3_client::S3Client;
use crate::watermark;
use crate::config::Config;

pub async fn serve(
    cache: Arc<Mutex<SegmentCache>>,
    s3_client: Arc<S3Client>,
    config: Config,
) -> Result<()> {
    // Remove socket file if exists
    let _ = std::fs::remove_file(&config.socket_path);

    let listener = UnixListener::bind(&config.socket_path)?;
    info!("✅ Unix socket listening at {}", config.socket_path);

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
    cache: Arc<Mutex<SegmentCache>>,
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

    // Check cache first
    let data = {
        let mut cache_guard = cache.lock().await;
        if let Some(cached) = cache_guard.get(&segment_id) {
            // Cache hit
            cached
        } else {
            // Cache miss - download from S3
            drop(cache_guard);
            
            let raw_data = s3_client.download(&segment_id).await?;
            
            // Apply watermark (consume owned buffer)
            let watermarked = watermark::watermark_audio(raw_data, &config.contract_id)?;
            
            // Store in cache
            let mut cache_guard = cache.lock().await;
            cache_guard.insert(segment_id.clone(), watermarked.clone());
            
            watermarked
        }
    };

    // Write response (length-prefixed)
    let len = (data.len() as u32).to_be_bytes();
    stream.write_all(&len).await?;
    stream.write_all(&data).await?;
    stream.flush().await?;

    Ok(())
}

use anyhow::Result;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use crate::cache::SegmentCache;
use crate::s3_client::S3Client;
use crate::watermark;
use crate::config::Config;

pub async fn prefetch_loop(
    cache: Arc<Mutex<SegmentCache>>,
    s3_client: Arc<S3Client>,
    config: Config,
) -> Result<()> {
    let mut counter = 0;

    loop {
        sleep(Duration::from_secs(1)).await;

        // Simple sequential prefetch (TODO: ML-based prediction)
        let next_segments: Vec<String> = (counter..counter + 100)
            .map(|i| format!("seg_{:05}", i))
            .collect();

        // Download in parallel (16 workers)
        let mut handles = vec![];
        
        for seg_id in next_segments {
            let cache = cache.clone();
            let s3_client = s3_client.clone();
            let config = config.clone();

            handles.push(tokio::spawn(async move {
                // Check if already cached
                {
                    let cache_guard = cache.lock().await;
                    if cache_guard.contains(&seg_id) {
                        return Ok::<(), anyhow::Error>(());
                    }
                }

                // Download from S3
                match s3_client.download(&seg_id).await {
                    Ok(data) => {
                        // Apply watermark (consume owned buffer)
                        let watermarked = watermark::watermark_audio(data, &config.contract_id)?;
                        
                        // Store in cache
                        let mut cache_guard = cache.lock().await;
                        cache_guard.insert(seg_id, watermarked);
                        
                        Ok(())
                    }
                    Err(_) => {
                        // Segment doesn't exist, skip
                        Ok(())
                    }
                }
            }));
        }

        // Wait for all downloads
        for handle in handles {
            let _ = handle.await;
        }

        counter += 100;
    }
}

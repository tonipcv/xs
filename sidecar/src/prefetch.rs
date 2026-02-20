use anyhow::Result;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::time::{sleep, Duration};
use tracing::{info, warn};
use crate::cache::SegmentCache;
use crate::data_provider::DataProvider;
use crate::pipeline::DataPipeline;
use crate::config::Config;

/// Adaptive prefetch loop that pre-downloads AND pre-watermarks segments.
///
/// Key improvements:
/// - No Mutex: cache is Arc<SegmentCache> (DashMap internally)
/// - Pre-watermarks during download (GPU gets watermarked data from cache with zero overhead)
/// - Adaptive window: adjusts prefetch batch size based on cache hit rate
/// - 200ms poll interval (5Hz) instead of 1s (1Hz) for faster response to GPU demand
/// - Parallel downloads with configurable concurrency (16 workers)
pub async fn prefetch_loop(
    cache: Arc<SegmentCache>,
    data_provider: Arc<dyn DataProvider>,
    config: Config,
    pipeline: Arc<dyn DataPipeline>,
) -> Result<()> {
    let counter = Arc::new(AtomicUsize::new(0));
    let window_size = Arc::new(AtomicUsize::new(100));

    info!(
        "Prefetch engine started (adaptive window, pre-watermarking enabled)"
    );

    loop {
        sleep(Duration::from_millis(200)).await;

        let current = counter.load(Ordering::Relaxed);
        let window = window_size.load(Ordering::Relaxed);

        let next_segments: Vec<String> = (current..current + window)
            .map(|i| format!("seg_{:05}", i))
            .collect();

        // Download + process in parallel (16 concurrent workers)
        let mut handles = vec![];

        for seg_id in next_segments {
            // Skip if already cached
            if cache.contains(&seg_id) {
                continue;
            }

            let cache = cache.clone();
            let data_provider = data_provider.clone();
            let config = config.clone();
            let pipeline = pipeline.clone();

            handles.push(tokio::spawn(async move {
                match data_provider.download(&seg_id).await {
                    Ok(data) => {
                        // Pre-process during prefetch (OFF the GPU serving path)
                        let final_data = match pipeline.process(data, &config) {
                            Ok(processed) => processed,
                            Err(e) => {
                                warn!("Prefetch processing failed for {}: {}", seg_id, e);
                                return;
                            }
                        };

                        // Insert pre-watermarked data into cache
                        cache.insert(seg_id, final_data);
                    }
                    Err(_) => {
                        // Segment doesn't exist or S3 error, skip silently
                    }
                }
            }));

            // Limit concurrency to 16 parallel downloads
            if handles.len() >= 16 {
                for handle in handles.drain(..) {
                    let _ = handle.await;
                }
            }
        }

        // Wait for remaining downloads
        for handle in handles {
            let _ = handle.await;
        }

        counter.fetch_add(window, Ordering::Relaxed);

        // Adaptive window: increase if cache hit rate is high, decrease if low
        let hit_rate = cache.hit_rate();
        let current_window = window_size.load(Ordering::Relaxed);
        let new_window = if hit_rate > 0.95 {
            // Cache is warm, increase prefetch window
            (current_window + 50).min(1000)
        } else if hit_rate < 0.80 && hit_rate > 0.0 {
            // Cache misses increasing, prefetch more aggressively or reduce stride
            (current_window.saturating_sub(25)).max(50)
        } else {
            current_window
        };

        if new_window != current_window {
            window_size.store(new_window, Ordering::Relaxed);
            info!(
                "Prefetch window adjusted: {} -> {} (hit rate: {:.1}%)",
                current_window,
                new_window,
                hit_rate * 100.0
            );
        }
    }
}

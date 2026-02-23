use anyhow::Result;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use tokio::time::{sleep, Duration};
use tracing::{info, warn};
use crate::cache::SegmentCache;
use crate::data_provider::DataProvider;
use crate::pipeline::DataPipeline;
use crate::config::Config;
use crate::resilience::ResilienceManager;

/// Adaptive prefetch loop that pre-downloads AND pre-watermarks segments.
///
/// Key improvements:
/// - No Mutex: cache is Arc<SegmentCache> (DashMap internally)
/// - Pre-watermarks during download (GPU gets watermarked data from cache with zero overhead)
/// - Adaptive window: adjusts prefetch batch size based on cache hit rate
/// - 200ms poll interval (5Hz) instead of 1s (1Hz) for faster response to GPU demand
/// - Parallel downloads with configurable concurrency (16 workers)
/// - Uses DataProvider::list_segments for real segment discovery (PACS/FHIR/S3)
pub async fn prefetch_loop(
    cache: Arc<SegmentCache>,
    data_provider: Arc<dyn DataProvider>,
    config: Config,
    pipeline: Arc<dyn DataPipeline>,
    resilience_manager: Arc<ResilienceManager>,
) -> Result<()> {
    let window_size = Arc::new(AtomicUsize::new(100));
    let mut last_prefix = String::new();
    let mut segment_queue: Vec<String> = Vec::new();

    info!(
        "Prefetch engine started (adaptive window, pre-watermarking enabled, provider: {})",
        data_provider.name()
    );

    loop {
        sleep(Duration::from_millis(200)).await;

        let window = window_size.load(Ordering::Relaxed);

        // Refill segment queue if running low
        if segment_queue.len() < window / 2 {
            // List segments from data provider
            match data_provider.list_segments(&last_prefix, window * 2).await {
                Ok(segments) => {
                    if !segments.is_empty() {
                        info!(
                            "Discovered {} segments from provider (prefix: '{}')",
                            segments.len(),
                            last_prefix
                        );
                        
                        // Update last prefix for pagination
                        if let Some(last_seg) = segments.last() {
                            last_prefix = last_seg.clone();
                        }
                        
                        segment_queue.extend(segments);
                    } else {
                        // No more segments, wait before retrying
                        sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                }
                Err(e) => {
                    warn!("Failed to list segments from provider: {}", e);
                    // Fallback to sequential naming for backward compatibility
                    segment_queue = (0..window)
                        .map(|i| format!("seg_{:05}", i))
                        .collect();
                }
            }
        }

        // Take next batch of segments to prefetch
        let next_segments: Vec<String> = segment_queue
            .drain(..window.min(segment_queue.len()))
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
            let resilience_manager = resilience_manager.clone();

            handles.push(tokio::spawn(async move {
                // Skip prefetch if in cache-only mode
                if resilience_manager.is_cache_only_mode() {
                    return;
                }
                
                match data_provider.download(&seg_id).await {
                    Ok(data) => {
                        // Download successful - mark in resilience manager
                        resilience_manager.mark_download_success();
                        
                        // Pre-process during prefetch (OFF the GPU serving path)
                        let final_data = match pipeline.process(data, &config).await {
                            Ok(processed) => processed,
                            Err(e) => {
                                warn!("Prefetch processing failed for {}: {}", seg_id, e);
                                return;
                            }
                        };

                        // Insert pre-watermarked data into cache
                        cache.insert(seg_id, final_data);
                    }
                    Err(e) => {
                        // Download failed - mark in resilience manager
                        resilience_manager.mark_download_failure();
                        warn!("Prefetch download failed for {}: {}", seg_id, e);
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

        // No counter increment - we're using real segment discovery

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

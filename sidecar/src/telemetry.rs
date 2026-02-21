use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use std::sync::Arc;
use tokio::time::sleep;
use tokio_util::sync::CancellationToken;
use crate::config::Config;
use crate::auth::TokenRefresher;

#[derive(Serialize, Deserialize)]
pub struct AuthResponse {
    pub sts_token: String,
    pub session_id: String,
    pub expires_at: String,
}

#[derive(Serialize)]
struct AuthRequest {
    lease_id: String,
}

pub async fn authenticate(config: &Config) -> Result<AuthResponse> {
    let client = reqwest::Client::new();
    
    let resp = client
        .post(format!("{}/api/v1/sidecar/auth", config.base_url))
        .header("X-API-Key", &config.api_key)
        .json(&AuthRequest {
            lease_id: config.lease_id.clone(),
        })
        .send()
        .await?;

    let auth: AuthResponse = resp.json().await?;
    Ok(auth)
}

pub async fn telemetry_loop(
    config: Config, 
    token_refresher: Arc<TokenRefresher>,
    cache: Arc<crate::cache::SegmentCache>
) -> Result<()> {
    let client = reqwest::Client::new();
    let mut request_count: u64 = 0;
    let mut error_count: u64 = 0;
    
    loop {
        sleep(Duration::from_secs(10)).await;
        
        // Collect real telemetry data and format according to backend schema
        // Backend expects: { segmentId, timestamp, eventType, bytesProcessed?, latencyMs?, metadata? }
        let now = chrono::Utc::now().to_rfc3339();
        let cache_hits = cache.hits();
        let cache_misses = cache.misses();
        let cache_hit_rate = {
            let h = cache_hits as f64;
            let m = cache_misses as f64;
            if (h + m) == 0.0 { 0.0 } else { h / (h + m) }
        };

        // Build logs compatible with API schema
        let (processed_bytes, redactions) = crate::metrics::snapshot();

        let (fb_diar, fb_audio_noop, fb_ocr_stub, fb_nifti_stub, fb_nlp_regex) = crate::metrics::snapshot_fallbacks();

        let logs = vec![
            // Aggregate serve event for the window
            serde_json::json!({
                "segmentId": "aggregate",
                "timestamp": now,
                "eventType": "serve",
                "bytesProcessed": processed_bytes,
                "latencyMs": 0,      // not tracked at this layer
                "metadata": {
                    "cache_hit_rate": cache_hit_rate,
                    "cache_entries": cache.len(),
                    "cache_size_bytes": cache.current_bytes(),
                    "cache_max_bytes": cache.max_bytes(),
                    "request_count": request_count,
                    "error_count": error_count,
                    "redactions": redactions,
                    "fallbacks": {
                        "audio_diarization_mock": fb_diar,
                        "audio_redaction_noop": fb_audio_noop,
                        "dicom_ocr_stub": fb_ocr_stub,
                        "dicom_nifti_stub": fb_nifti_stub,
                        "nlp_regex_fallback": fb_nlp_regex,
                    }
                }
            }),
            // Cache hit aggregate event
            serde_json::json!({
                "segmentId": "aggregate",
                "timestamp": now,
                "eventType": "cache_hit",
                "metadata": { "count": cache_hits }
            }),
            // Cache miss aggregate event
            serde_json::json!({
                "segmentId": "aggregate",
                "timestamp": now,
                "eventType": "cache_miss",
                "metadata": { "count": cache_misses }
            }),
        ];
        
        // Get current session_id from token refresher (may have been refreshed)
        let current_session_id = token_refresher.get_session_id().await;
        
        match client
            .post(format!("{}/api/v1/sidecar/telemetry", config.base_url))
            .header("X-API-Key", &config.api_key)
            .json(&serde_json::json!({
                "sessionId": current_session_id,
                "logs": logs,
            }))
            .send()
            .await
        {
            Ok(_) => {
                request_count += 1;
            }
            Err(e) => {
                error_count += 1;
                tracing::warn!("Failed to send telemetry: {}", e);
            }
        }
    }
}

pub async fn kill_switch_loop(
    config: Config,
    token_refresher: Arc<TokenRefresher>,
    shutdown_token: CancellationToken,
) -> Result<()> {
    let client = reqwest::Client::new();
    
    loop {
        tokio::select! {
            _ = sleep(Duration::from_secs(10)) => {
                // Get current session_id from token refresher (may have been refreshed)
                let current_session_id = token_refresher.get_session_id().await;
                
                match client
                    .get(format!("{}/api/v1/sidecar/kill-switch", config.base_url))
                    .query(&[("sessionId", &current_session_id)])
                    .send()
                    .await
                {
                    Ok(resp) => {
                        #[derive(Deserialize)]
                        struct KillSwitchResponse {
                            killed: bool,
                        }

                        match resp.json::<KillSwitchResponse>().await {
                            Ok(result) if result.killed => {
                                tracing::warn!("❌ Kill switch activated - initiating graceful shutdown");
                                shutdown_token.cancel();
                                return Ok(());
                            }
                            Ok(_) => {}
                            Err(e) => {
                                tracing::warn!("Failed to parse kill switch response: {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Failed to check kill switch: {}", e);
                    }
                }
            }
            _ = shutdown_token.cancelled() => {
                tracing::info!("Kill switch loop received shutdown signal");
                return Ok(());
            }
        }
    }
}

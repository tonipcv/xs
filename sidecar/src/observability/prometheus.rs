use axum::{Router, routing::get, response::IntoResponse, Json};
use prometheus::{Encoder, TextEncoder, Registry, Counter, Gauge, Histogram, HistogramOpts};
use std::sync::Arc;
use lazy_static::lazy_static;
use tracing::{info, error};

lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    
    pub static ref SEGMENTS_SERVED: Counter = Counter::new(
        "xase_segments_served_total",
        "Total number of segments served to training pods"
    ).unwrap();
    
    pub static ref CACHE_HIT_RATE: Gauge = Gauge::new(
        "xase_cache_hit_rate",
        "Cache hit rate (0.0 to 1.0)"
    ).unwrap();
    
    pub static ref CACHE_SIZE_BYTES: Gauge = Gauge::new(
        "xase_cache_size_bytes",
        "Current cache size in bytes"
    ).unwrap();
    
    pub static ref CACHE_ENTRIES: Gauge = Gauge::new(
        "xase_cache_entries",
        "Number of entries in cache"
    ).unwrap();
    
    pub static ref BYTES_PROCESSED: Counter = Counter::new(
        "xase_bytes_processed_total",
        "Total bytes processed through pipelines"
    ).unwrap();
    
    pub static ref REDACTIONS: Counter = Counter::new(
        "xase_redactions_total",
        "Total PHI redactions performed"
    ).unwrap();
    
    pub static ref DATA_PROVIDER_REQUESTS: Counter = Counter::new(
        "xase_data_provider_requests_total",
        "Total requests to data provider (S3/PACS/FHIR)"
    ).unwrap();
    
    pub static ref DATA_PROVIDER_ERRORS: Counter = Counter::new(
        "xase_data_provider_errors_total",
        "Total errors from data provider"
    ).unwrap();
    
    pub static ref SERVE_LATENCY: Histogram = Histogram::with_opts(
        HistogramOpts::new(
            "xase_serve_latency_seconds",
            "Latency of segment serving via Unix socket"
        ).buckets(vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0])
    ).unwrap();
    
    pub static ref PREFETCH_LATENCY: Histogram = Histogram::with_opts(
        HistogramOpts::new(
            "xase_prefetch_latency_seconds",
            "Latency of prefetch operations"
        ).buckets(vec![0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 30.0])
    ).unwrap();
    
    pub static ref CACHE_ONLY_MODE: Gauge = Gauge::new(
        "xase_cache_only_mode",
        "1 if in cache-only mode (Brain unavailable), 0 otherwise"
    ).unwrap();
    
    pub static ref SECONDS_SINCE_LAST_AUTH: Gauge = Gauge::new(
        "xase_seconds_since_last_auth",
        "Seconds since last successful authentication with Brain"
    ).unwrap();
}

/// Initialize Prometheus metrics registry
pub fn init_metrics() {
    if let Err(e) = REGISTRY.register(Box::new(SEGMENTS_SERVED.clone())) {
        error!("Failed to register SEGMENTS_SERVED metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(CACHE_HIT_RATE.clone())) {
        error!("Failed to register CACHE_HIT_RATE metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(CACHE_SIZE_BYTES.clone())) {
        error!("Failed to register CACHE_SIZE_BYTES metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(CACHE_ENTRIES.clone())) {
        error!("Failed to register CACHE_ENTRIES metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(BYTES_PROCESSED.clone())) {
        error!("Failed to register BYTES_PROCESSED metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(REDACTIONS.clone())) {
        error!("Failed to register REDACTIONS metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(DATA_PROVIDER_REQUESTS.clone())) {
        error!("Failed to register DATA_PROVIDER_REQUESTS metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(DATA_PROVIDER_ERRORS.clone())) {
        error!("Failed to register DATA_PROVIDER_ERRORS metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(SERVE_LATENCY.clone())) {
        error!("Failed to register SERVE_LATENCY metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(PREFETCH_LATENCY.clone())) {
        error!("Failed to register PREFETCH_LATENCY metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(CACHE_ONLY_MODE.clone())) {
        error!("Failed to register CACHE_ONLY_MODE metric: {}", e);
    }
    if let Err(e) = REGISTRY.register(Box::new(SECONDS_SINCE_LAST_AUTH.clone())) {
        error!("Failed to register SECONDS_SINCE_LAST_AUTH metric: {}", e);
    }
    
    info!("Prometheus metrics registry initialized");
}

/// Prometheus metrics endpoint handler
async fn metrics_handler() -> impl IntoResponse {
    let encoder = TextEncoder::new();
    let metric_families = REGISTRY.gather();
    let mut buffer = vec![];
    
    if let Err(e) = encoder.encode(&metric_families, &mut buffer) {
        error!("Failed to encode metrics: {}", e);
        return (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to encode metrics".to_string()
        );
    }
    
    match String::from_utf8(buffer) {
        Ok(metrics) => (axum::http::StatusCode::OK, metrics),
        Err(e) => {
            error!("Failed to convert metrics to string: {}", e);
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to convert metrics".to_string()
            )
        }
    }
}

/// Health check endpoint handler
async fn health_handler() -> impl IntoResponse {
    let health_status = serde_json::json!({
        "status": "healthy",
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "service": "xase-sidecar",
        "version": env!("CARGO_PKG_VERSION"),
    });
    
    Json(health_status)
}

/// Readiness check endpoint handler
async fn readiness_handler() -> impl IntoResponse {
    // Check if system is ready to serve
    // For now, always ready (can be enhanced to check cache, auth, etc.)
    let ready = true;
    
    if ready {
        let status = serde_json::json!({
            "ready": true,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        });
        (axum::http::StatusCode::OK, Json(status))
    } else {
        let status = serde_json::json!({
            "ready": false,
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "reason": "System not ready"
        });
        (axum::http::StatusCode::SERVICE_UNAVAILABLE, Json(status))
    }
}

/// Start Prometheus metrics HTTP server
/// This allows hospitals to scrape metrics locally for Grafana
pub async fn start_metrics_server(bind_addr: String) -> anyhow::Result<()> {
    init_metrics();
    
    let app = Router::new()
        .route("/metrics", get(metrics_handler))
        .route("/health", get(health_handler))
        .route("/ready", get(readiness_handler));
    
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;
    info!("✓ Prometheus metrics server listening on {}", bind_addr);
    info!("  - Metrics: http://{}/metrics", bind_addr);
    info!("  - Health:  http://{}/health", bind_addr);
    info!("  - Ready:   http://{}/ready", bind_addr);
    
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_metrics_initialization() {
        init_metrics();
        
        // Test that metrics can be incremented
        SEGMENTS_SERVED.inc();
        assert!(SEGMENTS_SERVED.get() > 0.0);
        
        CACHE_HIT_RATE.set(0.95);
        assert_eq!(CACHE_HIT_RATE.get(), 0.95);
    }
}

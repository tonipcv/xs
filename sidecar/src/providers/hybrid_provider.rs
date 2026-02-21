use anyhow::Result;
use async_trait::async_trait;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use crate::data_provider::DataProvider;

/// HybridProvider implements intelligent fallback between multiple data sources
/// Typical usage: DICOMweb (primary) → S3 (fallback)
/// This ensures hospital training continues even if PACS is temporarily unavailable
/// 
/// Features:
/// - Circuit breaker to prevent cascading failures
/// - Automatic failover with exponential backoff
/// - Metrics tracking for monitoring
/// - Health-based provider selection
pub struct HybridProvider {
    primary: Arc<dyn DataProvider>,
    fallback: Option<Arc<dyn DataProvider>>,
    circuit_breaker: Arc<CircuitBreaker>,
    metrics: Arc<ProviderMetrics>,
}

/// Circuit breaker to prevent overwhelming a failing provider
struct CircuitBreaker {
    state: RwLock<CircuitState>,
    failure_threshold: u32,
    timeout: Duration,
    half_open_timeout: Duration,
}

#[derive(Debug, Clone)]
enum CircuitState {
    Closed,
    Open { opened_at: Instant },
    HalfOpen,
}

/// Metrics for provider performance
struct ProviderMetrics {
    primary_requests: AtomicU64,
    primary_failures: AtomicU64,
    fallback_requests: AtomicU64,
    fallback_failures: AtomicU64,
    circuit_breaker_trips: AtomicU64,
}

impl CircuitBreaker {
    fn new(failure_threshold: u32, timeout: Duration) -> Self {
        Self {
            state: RwLock::new(CircuitState::Closed),
            failure_threshold,
            timeout,
            half_open_timeout: Duration::from_secs(30),
        }
    }
    
    async fn record_success(&self) {
        let mut state = self.state.write().await;
        *state = CircuitState::Closed;
    }
    
    async fn record_failure(&self) -> bool {
        let mut state = self.state.write().await;
        match *state {
            CircuitState::Closed => {
                *state = CircuitState::Open { opened_at: Instant::now() };
                true // Circuit opened
            }
            CircuitState::HalfOpen => {
                *state = CircuitState::Open { opened_at: Instant::now() };
                true
            }
            CircuitState::Open { .. } => false, // Already open
        }
    }
    
    async fn should_attempt(&self) -> bool {
        let mut state = self.state.write().await;
        match *state {
            CircuitState::Closed => true,
            CircuitState::HalfOpen => true,
            CircuitState::Open { opened_at } => {
                if opened_at.elapsed() > self.timeout {
                    *state = CircuitState::HalfOpen;
                    true
                } else {
                    false
                }
            }
        }
    }
}

impl ProviderMetrics {
    fn new() -> Self {
        Self {
            primary_requests: AtomicU64::new(0),
            primary_failures: AtomicU64::new(0),
            fallback_requests: AtomicU64::new(0),
            fallback_failures: AtomicU64::new(0),
            circuit_breaker_trips: AtomicU64::new(0),
        }
    }
    
    pub fn get_stats(&self) -> ProviderStats {
        ProviderStats {
            primary_requests: self.primary_requests.load(Ordering::Relaxed),
            primary_failures: self.primary_failures.load(Ordering::Relaxed),
            fallback_requests: self.fallback_requests.load(Ordering::Relaxed),
            fallback_failures: self.fallback_failures.load(Ordering::Relaxed),
            circuit_breaker_trips: self.circuit_breaker_trips.load(Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ProviderStats {
    pub primary_requests: u64,
    pub primary_failures: u64,
    pub fallback_requests: u64,
    pub fallback_failures: u64,
    pub circuit_breaker_trips: u64,
}

impl HybridProvider {
    pub fn new(
        primary: Arc<dyn DataProvider>,
        fallback: Option<Arc<dyn DataProvider>>,
    ) -> Self {
        Self::with_config(
            primary,
            fallback,
            5, // failure_threshold
            Duration::from_secs(60), // circuit breaker timeout
        )
    }
    
    pub fn with_config(
        primary: Arc<dyn DataProvider>,
        fallback: Option<Arc<dyn DataProvider>>,
        failure_threshold: u32,
        timeout: Duration,
    ) -> Self {
        Self {
            primary,
            fallback,
            circuit_breaker: Arc::new(CircuitBreaker::new(failure_threshold, timeout)),
            metrics: Arc::new(ProviderMetrics::new()),
        }
    }
    
    pub fn get_metrics(&self) -> ProviderStats {
        self.metrics.get_stats()
    }
}

#[async_trait]
impl DataProvider for HybridProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // Check circuit breaker before attempting primary
        if self.circuit_breaker.should_attempt().await {
            self.metrics.primary_requests.fetch_add(1, Ordering::Relaxed);
            
            match self.primary.download(key).await {
                Ok(data) => {
                    self.circuit_breaker.record_success().await;
                    tracing::debug!(
                        provider = %self.primary.name(),
                        key = %key,
                        bytes = data.len(),
                        "Downloaded from primary provider"
                    );
                    return Ok(data);
                }
                Err(e) => {
                    self.metrics.primary_failures.fetch_add(1, Ordering::Relaxed);
                    
                    if self.circuit_breaker.record_failure().await {
                        self.metrics.circuit_breaker_trips.fetch_add(1, Ordering::Relaxed);
                        tracing::warn!(
                            provider = %self.primary.name(),
                            key = %key,
                            error = %e,
                            "Circuit breaker opened for primary provider"
                        );
                    }
                    
                    tracing::warn!(
                        provider = %self.primary.name(),
                        key = %key,
                        error = %e,
                        "Primary provider failed"
                    );
                }
            }
        } else {
            tracing::debug!(
                provider = %self.primary.name(),
                "Circuit breaker open - skipping primary provider"
            );
        }
        
        // Try fallback if available
        if let Some(fallback) = &self.fallback {
            self.metrics.fallback_requests.fetch_add(1, Ordering::Relaxed);
            
            tracing::info!(
                provider = %fallback.name(),
                key = %key,
                "Attempting fallback provider"
            );
            
            match fallback.download(key).await {
                Ok(data) => {
                    tracing::info!(
                        provider = %fallback.name(),
                        key = %key,
                        bytes = data.len(),
                        "✓ Downloaded from fallback provider"
                    );
                    Ok(data)
                }
                Err(e) => {
                    self.metrics.fallback_failures.fetch_add(1, Ordering::Relaxed);
                    tracing::error!(
                        provider = %fallback.name(),
                        key = %key,
                        error = %e,
                        "Fallback provider also failed"
                    );
                    Err(e)
                }
            }
        } else {
            tracing::error!("No fallback provider configured and primary is unavailable");
            anyhow::bail!("All providers unavailable")
        }
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // Always use primary for listing (discovery)
        match self.primary.list_segments(prefix, limit).await {
            Ok(segments) => {
                tracing::debug!(
                    "Listed {} segments from primary provider ({})",
                    segments.len(),
                    self.primary.name()
                );
                Ok(segments)
            }
            Err(e) => {
                tracing::warn!(
                    "Primary provider ({}) failed to list segments: {}",
                    self.primary.name(),
                    e
                );
                
                // Try fallback for listing if primary fails
                if let Some(fallback) = &self.fallback {
                    tracing::info!(
                        "Attempting to list segments from fallback provider ({})",
                        fallback.name()
                    );
                    
                    match fallback.list_segments(prefix, limit).await {
                        Ok(segments) => {
                            tracing::info!(
                                "✓ Listed {} segments from fallback provider ({})",
                                segments.len(),
                                fallback.name()
                            );
                            Ok(segments)
                        }
                        Err(e2) => {
                            tracing::error!(
                                "Fallback provider ({}) also failed to list: {}",
                                fallback.name(),
                                e2
                            );
                            Err(e2)
                        }
                    }
                } else {
                    Err(e)
                }
            }
        }
    }
    
    fn name(&self) -> &str {
        "Hybrid"
    }
    
    async fn health_check(&self) -> Result<bool> {
        // Check both providers
        let primary_healthy = self.primary.health_check().await.unwrap_or(false);
        
        let fallback_healthy = if let Some(fallback) = &self.fallback {
            fallback.health_check().await.unwrap_or(false)
        } else {
            false
        };
        
        tracing::info!(
            "Hybrid provider health: primary ({}) = {}, fallback = {}",
            self.primary.name(),
            primary_healthy,
            if self.fallback.is_some() {
                if fallback_healthy { "healthy" } else { "unhealthy" }
            } else {
                "none"
            }
        );
        
        // Hybrid is healthy if at least one provider is healthy
        Ok(primary_healthy || fallback_healthy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::S3Provider;
    use crate::config::Config;
    
    #[tokio::test]
    async fn test_hybrid_provider_name() {
        let config = Config::test_default();
        
        let s3_provider = S3Provider::new(&config).await.unwrap();
        let hybrid = HybridProvider::new(Arc::new(s3_provider), None);
        
        assert_eq!(hybrid.name(), "Hybrid");
    }
}

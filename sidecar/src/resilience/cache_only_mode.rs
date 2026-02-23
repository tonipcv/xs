use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::time::{sleep, Duration};
use tracing::{info, warn, debug};

/// ResilienceManager handles graceful degradation when Xase Brain is unavailable
/// This solves the critical problem: if Brain goes down, $5k/hour GPU training shouldn't stop
/// 
/// Key features:
/// - Grace period before entering cache-only mode (default: 5 minutes)
/// - Tracks last successful authentication
/// - Automatic recovery when Brain comes back online
/// - Monitoring loop for visibility
pub struct ResilienceManager {
    cache_only_mode: Arc<AtomicBool>,
    last_successful_auth: Arc<AtomicU64>,
    last_successful_download: Arc<AtomicU64>,
    grace_period_seconds: u64,
    download_failures: Arc<AtomicU64>,
    download_successes: Arc<AtomicU64>,
}

impl ResilienceManager {
    pub fn new(grace_period_seconds: u64) -> Self {
        info!(
            "ResilienceManager initialized with grace period: {}s ({}m)",
            grace_period_seconds,
            grace_period_seconds / 60
        );
        
        let now = chrono::Utc::now().timestamp() as u64;
        
        Self {
            cache_only_mode: Arc::new(AtomicBool::new(false)),
            last_successful_auth: Arc::new(AtomicU64::new(now)),
            last_successful_download: Arc::new(AtomicU64::new(now)),
            grace_period_seconds,
            download_failures: Arc::new(AtomicU64::new(0)),
            download_successes: Arc::new(AtomicU64::new(0)),
        }
    }
    
    /// Check if system is in cache-only mode
    pub fn is_cache_only_mode(&self) -> bool {
        self.cache_only_mode.load(Ordering::Relaxed)
    }
    
    /// Mark authentication as successful
    /// This resets the grace period timer and exits cache-only mode
    pub fn mark_auth_success(&self) {
        let now = chrono::Utc::now().timestamp() as u64;
        self.last_successful_auth.store(now, Ordering::Relaxed);
        
        let was_cache_only = self.cache_only_mode.swap(false, Ordering::Relaxed);
        
        if was_cache_only {
            info!("✓ Xase Brain reconnected - exiting CACHE-ONLY MODE");
        }
    }
    
    /// Mark authentication as failed
    /// If grace period has elapsed, enters cache-only mode
    #[allow(dead_code)]
    pub fn mark_auth_failure(&self) {
        let last_success = self.last_successful_auth.load(Ordering::Relaxed);
        let now = chrono::Utc::now().timestamp() as u64;
        let elapsed = now - last_success;
        
        if elapsed > self.grace_period_seconds {
            let was_cache_only = self.cache_only_mode.swap(true, Ordering::Relaxed);
            
            if !was_cache_only {
                warn!(
                    "⚠️  Auth failed for {}s (grace period: {}s) - entering CACHE-ONLY MODE",
                    elapsed,
                    self.grace_period_seconds
                );
                warn!("Training will continue with cached data only");
                warn!("GPU training ($5k/hour) protected from Brain downtime");
            }
        } else {
            let remaining = self.grace_period_seconds - elapsed;
            warn!(
                "Auth failed (elapsed: {}s) - grace period remaining: {}s",
                elapsed,
                remaining
            );
        }
    }
    
    /// Get seconds since last successful auth
    pub fn seconds_since_last_auth(&self) -> u64 {
        let last_success = self.last_successful_auth.load(Ordering::Relaxed);
        let now = chrono::Utc::now().timestamp() as u64;
        now - last_success
    }
    
    /// Mark download as successful
    /// This indicates that data provider is accessible
    pub fn mark_download_success(&self) {
        let now = chrono::Utc::now().timestamp() as u64;
        self.last_successful_download.store(now, Ordering::Relaxed);
        self.download_successes.fetch_add(1, Ordering::Relaxed);
        
        // If we were in cache-only mode due to download failures, exit it
        let was_cache_only = self.cache_only_mode.load(Ordering::Relaxed);
        if was_cache_only {
            let last_auth = self.last_successful_auth.load(Ordering::Relaxed);
            let elapsed_since_auth = now - last_auth;
            
            // Only exit cache-only if auth is also recent
            if elapsed_since_auth < self.grace_period_seconds {
                self.cache_only_mode.store(false, Ordering::Relaxed);
                info!("✓ Downloads successful - exiting CACHE-ONLY MODE");
            }
        }
        
        debug!("Download successful (total: {})", self.download_successes.load(Ordering::Relaxed));
    }
    
    /// Mark download as failed
    /// If grace period has elapsed, enters cache-only mode
    pub fn mark_download_failure(&self) {
        self.download_failures.fetch_add(1, Ordering::Relaxed);
        
        let last_success = self.last_successful_download.load(Ordering::Relaxed);
        let now = chrono::Utc::now().timestamp() as u64;
        let elapsed = now - last_success;
        
        if elapsed > self.grace_period_seconds {
            let was_cache_only = self.cache_only_mode.swap(true, Ordering::Relaxed);
            
            if !was_cache_only {
                warn!(
                    "⚠️  Downloads failed for {}s (grace period: {}s) - entering CACHE-ONLY MODE",
                    elapsed,
                    self.grace_period_seconds
                );
                warn!("Training will continue with cached data only");
            }
        } else {
            let remaining = self.grace_period_seconds - elapsed;
            debug!(
                "Download failed (elapsed: {}s) - grace period remaining: {}s (failures: {})",
                elapsed,
                remaining,
                self.download_failures.load(Ordering::Relaxed)
            );
        }
    }
    
    /// Get download statistics
    pub fn download_stats(&self) -> (u64, u64) {
        let successes = self.download_successes.load(Ordering::Relaxed);
        let failures = self.download_failures.load(Ordering::Relaxed);
        (successes, failures)
    }
    
    /// Start monitoring loop for visibility
    /// This should be spawned as a background task
    pub async fn start_monitoring_loop(self: Arc<Self>) {
        info!("Resilience monitoring loop started");
        
        loop {
            sleep(Duration::from_secs(30)).await;
            
            let (successes, failures) = self.download_stats();
            
            if self.is_cache_only_mode() {
                let elapsed = self.seconds_since_last_auth();
                warn!(
                    "⚠️  CACHE-ONLY MODE ACTIVE - {}s since last successful auth",
                    elapsed
                );
                warn!("Training continues with cached data only");
                warn!("Download stats - successes: {}, failures: {}", successes, failures);
            } else {
                debug!("Resilience OK - download stats: successes={}, failures={}", successes, failures);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_resilience_manager_creation() {
        let manager = ResilienceManager::new(300);
        assert!(!manager.is_cache_only_mode());
    }
    
    #[test]
    fn test_mark_auth_success() {
        let manager = ResilienceManager::new(300);
        manager.mark_auth_success();
        assert!(!manager.is_cache_only_mode());
        assert!(manager.seconds_since_last_auth() < 2);
    }
    
    #[test]
    fn test_grace_period_not_elapsed() {
        let manager = ResilienceManager::new(300);
        manager.mark_auth_success();
        
        // Simulate auth failure immediately (grace period not elapsed)
        manager.mark_auth_failure();
        
        // Should NOT be in cache-only mode yet
        assert!(!manager.is_cache_only_mode());
    }
    
    #[test]
    fn test_grace_period_elapsed() {
        let manager = ResilienceManager::new(1); // 1 second grace period
        
        // Set last auth to 2 seconds ago
        let two_seconds_ago = (chrono::Utc::now().timestamp() - 2) as u64;
        manager.last_successful_auth.store(two_seconds_ago, Ordering::Relaxed);
        
        // Mark auth failure
        manager.mark_auth_failure();
        
        // Should be in cache-only mode
        assert!(manager.is_cache_only_mode());
    }
    
    #[test]
    fn test_recovery_from_cache_only() {
        let manager = ResilienceManager::new(1);
        
        // Enter cache-only mode
        let two_seconds_ago = (chrono::Utc::now().timestamp() - 2) as u64;
        manager.last_successful_auth.store(two_seconds_ago, Ordering::Relaxed);
        manager.mark_auth_failure();
        assert!(manager.is_cache_only_mode());
        
        // Recover
        manager.mark_auth_success();
        assert!(!manager.is_cache_only_mode());
    }
}

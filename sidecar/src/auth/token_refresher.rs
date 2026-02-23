#![allow(dead_code)]
use anyhow::{Result, Context};
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{sleep, Duration};
use tracing::{info, warn, error};
use crate::config::Config;
use crate::telemetry::{authenticate, AuthResponse};

/// TokenRefresher manages automatic STS token refresh for long-running training jobs
/// This solves the critical problem of tokens expiring during 2+ week training runs
/// 
/// Key features:
/// - Automatic refresh at 80% of token lifetime
/// - Thread-safe token access via RwLock
/// - Retry logic with exponential backoff
/// - Graceful degradation if refresh fails
pub struct TokenRefresher {
    config: Config,
    current_token: Arc<RwLock<AuthResponse>>,
}

impl TokenRefresher {
    pub fn new(config: Config, initial_auth: AuthResponse) -> Self {
        info!(
            "TokenRefresher initialized with session: {}",
            initial_auth.session_id
        );
        
        Self {
            config,
            current_token: Arc::new(RwLock::new(initial_auth)),
        }
    }
    
    /// Get current STS token (read-only access)
    pub async fn get_token(&self) -> String {
        self.current_token.read().await.sts_token.clone()
    }
    
    /// Get current session ID (read-only access)
    pub async fn get_session_id(&self) -> String {
        self.current_token.read().await.session_id.clone()
    }
    
    /// Get full auth response (read-only access)
    pub async fn get_auth(&self) -> AuthResponse {
        let guard = self.current_token.read().await;
        AuthResponse {
            sts_token: guard.sts_token.clone(),
            session_id: guard.session_id.clone(),
            expires_at: guard.expires_at.clone(),
        }
    }
    
    /// Calculate seconds until token expires
    fn seconds_until_expiry(expires_at: &str) -> Result<i64> {
        let expires = chrono::DateTime::parse_from_rfc3339(expires_at)
            .context("Invalid expires_at timestamp")?;
        
        let now = chrono::Utc::now();
        let duration = expires.signed_duration_since(now);
        
        Ok(duration.num_seconds())
    }
    
    /// Start the automatic token refresh loop
    /// This should be spawned as a background task
    pub async fn start_refresh_loop(self: Arc<Self>) -> Result<()> {
        info!("Token refresh loop started");
        
        let mut retry_count = 0;
        let max_retries = 5;
        
        loop {
            // Calculate time until token expires
            let (expires_at, session_id) = {
                let token = self.current_token.read().await;
                (token.expires_at.clone(), token.session_id.clone())
            };
            
            let time_until_expiry = match Self::seconds_until_expiry(&expires_at) {
                Ok(seconds) => seconds,
                Err(e) => {
                    error!("Failed to parse token expiry time: {}", e);
                    // Default to 1 hour if parsing fails
                    3600
                }
            };
            
            // Refresh at 80% of lifetime (e.g., if token lasts 1 hour, refresh after 48 minutes)
            // Minimum 60 seconds to avoid too frequent refreshes
            let refresh_in_seconds = ((time_until_expiry as f64 * 0.8).max(60.0) as u64)
                .min(time_until_expiry as u64);
            
            info!(
                "Token (session: {}) expires in {}s, will refresh in {}s",
                session_id,
                time_until_expiry,
                refresh_in_seconds
            );
            
            sleep(Duration::from_secs(refresh_in_seconds)).await;
            
            // Attempt to refresh token
            info!("Attempting to refresh STS token...");
            
            match authenticate(&self.config).await {
                Ok(new_auth) => {
                    info!(
                        "✓ Token refreshed successfully (new session: {}, expires: {})",
                        new_auth.session_id,
                        new_auth.expires_at
                    );
                    
                    // Update token
                    let mut token = self.current_token.write().await;
                    *token = new_auth;
                    
                    // Reset retry count on success
                    retry_count = 0;
                }
                Err(e) => {
                    retry_count += 1;
                    error!(
                        "Failed to refresh token (attempt {}/{}): {}",
                        retry_count,
                        max_retries,
                        e
                    );
                    
                    if retry_count >= max_retries {
                        error!(
                            "⚠️  Token refresh failed {} times. System may enter degraded mode.",
                            max_retries
                        );
                        // Don't exit - keep trying with exponential backoff
                        retry_count = 0; // Reset to continue trying
                    }
                    
                    // Exponential backoff: 60s, 120s, 240s, 480s, 960s
                    let backoff_seconds = 60 * (2_u64.pow((retry_count - 1).min(4)));
                    warn!("Retrying token refresh in {}s...", backoff_seconds);
                    sleep(Duration::from_secs(backoff_seconds)).await;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_seconds_until_expiry() {
        // Create a timestamp 1 hour in the future
        let future = chrono::Utc::now() + chrono::Duration::hours(1);
        let expires_at = future.to_rfc3339();
        
        let seconds = TokenRefresher::seconds_until_expiry(&expires_at).unwrap();
        
        // Should be approximately 3600 seconds (allow 5 second margin for test execution)
        assert!(seconds >= 3595 && seconds <= 3605);
    }
    
    #[test]
    fn test_seconds_until_expiry_past() {
        // Create a timestamp 1 hour in the past
        let past = chrono::Utc::now() - chrono::Duration::hours(1);
        let expires_at = past.to_rfc3339();
        
        let seconds = TokenRefresher::seconds_until_expiry(&expires_at).unwrap();
        
        // Should be negative
        assert!(seconds < 0);
    }
}

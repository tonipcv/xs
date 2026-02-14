use anyhow::{Result, Context};
use std::time::Duration;
use tokio::time::sleep;
use tracing::{warn, error};

/// Módulo para network resilience com exponential backoff
/// 
/// Problema: Rede entre clouds (AWS ↔ Azure) falha ocasionalmente.
/// Sidecar crasha, training para, downtime de 4 horas.
/// 
/// Solução: Retry automático com exponential backoff + circuit breaker.

/// Configuração de retry
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Número máximo de tentativas
    pub max_attempts: u32,
    
    /// Delay inicial (ms)
    pub initial_backoff_ms: u64,
    
    /// Multiplicador de backoff (2 = exponencial)
    pub backoff_multiplier: u64,
    
    /// Delay máximo (ms)
    pub max_backoff_ms: u64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            initial_backoff_ms: 100,
            backoff_multiplier: 2,
            max_backoff_ms: 10_000,
        }
    }
}

/// Circuit Breaker para fail-fast após muitas falhas
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    /// Número de falhas consecutivas
    failures: u32,
    
    /// Threshold para abrir circuito
    failure_threshold: u32,
    
    /// Estado do circuito
    state: CircuitState,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CircuitState {
    Closed,  // Normal operation
    Open,    // Fail fast
    HalfOpen, // Testing recovery
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32) -> Self {
        Self {
            failures: 0,
            failure_threshold,
            state: CircuitState::Closed,
        }
    }
    
    pub fn record_success(&mut self) {
        self.failures = 0;
        self.state = CircuitState::Closed;
    }
    
    pub fn record_failure(&mut self) {
        self.failures += 1;
        if self.failures >= self.failure_threshold {
            self.state = CircuitState::Open;
            error!("Circuit breaker opened after {} failures", self.failures);
        }
    }
    
    pub fn is_open(&self) -> bool {
        self.state == CircuitState::Open
    }
    
    pub fn attempt_reset(&mut self) {
        if self.state == CircuitState::Open {
            self.state = CircuitState::HalfOpen;
        }
    }
}

/// Executa operação com retry automático e exponential backoff
pub async fn retry_with_backoff<F, Fut, T>(
    operation: F,
    config: &RetryConfig,
    circuit_breaker: &mut CircuitBreaker,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    // Check circuit breaker
    if circuit_breaker.is_open() {
        return Err(anyhow::anyhow!("Circuit breaker is open, failing fast"));
    }
    
    let mut attempts = 0;
    let mut backoff = Duration::from_millis(config.initial_backoff_ms);
    
    loop {
        attempts += 1;
        
        match operation().await {
            Ok(result) => {
                // Success - reset circuit breaker
                circuit_breaker.record_success();
                return Ok(result);
            }
            Err(e) => {
                if attempts >= config.max_attempts {
                    // Max attempts reached - record failure and return error
                    circuit_breaker.record_failure();
                    error!("Operation failed after {} attempts: {}", attempts, e);
                    return Err(e).context(format!("Failed after {} attempts", attempts));
                }
                
                // Log warning and retry
                warn!(
                    "Operation failed (attempt {}/{}): {}. Retrying in {:?}...",
                    attempts, config.max_attempts, e, backoff
                );
                
                // Wait with exponential backoff
                sleep(backoff).await;
                
                // Increase backoff (capped at max)
                backoff = Duration::from_millis(
                    (backoff.as_millis() as u64 * config.backoff_multiplier)
                        .min(config.max_backoff_ms)
                );
            }
        }
    }
}

/// Wrapper para download S3 com retry automático
pub async fn download_with_retry<F, Fut>(
    download_fn: F,
    key: &str,
    config: &RetryConfig,
    circuit_breaker: &mut CircuitBreaker,
) -> Result<Vec<u8>>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<Vec<u8>>>,
{
    retry_with_backoff(
        || download_fn(),
        config,
        circuit_breaker,
    ).await
    .context(format!("Failed to download {}", key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::Arc;
    
    #[tokio::test]
    async fn test_retry_success_after_failures() {
        let config = RetryConfig {
            max_attempts: 5,
            initial_backoff_ms: 10,
            backoff_multiplier: 2,
            max_backoff_ms: 100,
        };
        
        let mut circuit_breaker = CircuitBreaker::new(10);
        let attempt_count = Arc::new(AtomicU32::new(0));
        let attempt_count_clone = attempt_count.clone();
        
        let result = retry_with_backoff(
            || {
                let count = attempt_count_clone.clone();
                async move {
                    let current = count.fetch_add(1, Ordering::SeqCst);
                    if current < 2 {
                        Err(anyhow::anyhow!("Simulated failure"))
                    } else {
                        Ok("Success")
                    }
                }
            },
            &config,
            &mut circuit_breaker,
        ).await;
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Success");
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
    }
    
    #[tokio::test]
    async fn test_retry_max_attempts() {
        let config = RetryConfig {
            max_attempts: 3,
            initial_backoff_ms: 10,
            backoff_multiplier: 2,
            max_backoff_ms: 100,
        };
        
        let mut circuit_breaker = CircuitBreaker::new(10);
        let attempt_count = Arc::new(AtomicU32::new(0));
        let attempt_count_clone = attempt_count.clone();
        
        let result = retry_with_backoff(
            || {
                let count = attempt_count_clone.clone();
                async move {
                    count.fetch_add(1, Ordering::SeqCst);
                    Err::<(), _>(anyhow::anyhow!("Always fails"))
                }
            },
            &config,
            &mut circuit_breaker,
        ).await;
        
        assert!(result.is_err());
        assert_eq!(attempt_count.load(Ordering::SeqCst), 3);
    }
    
    #[test]
    fn test_circuit_breaker() {
        let mut cb = CircuitBreaker::new(3);
        
        // Initially closed
        assert_eq!(cb.state, CircuitState::Closed);
        assert!(!cb.is_open());
        
        // Record failures
        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.state, CircuitState::Closed);
        
        cb.record_failure();
        assert_eq!(cb.state, CircuitState::Open);
        assert!(cb.is_open());
        
        // Success resets
        cb.record_success();
        assert_eq!(cb.state, CircuitState::Closed);
        assert_eq!(cb.failures, 0);
    }
}

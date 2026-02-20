use anyhow::Result;
use std::path::PathBuf;
use std::time::Duration;
use tempfile::TempDir;

#[cfg(test)]
mod metadata_store_tests {
    use super::*;
    use xase_sidecar::metadata_store::{MetadataStore, AudioMetadata, DiarizationSegment, ProcessingStats};
    use std::collections::HashMap;
    
    #[tokio::test]
    async fn test_complete_metadata_workflow() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let store = MetadataStore::new(temp_dir.path().to_path_buf());
        
        // Create metadata with diarization segments
        let metadata = AudioMetadata {
            session_id: "session_integration_001".to_string(),
            dataset_id: "dataset_hospital_a".to_string(),
            lease_id: "lease_training_001".to_string(),
            tenant_id: "tenant_hospital_a".to_string(),
            speaker_segments: vec![
                DiarizationSegment {
                    speaker_id: "DOCTOR_01".to_string(),
                    start_sec: 0.0,
                    end_sec: 15.5,
                    confidence: Some(0.92),
                    metadata: {
                        let mut m = HashMap::new();
                        m.insert("role".to_string(), "physician".to_string());
                        m
                    },
                },
                DiarizationSegment {
                    speaker_id: "PATIENT_01".to_string(),
                    start_sec: 15.5,
                    end_sec: 45.0,
                    confidence: Some(0.88),
                    metadata: HashMap::new(),
                },
            ],
            redacted_regions: vec![],
            processing_stats: ProcessingStats {
                duration_sec: 45.0,
                sample_rate: 16000,
                channels: 1,
                f0_shift_applied: true,
                f0_shift_semitones: 2.0,
                diarization_enabled: true,
                redaction_enabled: false,
                processing_time_ms: 2500,
            },
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        
        // Store metadata
        store.store(&metadata).await?;
        
        // Load and verify
        let loaded = store.load("tenant_hospital_a", "dataset_hospital_a", "session_integration_001").await?;
        assert_eq!(loaded.session_id, "session_integration_001");
        assert_eq!(loaded.speaker_segments.len(), 2);
        assert_eq!(loaded.speaker_segments[0].speaker_id, "DOCTOR_01");
        assert_eq!(loaded.speaker_segments[1].speaker_id, "PATIENT_01");
        
        // List sessions
        let sessions = store.list_sessions("tenant_hospital_a", "dataset_hospital_a").await?;
        assert_eq!(sessions.len(), 1);
        assert!(sessions.contains(&"session_integration_001".to_string()));
        
        // Get dataset stats
        let stats = store.get_dataset_stats("tenant_hospital_a", "dataset_hospital_a").await?;
        assert_eq!(stats.session_count, 1);
        assert_eq!(stats.total_duration_sec, 45.0);
        assert_eq!(stats.total_segments, 2);
        
        // Delete metadata
        store.delete("tenant_hospital_a", "dataset_hospital_a", "session_integration_001").await?;
        
        let sessions_after = store.list_sessions("tenant_hospital_a", "dataset_hospital_a").await?;
        assert_eq!(sessions_after.len(), 0);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_multiple_sessions_aggregation() -> Result<()> {
        let temp_dir = TempDir::new()?;
        let store = MetadataStore::new(temp_dir.path().to_path_buf());
        
        // Create multiple sessions
        for i in 0..5 {
            let metadata = AudioMetadata {
                session_id: format!("session_{}", i),
                dataset_id: "dataset_test".to_string(),
                lease_id: "lease_test".to_string(),
                tenant_id: "tenant_test".to_string(),
                speaker_segments: vec![
                    DiarizationSegment {
                        speaker_id: format!("SPEAKER_{}", i % 2),
                        start_sec: 0.0,
                        end_sec: 10.0,
                        confidence: Some(0.9),
                        metadata: HashMap::new(),
                    },
                ],
                redacted_regions: vec![],
                processing_stats: ProcessingStats {
                    duration_sec: 10.0,
                    sample_rate: 16000,
                    channels: 1,
                    f0_shift_applied: false,
                    f0_shift_semitones: 0.0,
                    diarization_enabled: true,
                    redaction_enabled: false,
                    processing_time_ms: 1000,
                },
                created_at: chrono::Utc::now(),
                updated_at: chrono::Utc::now(),
            };
            store.store(&metadata).await?;
        }
        
        let stats = store.get_dataset_stats("tenant_test", "dataset_test").await?;
        assert_eq!(stats.session_count, 5);
        assert_eq!(stats.total_duration_sec, 50.0);
        assert_eq!(stats.total_segments, 5);
        assert_eq!(stats.total_processing_time_ms, 5000);
        
        Ok(())
    }
}

#[cfg(test)]
mod redis_integration_tests {
    use super::*;
    use xase_sidecar::redis_client::{RedisClient, CacheManager};
    use serde::{Serialize, Deserialize};
    
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestData {
        id: String,
        value: i32,
        metadata: HashMap<String, String>,
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis running
    async fn test_redis_cache_workflow() -> Result<()> {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "integration_test")?;
        
        // Test basic set/get
        let data = TestData {
            id: "test_001".to_string(),
            value: 42,
            metadata: {
                let mut m = HashMap::new();
                m.insert("type".to_string(), "test".to_string());
                m
            },
        };
        
        redis.set("key1", &data, None).await?;
        let retrieved: Option<TestData> = redis.get("key1").await?;
        assert_eq!(retrieved, Some(data.clone()));
        
        // Test TTL
        redis.set("ttl_key", &data, Some(Duration::from_secs(2))).await?;
        assert!(redis.exists("ttl_key").await?);
        
        tokio::time::sleep(Duration::from_secs(3)).await;
        assert!(!redis.exists("ttl_key").await?);
        
        // Test counter
        let count1 = redis.incr("counter").await?;
        let count2 = redis.incr("counter").await?;
        assert_eq!(count1, 1);
        assert_eq!(count2, 2);
        
        // Cleanup
        redis.flush_prefix().await?;
        
        Ok(())
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis running
    async fn test_cache_manager() -> Result<()> {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "cache_test")?;
        let cache = CacheManager::new(redis, Duration::from_secs(60));
        
        let mut compute_count = 0;
        
        // First call - cache miss
        let result1 = cache.get_or_compute("expensive_key", || async {
            compute_count += 1;
            Ok(TestData {
                id: "computed".to_string(),
                value: 999,
                metadata: HashMap::new(),
            })
        }).await?;
        
        assert_eq!(result1.value, 999);
        assert_eq!(compute_count, 1);
        
        // Second call - cache hit
        let result2 = cache.get_or_compute("expensive_key", || async {
            compute_count += 1;
            Ok(TestData {
                id: "computed".to_string(),
                value: 999,
                metadata: HashMap::new(),
            })
        }).await?;
        
        assert_eq!(result2.value, 999);
        assert_eq!(compute_count, 1); // Should not compute again
        
        // Invalidate and recompute
        cache.invalidate("expensive_key").await?;
        
        let result3 = cache.get_or_compute("expensive_key", || async {
            compute_count += 1;
            Ok(TestData {
                id: "recomputed".to_string(),
                value: 1000,
                metadata: HashMap::new(),
            })
        }).await?;
        
        assert_eq!(result3.value, 1000);
        assert_eq!(compute_count, 2);
        
        Ok(())
    }
}

#[cfg(test)]
mod task_queue_integration_tests {
    use super::*;
    use xase_sidecar::redis_client::RedisClient;
    use xase_sidecar::task_queue::{TaskQueue, TaskWorker};
    use serde::{Serialize, Deserialize};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    
    #[derive(Debug, Clone, Serialize, Deserialize)]
    struct ProcessingTask {
        dataset_id: String,
        file_path: String,
        priority: i32,
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis running
    async fn test_task_queue_workflow() -> Result<()> {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "queue_test")?;
        let queue = TaskQueue::new(redis, "processing_queue");
        
        // Add tasks with different priorities
        let task1_id = queue.add(
            ProcessingTask {
                dataset_id: "dataset_1".to_string(),
                file_path: "/data/file1.dcm".to_string(),
                priority: 10,
            },
            10
        ).await?;
        
        let task2_id = queue.add(
            ProcessingTask {
                dataset_id: "dataset_2".to_string(),
                file_path: "/data/file2.dcm".to_string(),
                priority: 1,
            },
            1 // Higher priority (lower number)
        ).await?;
        
        // Get stats
        let stats = queue.get_stats().await?;
        assert_eq!(stats.waiting, 2);
        
        // Process tasks (should get high priority first)
        let next_task = queue.get_next::<ProcessingTask>().await?;
        assert!(next_task.is_some());
        let task = next_task.unwrap();
        assert_eq!(task.data.dataset_id, "dataset_2"); // Higher priority
        
        // Complete task
        queue.complete(&task.id, ()).await?;
        
        // Get next task
        let next_task2 = queue.get_next::<ProcessingTask>().await?;
        assert!(next_task2.is_some());
        assert_eq!(next_task2.unwrap().data.dataset_id, "dataset_1");
        
        Ok(())
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis running
    async fn test_task_retry_logic() -> Result<()> {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "retry_test")?;
        let queue = TaskQueue::new(redis, "retry_queue");
        
        let task_id = queue.add(
            ProcessingTask {
                dataset_id: "dataset_fail".to_string(),
                file_path: "/data/fail.dcm".to_string(),
                priority: 5,
            },
            5
        ).await?;
        
        // Get task
        let task = queue.get_next::<ProcessingTask>().await?.unwrap();
        
        // Fail task (should retry)
        queue.fail(&task.id, "Simulated failure").await?;
        
        // Wait for retry delay
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // Task should be available again
        let retry_task = queue.get_next::<ProcessingTask>().await?;
        assert!(retry_task.is_some());
        
        Ok(())
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis running
    async fn test_delayed_task() -> Result<()> {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "delayed_test")?;
        let queue = TaskQueue::new(redis, "delayed_queue");
        
        // Add delayed task
        let task_id = queue.add_delayed(
            ProcessingTask {
                dataset_id: "dataset_delayed".to_string(),
                file_path: "/data/delayed.dcm".to_string(),
                priority: 5,
            },
            Duration::from_secs(2),
            5
        ).await?;
        
        // Should not be available immediately
        let immediate = queue.get_next::<ProcessingTask>().await?;
        assert!(immediate.is_none());
        
        // Wait for delay
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // Should be available now
        let delayed = queue.get_next::<ProcessingTask>().await?;
        assert!(delayed.is_some());
        assert_eq!(delayed.unwrap().data.dataset_id, "dataset_delayed");
        
        Ok(())
    }
}

#[cfg(test)]
mod hybrid_provider_tests {
    use super::*;
    use xase_sidecar::providers::hybrid_provider::HybridProvider;
    use xase_sidecar::data_provider::DataProvider;
    use std::sync::Arc;
    use async_trait::async_trait;
    
    // Mock provider for testing
    struct MockProvider {
        name: String,
        should_fail: Arc<Mutex<bool>>,
        call_count: Arc<Mutex<usize>>,
    }
    
    impl MockProvider {
        fn new(name: &str) -> Self {
            Self {
                name: name.to_string(),
                should_fail: Arc::new(Mutex::new(false)),
                call_count: Arc::new(Mutex::new(0)),
            }
        }
        
        async fn set_fail(&self, fail: bool) {
            *self.should_fail.lock().await = fail;
        }
        
        async fn get_call_count(&self) -> usize {
            *self.call_count.lock().await
        }
    }
    
    #[async_trait]
    impl DataProvider for MockProvider {
        async fn download(&self, key: &str) -> Result<Vec<u8>> {
            *self.call_count.lock().await += 1;
            
            if *self.should_fail.lock().await {
                anyhow::bail!("Mock provider failure")
            }
            
            Ok(format!("data_from_{}", self.name).into_bytes())
        }
        
        async fn list_segments(&self, _prefix: &str, _limit: usize) -> Result<Vec<String>> {
            Ok(vec![])
        }
        
        fn name(&self) -> &str {
            &self.name
        }
        
        async fn health_check(&self) -> Result<bool> {
            Ok(!*self.should_fail.lock().await)
        }
    }
    
    #[tokio::test]
    async fn test_hybrid_provider_primary_success() -> Result<()> {
        let primary = Arc::new(MockProvider::new("primary"));
        let fallback = Arc::new(MockProvider::new("fallback"));
        
        let hybrid = HybridProvider::new(
            primary.clone() as Arc<dyn DataProvider>,
            Some(fallback.clone() as Arc<dyn DataProvider>),
        );
        
        // Primary should succeed
        let data = hybrid.download("test_key").await?;
        assert_eq!(String::from_utf8(data)?, "data_from_primary");
        
        // Primary called, fallback not called
        assert_eq!(primary.get_call_count().await, 1);
        assert_eq!(fallback.get_call_count().await, 0);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_hybrid_provider_fallback() -> Result<()> {
        let primary = Arc::new(MockProvider::new("primary"));
        let fallback = Arc::new(MockProvider::new("fallback"));
        
        // Make primary fail
        primary.set_fail(true).await;
        
        let hybrid = HybridProvider::new(
            primary.clone() as Arc<dyn DataProvider>,
            Some(fallback.clone() as Arc<dyn DataProvider>),
        );
        
        // Should fallback to secondary
        let data = hybrid.download("test_key").await?;
        assert_eq!(String::from_utf8(data)?, "data_from_fallback");
        
        // Both called
        assert_eq!(primary.get_call_count().await, 1);
        assert_eq!(fallback.get_call_count().await, 1);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_hybrid_provider_circuit_breaker() -> Result<()> {
        let primary = Arc::new(MockProvider::new("primary"));
        let fallback = Arc::new(MockProvider::new("fallback"));
        
        // Make primary fail
        primary.set_fail(true).await;
        
        let hybrid = HybridProvider::with_config(
            primary.clone() as Arc<dyn DataProvider>,
            Some(fallback.clone() as Arc<dyn DataProvider>),
            1, // Open circuit after 1 failure
            Duration::from_secs(60),
        );
        
        // First call - primary fails, circuit opens
        let _ = hybrid.download("key1").await?;
        
        // Second call - circuit is open, should skip primary
        let _ = hybrid.download("key2").await?;
        
        // Primary should only be called once (circuit breaker prevents second call)
        assert_eq!(primary.get_call_count().await, 1);
        // Fallback called twice
        assert_eq!(fallback.get_call_count().await, 2);
        
        // Check metrics
        let metrics = hybrid.get_metrics();
        assert_eq!(metrics.primary_requests, 1);
        assert_eq!(metrics.primary_failures, 1);
        assert_eq!(metrics.fallback_requests, 2);
        assert_eq!(metrics.circuit_breaker_trips, 1);
        
        Ok(())
    }
    
    #[tokio::test]
    async fn test_hybrid_provider_recovery() -> Result<()> {
        let primary = Arc::new(MockProvider::new("primary"));
        let fallback = Arc::new(MockProvider::new("fallback"));
        
        // Start with primary failing
        primary.set_fail(true).await;
        
        let hybrid = HybridProvider::with_config(
            primary.clone() as Arc<dyn DataProvider>,
            Some(fallback.clone() as Arc<dyn DataProvider>),
            1,
            Duration::from_secs(2), // Short timeout for testing
        );
        
        // First call - fails, opens circuit
        let _ = hybrid.download("key1").await?;
        
        // Fix primary
        primary.set_fail(false).await;
        
        // Wait for circuit breaker timeout
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // Next call should try primary again (half-open state)
        let data = hybrid.download("key2").await?;
        assert_eq!(String::from_utf8(data)?, "data_from_primary");
        
        // Primary should have been called twice (initial + recovery)
        assert_eq!(primary.get_call_count().await, 2);
        
        Ok(())
    }
}

#[cfg(test)]
mod end_to_end_tests {
    use super::*;
    
    #[tokio::test]
    #[ignore] // Requires full environment
    async fn test_complete_audio_processing_pipeline() -> Result<()> {
        // This test would require:
        // 1. Redis running
        // 2. S3 or mock storage
        // 3. Sample audio files
        
        // TODO: Implement when environment is ready
        Ok(())
    }
}

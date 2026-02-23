#![allow(dead_code)]
use anyhow::{Result, Context};
use redis::{Client, AsyncCommands};
use serde::{Serialize, Deserialize};
use std::time::Duration;

/// Redis client for caching and queue management
#[derive(Clone)]
pub struct RedisClient {
    client: Client,
    prefix: String,
}

impl RedisClient {
    pub fn new(redis_url: &str, prefix: &str) -> Result<Self> {
        let client = Client::open(redis_url)
            .context("Failed to create Redis client")?;
        
        Ok(Self {
            client,
            prefix: prefix.to_string(),
        })
    }
    
    fn build_key(&self, key: &str) -> String {
        if self.prefix.is_empty() {
            key.to_string()
        } else {
            format!("{}:{}", self.prefix, key)
        }
    }
    
    /// Set a value with optional TTL
    pub async fn set<T: Serialize>(&self, key: &str, value: &T, ttl: Option<Duration>) -> Result<()> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        let serialized = serde_json::to_string(value)
            .context("Failed to serialize value")?;
        
        if let Some(ttl) = ttl {
            conn.set_ex::<_, _, ()>(&full_key, serialized, ttl.as_secs()).await
                .context("Failed to set value with TTL")?;
        } else {
            conn.set::<_, _, ()>(&full_key, serialized).await
                .context("Failed to set value")?;
        }
        
        Ok(())
    }
    
    /// Get a value
    pub async fn get<T: for<'de> Deserialize<'de>>(&self, key: &str) -> Result<Option<T>> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        let value: Option<String> = conn.get(&full_key).await
            .context("Failed to get value")?;
        
        match value {
            Some(v) => {
                let deserialized = serde_json::from_str(&v)
                    .context("Failed to deserialize value")?;
                Ok(Some(deserialized))
            }
            None => Ok(None),
        }
    }
    
    /// Delete a key
    pub async fn delete(&self, key: &str) -> Result<()> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        conn.del::<_, ()>(&full_key).await
            .context("Failed to delete key")?;
        
        Ok(())
    }
    
    /// Check if key exists
    pub async fn exists(&self, key: &str) -> Result<bool> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        let exists: bool = conn.exists(&full_key).await
            .context("Failed to check key existence")?;
        
        Ok(exists)
    }
    
    /// Increment a counter
    pub async fn incr(&self, key: &str) -> Result<i64> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        let value: i64 = conn.incr(&full_key, 1).await
            .context("Failed to increment counter")?;
        
        Ok(value)
    }
    
    /// Add to a list (queue)
    pub async fn push<T: Serialize>(&self, list_key: &str, value: &T) -> Result<()> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(list_key);
        let serialized = serde_json::to_string(value)
            .context("Failed to serialize value")?;
        
        conn.rpush::<_, _, ()>(&full_key, serialized).await
            .context("Failed to push to list")?;
        
        Ok(())
    }
    
    /// Pop from a list (queue)
    pub async fn pop<T: for<'de> Deserialize<'de>>(&self, list_key: &str) -> Result<Option<T>> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(list_key);
        let value: Option<String> = conn.lpop(&full_key, None).await
            .context("Failed to pop from list")?;
        
        match value {
            Some(v) => {
                let deserialized = serde_json::from_str(&v)
                    .context("Failed to deserialize value")?;
                Ok(Some(deserialized))
            }
            None => Ok(None),
        }
    }
    
    /// Get list length
    pub async fn list_len(&self, list_key: &str) -> Result<usize> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(list_key);
        let len: usize = conn.llen(&full_key).await
            .context("Failed to get list length")?;
        
        Ok(len)
    }
    
    /// Add to a sorted set with score
    pub async fn zadd(&self, key: &str, member: &str, score: f64) -> Result<()> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        conn.zadd::<_, _, _, ()>(&full_key, member, score).await
            .context("Failed to add to sorted set")?;
        
        Ok(())
    }
    
    /// Get range from sorted set by score
    pub async fn zrangebyscore(&self, key: &str, min: f64, max: f64) -> Result<Vec<String>> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let full_key = self.build_key(key);
        let members: Vec<String> = conn.zrangebyscore(&full_key, min, max).await
            .context("Failed to get range from sorted set")?;
        
        Ok(members)
    }
    
    /// Health check
    pub async fn ping(&self) -> Result<bool> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let pong: String = redis::cmd("PING")
            .query_async(&mut conn)
            .await
            .context("Failed to ping Redis")?;
        
        Ok(pong == "PONG")
    }
    
    /// Flush all keys with this prefix (use with caution!)
    pub async fn flush_prefix(&self) -> Result<usize> {
        let mut conn = self.client.get_async_connection().await
            .context("Failed to get Redis connection")?;
        
        let pattern = format!("{}:*", self.prefix);
        let keys: Vec<String> = redis::cmd("KEYS")
            .arg(&pattern)
            .query_async(&mut conn)
            .await
            .context("Failed to get keys")?;
        
        if keys.is_empty() {
            return Ok(0);
        }
        
        let count = keys.len();
        for key in keys {
            conn.del::<_, ()>(&key).await
                .context("Failed to delete key")?;
        }
        
        Ok(count)
    }
}

/// Cache wrapper with automatic serialization
pub struct CacheManager {
    redis: RedisClient,
    default_ttl: Duration,
}

impl CacheManager {
    pub fn new(redis: RedisClient, default_ttl: Duration) -> Self {
        Self {
            redis,
            default_ttl,
        }
    }
    
    /// Get or compute a value
    pub async fn get_or_compute<T, F, Fut>(
        &self,
        key: &str,
        compute: F,
    ) -> Result<T>
    where
        T: Serialize + for<'de> Deserialize<'de>,
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        // Try to get from cache
        if let Some(cached) = self.redis.get::<T>(key).await? {
            tracing::debug!(key = %key, "Cache hit");
            return Ok(cached);
        }
        
        // Cache miss - compute value
        tracing::debug!(key = %key, "Cache miss - computing");
        let value = compute().await?;
        
        // Store in cache
        self.redis.set(key, &value, Some(self.default_ttl)).await?;
        
        Ok(value)
    }
    
    /// Invalidate cache entry
    pub async fn invalidate(&self, key: &str) -> Result<()> {
        self.redis.delete(key).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestData {
        id: String,
        value: i32,
    }
    
    // Note: These tests require a running Redis instance
    // Run with: docker run -d -p 6379:6379 redis:7-alpine
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_set_and_get() {
        let client = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        
        let data = TestData {
            id: "test_123".to_string(),
            value: 42,
        };
        
        client.set("key1", &data, None).await.unwrap();
        let retrieved: Option<TestData> = client.get("key1").await.unwrap();
        
        assert_eq!(retrieved, Some(data));
        
        // Cleanup
        client.delete("key1").await.unwrap();
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_ttl() {
        let client = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        
        let data = TestData {
            id: "test_ttl".to_string(),
            value: 100,
        };
        
        client.set("ttl_key", &data, Some(Duration::from_secs(2))).await.unwrap();
        
        // Should exist immediately
        assert!(client.exists("ttl_key").await.unwrap());
        
        // Wait for expiration
        tokio::time::sleep(Duration::from_secs(3)).await;
        
        // Should be gone
        assert!(!client.exists("ttl_key").await.unwrap());
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_queue_operations() {
        let client = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        
        let data1 = TestData { id: "1".to_string(), value: 1 };
        let data2 = TestData { id: "2".to_string(), value: 2 };
        
        client.push("queue", &data1).await.unwrap();
        client.push("queue", &data2).await.unwrap();
        
        assert_eq!(client.list_len("queue").await.unwrap(), 2);
        
        let popped1: Option<TestData> = client.pop("queue").await.unwrap();
        assert_eq!(popped1, Some(data1));
        
        let popped2: Option<TestData> = client.pop("queue").await.unwrap();
        assert_eq!(popped2, Some(data2));
        
        assert_eq!(client.list_len("queue").await.unwrap(), 0);
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_cache_manager() {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        let cache = CacheManager::new(redis, Duration::from_secs(60));
        
        let mut call_count = 0;
        
        // First call - cache miss
        let result1 = cache.get_or_compute("compute_key", || async {
            call_count += 1;
            Ok(TestData {
                id: "computed".to_string(),
                value: 999,
            })
        }).await.unwrap();
        
        assert_eq!(result1.value, 999);
        
        // Second call - cache hit (compute should not be called)
        let result2 = cache.get_or_compute("compute_key", || async {
            call_count += 1;
            Ok(TestData {
                id: "computed".to_string(),
                value: 999,
            })
        }).await.unwrap();
        
        assert_eq!(result2.value, 999);
        assert_eq!(call_count, 1); // Should only be called once
        
        // Cleanup
        cache.invalidate("compute_key").await.unwrap();
    }
}

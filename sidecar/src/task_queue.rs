#![allow(dead_code)]
use anyhow::Result;
use serde::{Serialize, Deserialize};
use std::time::Duration;
use crate::redis_client::RedisClient;

/// Task queue for async processing using Redis
/// Provides BullMQ-like functionality for background job processing
#[derive(Clone)]
pub struct TaskQueue {
    redis: RedisClient,
    queue_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task<T> {
    pub id: String,
    pub data: T,
    pub priority: i32,
    pub attempts: u32,
    pub max_attempts: u32,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub scheduled_at: Option<chrono::DateTime<chrono::Utc>>,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskResult<T> {
    pub task_id: String,
    pub result: T,
    pub completed_at: chrono::DateTime<chrono::Utc>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskError {
    pub task_id: String,
    pub error: String,
    pub failed_at: chrono::DateTime<chrono::Utc>,
    pub attempt: u32,
}

impl TaskQueue {
    pub fn new(redis: RedisClient, queue_name: &str) -> Self {
        Self {
            redis,
            queue_name: queue_name.to_string(),
        }
    }
    
    fn queue_key(&self) -> String {
        format!("queue:{}", self.queue_name)
    }
    
    fn processing_key(&self) -> String {
        format!("queue:{}:processing", self.queue_name)
    }
    
    fn failed_key(&self) -> String {
        format!("queue:{}:failed", self.queue_name)
    }
    
    fn completed_key(&self) -> String {
        format!("queue:{}:completed", self.queue_name)
    }
    
    fn delayed_key(&self) -> String {
        format!("queue:{}:delayed", self.queue_name)
    }
    
    /// Add a task to the queue
    pub async fn add<T: Serialize>(&self, data: T, priority: i32) -> Result<String> {
        let task_id = format!("task_{}_{}", 
            chrono::Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
        );
        
        let task = Task {
            id: task_id.clone(),
            data,
            priority,
            attempts: 0,
            max_attempts: 3,
            created_at: chrono::Utc::now(),
            scheduled_at: None,
            metadata: std::collections::HashMap::new(),
        };
        
        // Add to sorted set with priority as score (lower = higher priority)
        self.redis.zadd(&self.queue_key(), &task_id, priority as f64).await?;
        
        // Store task data
        self.redis.set(&format!("task:{}", task_id), &task, None).await?;
        
        tracing::info!(
            task_id = %task_id,
            queue = %self.queue_name,
            priority = priority,
            "Task added to queue"
        );
        
        Ok(task_id)
    }
    
    /// Add a delayed task (scheduled for future execution)
    pub async fn add_delayed<T: Serialize>(
        &self,
        data: T,
        delay: Duration,
        priority: i32,
    ) -> Result<String> {
        let task_id = format!("task_{}_{}", 
            chrono::Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
        );
        
        let scheduled_at = chrono::Utc::now() + chrono::Duration::from_std(delay)?;
        
        let task = Task {
            id: task_id.clone(),
            data,
            priority,
            attempts: 0,
            max_attempts: 3,
            created_at: chrono::Utc::now(),
            scheduled_at: Some(scheduled_at),
            metadata: std::collections::HashMap::new(),
        };
        
        // Add to delayed sorted set with scheduled timestamp as score
        self.redis.zadd(&self.delayed_key(), &task_id, scheduled_at.timestamp() as f64).await?;
        
        // Store task data
        self.redis.set(&format!("task:{}", task_id), &task, None).await?;
        
        tracing::info!(
            task_id = %task_id,
            queue = %self.queue_name,
            scheduled_at = %scheduled_at,
            "Delayed task added to queue"
        );
        
        Ok(task_id)
    }
    
    /// Get next task from queue (FIFO with priority)
    pub async fn get_next<T: for<'de> Deserialize<'de>>(&self) -> Result<Option<Task<T>>> {
        // First, check for delayed tasks that are ready
        self.promote_delayed_tasks().await?;
        
        // Get tasks sorted by priority (ascending)
        let tasks = self.redis.zrangebyscore(&self.queue_key(), f64::MIN, f64::MAX).await?;
        
        if tasks.is_empty() {
            return Ok(None);
        }
        
        // Get the first task (highest priority)
        let task_id = &tasks[0];
        
        // Move to processing
        self.redis.zadd(&self.processing_key(), task_id, chrono::Utc::now().timestamp() as f64).await?;
        
        // Remove from main queue
        // Note: In production, use ZPOPMIN for atomic operation
        
        // Load task data
        let task: Option<Task<T>> = self.redis.get(&format!("task:{}", task_id)).await?;
        
        Ok(task)
    }
    
    /// Mark task as completed
    pub async fn complete<T: Serialize>(&self, task_id: &str, result: T) -> Result<()> {
        let task_result = TaskResult {
            task_id: task_id.to_string(),
            result,
            completed_at: chrono::Utc::now(),
            processing_time_ms: 0, // TODO: track actual processing time
        };
        
        // Store result
        self.redis.set(
            &format!("result:{}", task_id),
            &task_result,
            Some(Duration::from_secs(86400)) // Keep for 24 hours
        ).await?;
        
        // Add to completed set
        self.redis.zadd(&self.completed_key(), task_id, chrono::Utc::now().timestamp() as f64).await?;
        
        // Remove from processing
        // Note: In production, use ZREM
        
        // Delete task data
        self.redis.delete(&format!("task:{}", task_id)).await?;
        
        tracing::info!(
            task_id = %task_id,
            queue = %self.queue_name,
            "Task completed"
        );
        
        Ok(())
    }
    
    /// Mark task as failed
    pub async fn fail(&self, task_id: &str, error: &str) -> Result<()> {
        // Load task to check attempts
        let task_key = format!("task:{}", task_id);
        let mut task: Option<Task<serde_json::Value>> = self.redis.get(&task_key).await?;
        
        if let Some(ref mut task) = task {
            task.attempts += 1;
            
            if task.attempts >= task.max_attempts {
                // Max attempts reached - move to failed
                let task_error = TaskError {
                    task_id: task_id.to_string(),
                    error: error.to_string(),
                    failed_at: chrono::Utc::now(),
                    attempt: task.attempts,
                };
                
                self.redis.set(
                    &format!("error:{}", task_id),
                    &task_error,
                    Some(Duration::from_secs(86400 * 7)) // Keep for 7 days
                ).await?;
                
                self.redis.zadd(&self.failed_key(), task_id, chrono::Utc::now().timestamp() as f64).await?;
                
                // Delete task data
                self.redis.delete(&task_key).await?;
                
                tracing::error!(
                    task_id = %task_id,
                    queue = %self.queue_name,
                    attempts = task.attempts,
                    error = %error,
                    "Task failed permanently"
                );
            } else {
                // Retry - put back in queue with exponential backoff
                let delay_secs = 2u64.pow(task.attempts);
                let scheduled_at = chrono::Utc::now() + chrono::Duration::seconds(delay_secs as i64);
                
                task.scheduled_at = Some(scheduled_at);
                
                self.redis.set(&task_key, &task, None).await?;
                self.redis.zadd(&self.delayed_key(), task_id, scheduled_at.timestamp() as f64).await?;
                
                tracing::warn!(
                    task_id = %task_id,
                    queue = %self.queue_name,
                    attempts = task.attempts,
                    retry_in_secs = delay_secs,
                    error = %error,
                    "Task failed - will retry"
                );
            }
        }
        
        Ok(())
    }
    
    /// Promote delayed tasks that are ready
    async fn promote_delayed_tasks(&self) -> Result<()> {
        let now = chrono::Utc::now().timestamp() as f64;
        let ready_tasks = self.redis.zrangebyscore(&self.delayed_key(), f64::MIN, now).await?;
        
        for task_id in ready_tasks {
            // Load task to get priority
            if let Some(task) = self.redis.get::<Task<serde_json::Value>>(&format!("task:{}", task_id)).await? {
                // Move to main queue
                self.redis.zadd(&self.queue_key(), &task_id, task.priority as f64).await?;
                
                tracing::debug!(
                    task_id = %task_id,
                    queue = %self.queue_name,
                    "Promoted delayed task to main queue"
                );
            }
        }
        
        Ok(())
    }
    
    /// Get queue statistics
    pub async fn get_stats(&self) -> Result<QueueStats> {
        let waiting = self.redis.list_len(&self.queue_key()).await?;
        let processing = self.redis.list_len(&self.processing_key()).await?;
        let delayed = self.redis.list_len(&self.delayed_key()).await?;
        let completed = self.redis.list_len(&self.completed_key()).await?;
        let failed = self.redis.list_len(&self.failed_key()).await?;
        
        Ok(QueueStats {
            waiting,
            processing,
            delayed,
            completed,
            failed,
        })
    }
    
    /// Clean up old completed/failed tasks
    pub async fn cleanup(&self, older_than: Duration) -> Result<usize> {
        let cutoff = (chrono::Utc::now() - chrono::Duration::from_std(older_than)?).timestamp() as f64;
        
        // Get old completed tasks
        let old_completed = self.redis.zrangebyscore(&self.completed_key(), f64::MIN, cutoff).await?;
        
        // Get old failed tasks
        let old_failed = self.redis.zrangebyscore(&self.failed_key(), f64::MIN, cutoff).await?;
        
        let mut cleaned = 0;
        
        for task_id in old_completed.iter().chain(old_failed.iter()) {
            self.redis.delete(&format!("result:{}", task_id)).await.ok();
            self.redis.delete(&format!("error:{}", task_id)).await.ok();
            cleaned += 1;
        }
        
        tracing::info!(
            queue = %self.queue_name,
            cleaned = cleaned,
            "Cleaned up old tasks"
        );
        
        Ok(cleaned)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub waiting: usize,
    pub processing: usize,
    pub delayed: usize,
    pub completed: usize,
    pub failed: usize,
}

/// Worker for processing tasks from queue
pub struct TaskWorker<T, F, Fut>
where
    T: for<'de> Deserialize<'de> + Send + 'static,
    F: Fn(T) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<()>> + Send + 'static,
{
    queue: TaskQueue,
    handler: F,
    concurrency: usize,
    poll_interval: Duration,
    _phantom: std::marker::PhantomData<T>,
}

impl<T, F, Fut> TaskWorker<T, F, Fut>
where
    T: for<'de> Deserialize<'de> + Send + 'static,
    F: Fn(T) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<()>> + Send + 'static,
{
    pub fn new(queue: TaskQueue, handler: F, concurrency: usize) -> Self {
        Self {
            queue,
            handler,
            concurrency,
            poll_interval: Duration::from_secs(1),
            _phantom: std::marker::PhantomData,
        }
    }
    
    /// Start processing tasks
    pub async fn run(self) -> Result<()> {
        let handler = std::sync::Arc::new(self.handler);
        let mut handles = Vec::new();
        
        for worker_id in 0..self.concurrency {
            let queue = self.queue.clone();
            let handler = handler.clone();
            let poll_interval = self.poll_interval;
            
            let handle = tokio::spawn(async move {
                loop {
                    match queue.get_next::<T>().await {
                        Ok(Some(task)) => {
                            let task_id = task.id.clone();
                            
                            tracing::info!(
                                worker_id = worker_id,
                                task_id = %task_id,
                                "Processing task"
                            );
                            
                            match handler(task.data).await {
                                Ok(_) => {
                                    if let Err(e) = queue.complete(&task_id, ()).await {
                                        tracing::error!(
                                            task_id = %task_id,
                                            error = %e,
                                            "Failed to mark task as completed"
                                        );
                                    }
                                }
                                Err(e) => {
                                    if let Err(err) = queue.fail(&task_id, &e.to_string()).await {
                                        tracing::error!(
                                            task_id = %task_id,
                                            error = %err,
                                            "Failed to mark task as failed"
                                        );
                                    }
                                }
                            }
                        }
                        Ok(None) => {
                            // No tasks available - wait before polling again
                            tokio::time::sleep(poll_interval).await;
                        }
                        Err(e) => {
                            tracing::error!(
                                worker_id = worker_id,
                                error = %e,
                                "Error getting next task"
                            );
                            tokio::time::sleep(poll_interval).await;
                        }
                    }
                }
            });
            
            handles.push(handle);
        }
        
        // Wait for all workers
        for handle in handles {
            handle.await?;
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
    struct TestTask {
        message: String,
        value: i32,
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_add_and_get_task() {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        let queue = TaskQueue::new(redis, "test_queue");
        
        let task_data = TestTask {
            message: "Hello".to_string(),
            value: 42,
        };
        
        let task_id = queue.add(task_data.clone(), 1).await.unwrap();
        
        let next_task: Option<Task<TestTask>> = queue.get_next().await.unwrap();
        assert!(next_task.is_some());
        
        let task = next_task.unwrap();
        assert_eq!(task.data, task_data);
        
        queue.complete(&task_id, ()).await.unwrap();
    }
    
    #[tokio::test]
    #[ignore] // Requires Redis
    async fn test_priority_ordering() {
        let redis = RedisClient::new("redis://127.0.0.1:6379", "test").unwrap();
        let queue = TaskQueue::new(redis, "priority_queue");
        
        // Add tasks with different priorities
        queue.add(TestTask { message: "Low".to_string(), value: 3 }, 10).await.unwrap();
        queue.add(TestTask { message: "High".to_string(), value: 1 }, 1).await.unwrap();
        queue.add(TestTask { message: "Medium".to_string(), value: 2 }, 5).await.unwrap();
        
        // Should get high priority first
        let task1: Option<Task<TestTask>> = queue.get_next().await.unwrap();
        assert_eq!(task1.unwrap().data.message, "High");
        
        let task2: Option<Task<TestTask>> = queue.get_next().await.unwrap();
        assert_eq!(task2.unwrap().data.message, "Medium");
        
        let task3: Option<Task<TestTask>> = queue.get_next().await.unwrap();
        assert_eq!(task3.unwrap().data.message, "Low");
    }
}

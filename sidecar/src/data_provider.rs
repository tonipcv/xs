use anyhow::Result;
use async_trait::async_trait;

/// DataProvider trait abstracts different data sources (S3, DICOMweb, FHIR, etc.)
/// This allows the sidecar to work with hospital on-premise infrastructure
/// while maintaining S3 as a fallback option.
#[async_trait]
pub trait DataProvider: Send + Sync {
    /// Download a segment/resource by key
    /// Key format depends on the provider:
    /// - S3: "seg_00001"
    /// - DICOMweb: "study_1.2.840.xxx/series_1.2.840.yyy/instance_1.2.840.zzz"
    /// - FHIR: "Patient/12345" or "Observation/67890"
    async fn download(&self, key: &str) -> Result<Vec<u8>>;
    
    /// List available segments/resources with optional prefix and limit
    /// Used by prefetch engine to discover what data is available
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>>;
    
    /// Provider name for logging and metrics
    fn name(&self) -> &str;
    
    /// Check if provider is healthy and ready to serve data
    async fn health_check(&self) -> Result<bool> {
        // Default implementation: try to list with limit 1
        match self.list_segments("", 1).await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }
}

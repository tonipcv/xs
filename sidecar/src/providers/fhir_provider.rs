use anyhow::{Result, Context};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use crate::data_provider::DataProvider;
use crate::config::Config;

/// FHIRProvider implements DataProvider for hospital EHR via FHIR R4 API
/// This allows the sidecar to fetch patient records directly from hospital systems
pub struct FHIRProvider {
    client: Client,
    base_url: String,
    auth_token: Option<String>,
}

impl FHIRProvider {
    pub fn new(base_url: String, auth_token: Option<String>) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .context("Failed to create HTTP client")?;
        
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token,
        })
    }
    
    /// Create FHIRProvider from Config
    pub async fn from_config(config: &Config) -> Result<Self> {
        let base_url = config.fhir_url.as_ref()
            .ok_or_else(|| anyhow::anyhow!("FHIR_URL is required for FHIR provider"))?;
        
        tracing::info!("Initializing FHIR provider: {}", base_url);
        
        Self::new(
            base_url.clone(),
            config.fhir_auth_token.clone(),
        )
    }
    
    fn add_auth_header(&self, req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(token) = &self.auth_token {
            req.bearer_auth(token)
        } else {
            req
        }
    }
}

#[async_trait]
impl DataProvider for FHIRProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        // Key format: "Patient/12345" or "Observation/67890"
        let url = format!("{}/{}", self.base_url, key);
        
        tracing::debug!("Fetching FHIR resource from: {}", url);
        
        let req = self.client
            .get(&url)
            .header("Accept", "application/fhir+json");
        
        let req = self.add_auth_header(req);
        
        let resp = req.send().await
            .context("Failed to fetch FHIR resource from EHR")?;
        
        if !resp.status().is_success() {
            anyhow::bail!(
                "EHR returned error status: {} for resource {}",
                resp.status(),
                key
            );
        }
        
        let bytes = resp.bytes().await
            .context("Failed to read FHIR resource bytes")?;
        
        tracing::info!(
            "Downloaded FHIR resource {} ({} bytes)",
            key,
            bytes.len()
        );
        
        Ok(bytes.to_vec())
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // FHIR Search: GET /{ResourceType}?_count={limit}
        // prefix should be the resource type (e.g., "Patient", "Observation")
        let resource_type = if prefix.is_empty() {
            "Patient" // Default to Patient resources
        } else {
            prefix.trim_end_matches('/')
        };
        
        let url = format!("{}/{}", self.base_url, resource_type);
        
        tracing::debug!("Querying FHIR {} resources with limit {}", resource_type, limit);
        
        let req = self.client
            .get(&url)
            .query(&[("_count", limit.to_string())])
            .header("Accept", "application/fhir+json");
        
        let req = self.add_auth_header(req);
        
        let resp = req.send().await
            .context("Failed to query FHIR resources")?;
        
        if !resp.status().is_success() {
            anyhow::bail!("FHIR query returned error status: {}", resp.status());
        }
        
        let bundle: Value = resp.json().await
            .context("Failed to parse FHIR Bundle as JSON")?;
        
        let mut keys = Vec::new();
        
        // Parse FHIR Bundle
        if let Some(entries) = bundle.get("entry").and_then(|e| e.as_array()) {
            for entry in entries {
                // Extract resource reference from fullUrl or resource.id
                if let Some(full_url) = entry.get("fullUrl").and_then(|u| u.as_str()) {
                    // Extract "Patient/12345" from full URL
                    if let Some(resource_path) = full_url.split("/fhir/").nth(1) {
                        keys.push(resource_path.to_string());
                    } else if let Some(last_part) = full_url.split('/').last() {
                        // Fallback: just use last part with resource type
                        if let Some(resource) = entry.get("resource") {
                            if let Some(res_type) = resource.get("resourceType").and_then(|t| t.as_str()) {
                                keys.push(format!("{}/{}", res_type, last_part));
                            }
                        }
                    }
                } else if let Some(resource) = entry.get("resource") {
                    // Extract from resource directly
                    if let Some(res_type) = resource.get("resourceType").and_then(|t| t.as_str()) {
                        if let Some(id) = resource.get("id").and_then(|i| i.as_str()) {
                            keys.push(format!("{}/{}", res_type, id));
                        }
                    }
                }
                
                // Respect limit
                if keys.len() >= limit {
                    break;
                }
            }
        }
        
        tracing::info!("Found {} FHIR {} resources", keys.len(), resource_type);
        Ok(keys)
    }
    
    fn name(&self) -> &str {
        "FHIR"
    }
    
    async fn health_check(&self) -> Result<bool> {
        // Try to query metadata endpoint
        let url = format!("{}/metadata", self.base_url);
        
        let req = self.client
            .get(&url)
            .header("Accept", "application/fhir+json")
            .timeout(std::time::Duration::from_secs(5));
        
        let req = self.add_auth_header(req);
        
        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("FHIR EHR health check: OK");
                Ok(true)
            }
            Ok(resp) => {
                tracing::warn!("FHIR EHR health check failed: status {}", resp.status());
                Ok(false)
            }
            Err(e) => {
                tracing::warn!("FHIR EHR health check failed: {}", e);
                Ok(false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_fhir_provider_creation() {
        let provider = FHIRProvider::new(
            "https://ehr.hospital.local/fhir".to_string(),
            Some("test_token".to_string()),
        );
        
        assert!(provider.is_ok());
        let provider = provider.unwrap();
        assert_eq!(provider.name(), "FHIR");
    }
}

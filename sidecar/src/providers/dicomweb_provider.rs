use anyhow::{Result, Context};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use crate::data_provider::DataProvider;
use crate::config::Config;

/// DICOMwebProvider implements DataProvider for hospital PACS via DICOMweb (WADO-RS/QIDO-RS)
/// This allows the sidecar to fetch DICOM images directly from hospital infrastructure
pub struct DICOMwebProvider {
    client: Client,
    base_url: String,
    auth_token: Option<String>,
    study_uid_prefix: String,
}

impl DICOMwebProvider {
    pub fn new(
        base_url: String,
        auth_token: Option<String>,
        study_uid_prefix: Option<String>,
    ) -> Result<Self> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .context("Failed to create HTTP client")?;
        
        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token,
            study_uid_prefix: study_uid_prefix.unwrap_or_default(),
        })
    }
    
    /// Create DICOMwebProvider from Config
    pub async fn from_config(config: &Config) -> Result<Self> {
        let base_url = config.dicomweb_url.as_ref()
            .ok_or_else(|| anyhow::anyhow!("DICOMWEB_URL is required for DICOMweb provider"))?;
        
        tracing::info!("Initializing DICOMweb provider: {}", base_url);
        
        Self::new(
            base_url.clone(),
            config.dicomweb_auth_token.clone(),
            None, // Study prefix can be added to Config if needed
        )
    }
    
    fn parse_dicom_key(&self, key: &str) -> Result<(String, String, String)> {
        // Expected format: "study_1.2.840.xxx/series_1.2.840.yyy/instance_1.2.840.zzz"
        let parts: Vec<&str> = key.split('/').collect();
        
        if parts.len() != 3 {
            anyhow::bail!("Invalid DICOM key format. Expected: study_UID/series_UID/instance_UID");
        }
        
        let study_uid = parts[0]
            .strip_prefix("study_")
            .context("Study UID must start with 'study_'")?
            .to_string();
        
        let series_uid = parts[1]
            .strip_prefix("series_")
            .context("Series UID must start with 'series_'")?
            .to_string();
        
        let instance_uid = parts[2]
            .strip_prefix("instance_")
            .context("Instance UID must start with 'instance_'")?
            .to_string();
        
        Ok((study_uid, series_uid, instance_uid))
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
impl DataProvider for DICOMwebProvider {
    async fn download(&self, key: &str) -> Result<Vec<u8>> {
        let (study_uid, series_uid, instance_uid) = self.parse_dicom_key(key)?;
        
        // WADO-RS: GET /studies/{study}/series/{series}/instances/{instance}
        let url = format!(
            "{}/studies/{}/series/{}/instances/{}",
            self.base_url, study_uid, series_uid, instance_uid
        );
        
        tracing::debug!("Fetching DICOM instance from: {}", url);
        
        let req = self.client
            .get(&url)
            .header("Accept", "application/dicom");
        
        let req = self.add_auth_header(req);
        
        let resp = req.send().await
            .context("Failed to fetch DICOM instance from PACS")?;
        
        if !resp.status().is_success() {
            anyhow::bail!(
                "PACS returned error status: {} for instance {}",
                resp.status(),
                instance_uid
            );
        }
        
        let bytes = resp.bytes().await
            .context("Failed to read DICOM instance bytes")?;
        
        tracing::info!(
            "Downloaded DICOM instance {} ({} bytes)",
            instance_uid,
            bytes.len()
        );
        
        Ok(bytes.to_vec())
    }
    
    async fn list_segments(&self, prefix: &str, limit: usize) -> Result<Vec<String>> {
        // QIDO-RS: GET /studies?limit={limit}
        let url = format!("{}/studies", self.base_url);
        
        tracing::debug!("Querying PACS studies with limit {}", limit);
        
        let mut req = self.client
            .get(&url)
            .query(&[("limit", limit.to_string())])
            .header("Accept", "application/dicom+json");
        
        // Add optional study prefix filter
        if !prefix.is_empty() && !self.study_uid_prefix.is_empty() {
            req = req.query(&[("StudyInstanceUID", format!("{}*", self.study_uid_prefix))]);
        }
        
        req = self.add_auth_header(req);
        
        let resp = req.send().await
            .context("Failed to query PACS studies")?;
        
        if !resp.status().is_success() {
            anyhow::bail!("PACS query returned error status: {}", resp.status());
        }
        
        let studies: Vec<Value> = resp.json().await
            .context("Failed to parse PACS response as JSON")?;
        
        let mut keys = Vec::new();
        
        for study in studies {
            // Extract Study Instance UID (0020,000D)
            if let Some(study_uid_obj) = study.get("0020000D") {
                if let Some(study_uid_array) = study_uid_obj.get("Value") {
                    if let Some(study_uid) = study_uid_array.get(0).and_then(|v| v.as_str()) {
                        // Query series for this study
                        let series_url = format!("{}/studies/{}/series", self.base_url, study_uid);
                        
                        let series_req = self.client
                            .get(&series_url)
                            .header("Accept", "application/dicom+json");
                        
                        let series_req = self.add_auth_header(series_req);
                        
                        if let Ok(series_resp) = series_req.send().await {
                            if let Ok(series_list) = series_resp.json::<Vec<Value>>().await {
                                for series in series_list {
                                    // Extract Series Instance UID (0020,000E)
                                    if let Some(series_uid_obj) = series.get("0020000E") {
                                        if let Some(series_uid_array) = series_uid_obj.get("Value") {
                                            if let Some(series_uid) = series_uid_array.get(0).and_then(|v| v.as_str()) {
                                                // Query instances for this series
                                                let instances_url = format!(
                                                    "{}/studies/{}/series/{}/instances",
                                                    self.base_url, study_uid, series_uid
                                                );
                                                
                                                let instances_req = self.client
                                                    .get(&instances_url)
                                                    .header("Accept", "application/dicom+json");
                                                
                                                let instances_req = self.add_auth_header(instances_req);
                                                
                                                if let Ok(instances_resp) = instances_req.send().await {
                                                    if let Ok(instances_list) = instances_resp.json::<Vec<Value>>().await {
                                                        for instance in instances_list {
                                                            // Extract SOP Instance UID (0008,0018)
                                                            if let Some(instance_uid_obj) = instance.get("00080018") {
                                                                if let Some(instance_uid_array) = instance_uid_obj.get("Value") {
                                                                    if let Some(instance_uid) = instance_uid_array.get(0).and_then(|v| v.as_str()) {
                                                                        // Build key in our format
                                                                        let key = format!(
                                                                            "study_{}/series_{}/instance_{}",
                                                                            study_uid, series_uid, instance_uid
                                                                        );
                                                                        keys.push(key);
                                                                        
                                                                        // Respect limit
                                                                        if keys.len() >= limit {
                                                                            return Ok(keys);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        
        tracing::info!("Found {} DICOM instances in PACS", keys.len());
        Ok(keys)
    }
    
    fn name(&self) -> &str {
        "DICOMweb"
    }
    
    async fn health_check(&self) -> Result<bool> {
        // Try to query studies with limit 1
        let url = format!("{}/studies", self.base_url);
        
        let req = self.client
            .get(&url)
            .query(&[("limit", "1")])
            .header("Accept", "application/dicom+json")
            .timeout(std::time::Duration::from_secs(5));
        
        let req = self.add_auth_header(req);
        
        match req.send().await {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("DICOMweb PACS health check: OK");
                Ok(true)
            }
            Ok(resp) => {
                tracing::warn!("DICOMweb PACS health check failed: status {}", resp.status());
                Ok(false)
            }
            Err(e) => {
                tracing::warn!("DICOMweb PACS health check failed: {}", e);
                Ok(false)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_dicom_key() {
        let provider = DICOMwebProvider::new(
            "https://pacs.hospital.local/dicomweb".to_string(),
            None,
            None,
        ).unwrap();
        
        let key = "study_1.2.840.113619.2.55.3/series_1.2.840.113619.2.55.3.1/instance_1.2.840.113619.2.55.3.1.1";
        let (study, series, instance) = provider.parse_dicom_key(key).unwrap();
        
        assert_eq!(study, "1.2.840.113619.2.55.3");
        assert_eq!(series, "1.2.840.113619.2.55.3.1");
        assert_eq!(instance, "1.2.840.113619.2.55.3.1.1");
    }
    
    #[test]
    fn test_parse_invalid_key() {
        let provider = DICOMwebProvider::new(
            "https://pacs.hospital.local/dicomweb".to_string(),
            None,
            None,
        ).unwrap();
        
        let result = provider.parse_dicom_key("invalid_key");
        assert!(result.is_err());
    }
}

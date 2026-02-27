use anyhow::{Result, Context, bail};
use jsonwebtoken::{decode, decode_header, DecodingKey, Validation, Algorithm};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SidecarTokenClaims {
    pub sub: String,           // Session ID
    pub aud: String,           // Always "sidecar"
    pub iss: String,           // Brain URL
    pub tenant_id: String,
    pub contract_id: String,
    pub scopes: Vec<String>,
    pub features: Features,
    pub quotas: Option<Quotas>,
    pub exp: i64,
    pub iat: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Features {
    pub dicom_ocr: bool,
    pub fhir_nlp: bool,
    pub audio_redaction: bool,
    pub prefetch: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Quotas {
    pub max_bytes_month: Option<f64>,
    pub max_images_month: Option<f64>,
    pub max_audio_minutes_month: Option<f64>,
    pub max_fhir_resources_month: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct JwksKey {
    pub kid: String,
    pub n: String,
    pub e: String,
    pub alg: String,
}

#[derive(Debug, Deserialize)]
struct JwksResponse {
    keys: Vec<JwksKeyRaw>,
}

#[derive(Debug, Deserialize)]
struct JwksKeyRaw {
    kid: String,
    n: String,
    e: String,
    alg: String,
}

/// Fetch JWKS from Brain
pub async fn fetch_jwks(brain_url: &str) -> Result<Vec<JwksKey>> {
    let jwks_url = format!("{}/.well-known/jwks.json", brain_url.trim_end_matches('/'));
    
    let response = reqwest::get(&jwks_url)
        .await
        .context("Failed to fetch JWKS")?;
    
    if !response.status().is_success() {
        bail!("JWKS endpoint returned {}", response.status());
    }
    
    let jwks: JwksResponse = response.json().await.context("Failed to parse JWKS")?;
    
    Ok(jwks.keys.into_iter().map(|k| JwksKey {
        kid: k.kid,
        n: k.n,
        e: k.e,
        alg: k.alg,
    }).collect())
}

/// Validate JWT token using JWKS
pub fn validate_token(token: &str, jwks_keys: &[JwksKey], expected_iss: &str) -> Result<SidecarTokenClaims> {
    // Decode header to get kid
    let header = decode_header(token).context("Failed to decode JWT header")?;
    let kid = header.kid.context("JWT missing kid")?;
    
    // Find matching key
    let jwks_key = jwks_keys.iter()
        .find(|k| k.kid == kid)
        .context("No matching JWKS key found")?;
    
    // Construct RSA public key from n and e
    let decoding_key = DecodingKey::from_rsa_components(&jwks_key.n, &jwks_key.e)
        .context("Failed to construct RSA key from JWKS")?;
    
    // Validation rules
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_audience(&["sidecar"]);
    validation.set_issuer(&[expected_iss]);
    
    // Decode and validate
    let token_data = decode::<SidecarTokenClaims>(token, &decoding_key, &validation)
        .context("JWT validation failed")?;
    
    Ok(token_data.claims)
}

/// Check if a scope is present in claims
pub fn has_scope(claims: &SidecarTokenClaims, scope: &str) -> bool {
    claims.scopes.iter().any(|s| s == scope)
}

/// Check if quota is exceeded
pub fn check_quota(claims: &SidecarTokenClaims, current_usage: &HashMap<String, f64>) -> Result<()> {
    if let Some(quotas) = &claims.quotas {
        if let Some(max_bytes) = quotas.max_bytes_month {
            if let Some(&bytes_used) = current_usage.get("bytes_total") {
                if bytes_used >= max_bytes {
                    bail!("Monthly byte quota exceeded: {}/{}", bytes_used, max_bytes);
                }
            }
        }
        
        if let Some(max_images) = quotas.max_images_month {
            if let Some(&images_used) = current_usage.get("dicom_images") {
                if images_used >= max_images {
                    bail!("Monthly DICOM image quota exceeded: {}/{}", images_used, max_images);
                }
            }
        }
        
        if let Some(max_audio) = quotas.max_audio_minutes_month {
            if let Some(&audio_used) = current_usage.get("audio_minutes") {
                if audio_used >= max_audio {
                    bail!("Monthly audio quota exceeded: {}/{}", audio_used, max_audio);
                }
            }
        }
        
        if let Some(max_fhir) = quotas.max_fhir_resources_month {
            if let Some(&fhir_used) = current_usage.get("fhir_resources") {
                if fhir_used >= max_fhir {
                    bail!("Monthly FHIR resource quota exceeded: {}/{}", fhir_used, max_fhir);
                }
            }
        }
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_has_scope() {
        let claims = SidecarTokenClaims {
            sub: "session_1".to_string(),
            aud: "sidecar".to_string(),
            iss: "https://xase.ai".to_string(),
            tenant_id: "tenant_1".to_string(),
            contract_id: "contract_1".to_string(),
            scopes: vec!["ingest:read".to_string(), "redact:execute".to_string()],
            features: Features {
                dicom_ocr: true,
                fhir_nlp: false,
                audio_redaction: false,
                prefetch: true,
            },
            quotas: None,
            exp: 9999999999,
            iat: 1000000000,
        };
        
        assert!(has_scope(&claims, "ingest:read"));
        assert!(has_scope(&claims, "redact:execute"));
        assert!(!has_scope(&claims, "admin:write"));
    }
}

use regex::Regex;
use std::collections::HashSet;
#[cfg(feature = "nlp-full")]
use rust_bert::pipelines::ner::NERModel;

/// Clinical NLP for PHI detection and redaction in medical narratives
/// Implements HIPAA-compliant entity recognition for clinical text

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct PhiEntity {
    pub entity_type: PhiEntityType,
    pub text: String,
    pub start: usize,
    pub end: usize,
    pub confidence: f32,
}

#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum PhiEntityType {
    PersonName,
    MedicalRecordNumber,
    SocialSecurityNumber,
    DateOfBirth,
    Age,
    PhoneNumber,
    EmailAddress,
    Address,
    DeviceIdentifier,
    IpAddress,
    BiometricIdentifier,
    FacialPhoto,
    AccountNumber,
    LicensePlate,
    VehicleIdentifier,
    WebUrl,
    HealthPlanNumber,
}

impl PhiEntityType {
    pub fn as_str(&self) -> &str {
        match self {
            Self::PersonName => "PERSON_NAME",
            Self::MedicalRecordNumber => "MRN",
            Self::SocialSecurityNumber => "SSN",
            Self::DateOfBirth => "DOB",
            Self::Age => "AGE",
            Self::PhoneNumber => "PHONE",
            Self::EmailAddress => "EMAIL",
            Self::Address => "ADDRESS",
            Self::DeviceIdentifier => "DEVICE_ID",
            Self::IpAddress => "IP_ADDRESS",
            Self::BiometricIdentifier => "BIOMETRIC",
            Self::FacialPhoto => "PHOTO",
            Self::AccountNumber => "ACCOUNT",
            Self::LicensePlate => "LICENSE_PLATE",
            Self::VehicleIdentifier => "VEHICLE_ID",
            Self::WebUrl => "URL",
            Self::HealthPlanNumber => "HEALTH_PLAN",
        }
    }
}

/// Clinical NLP engine with pattern-based and rule-based PHI detection
pub struct ClinicalNlpEngine {
    patterns: Vec<PhiPattern>,
    common_names: HashSet<String>,
    medical_terms: HashSet<String>,
    #[cfg(feature = "nlp-full")]
    ner_model: Option<NERModel>,
}

struct PhiPattern {
    entity_type: PhiEntityType,
    regex: Regex,
    confidence: f32,
}

impl ClinicalNlpEngine {
    pub fn new() -> Self {
        let mut engine = Self {
            patterns: Vec::new(),
            common_names: Self::load_common_names(),
            medical_terms: Self::load_medical_terms(),
            #[cfg(feature = "nlp-full")]
            ner_model: None,
        };
        
        engine.initialize_patterns();
        engine.initialize_ner_model();
        engine
    }
    
    fn initialize_patterns(&mut self) {
        // Social Security Number (XXX-XX-XXXX)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::SocialSecurityNumber,
            regex: Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(),
            confidence: 0.95,
        });
        
        // Medical Record Number (various formats)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::MedicalRecordNumber,
            regex: Regex::new(r"\b(?:MRN|Medical Record|Patient ID)[:\s]*([A-Z0-9]{6,12})\b").unwrap(),
            confidence: 0.9,
        });
        
        // Phone numbers (multiple formats)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::PhoneNumber,
            regex: Regex::new(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b").unwrap(),
            confidence: 0.85,
        });
        
        // Email addresses
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::EmailAddress,
            regex: Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(),
            confidence: 0.9,
        });
        
        // Dates (various formats)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::DateOfBirth,
            regex: Regex::new(r"\b(?:DOB|Date of Birth|Born)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b").unwrap(),
            confidence: 0.9,
        });
        
        // Age over 89 (HIPAA requirement)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::Age,
            regex: Regex::new(r"\b(?:age|aged)\s+(9[0-9]|[1-9][0-9]{2,})\s*(?:years?|y\.?o\.?)\b").unwrap(),
            confidence: 0.85,
        });
        
        // IP Addresses
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::IpAddress,
            regex: Regex::new(r"\b(?:\d{1,3}\.){3}\d{1,3}\b").unwrap(),
            confidence: 0.8,
        });
        
        // URLs
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::WebUrl,
            regex: Regex::new(r"\bhttps?://[^\s]+\b").unwrap(),
            confidence: 0.9,
        });
        
        // Street addresses (simplified)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::Address,
            regex: Regex::new(r"\b\d+\s+[A-Z][a-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b").unwrap(),
            confidence: 0.75,
        });
        
        // License plates (US format)
        self.patterns.push(PhiPattern {
            entity_type: PhiEntityType::LicensePlate,
            regex: Regex::new(r"\b[A-Z]{2,3}[-\s]?\d{3,4}\b").unwrap(),
            confidence: 0.7,
        });
    }
    
    fn load_common_names() -> HashSet<String> {
        // In production, load from comprehensive name database
        // For now, include some common names
        vec![
            "John", "Mary", "James", "Patricia", "Robert", "Jennifer",
            "Michael", "Linda", "William", "Elizabeth", "David", "Barbara",
            "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah",
            "Charles", "Karen", "Christopher", "Nancy", "Daniel", "Lisa",
        ]
        .into_iter()
        .map(|s| s.to_string())
        .collect()
    }
    
    fn load_medical_terms() -> HashSet<String> {
        // Medical terms that should NOT be redacted
        vec![
            "diagnosis", "treatment", "medication", "symptom", "procedure",
            "surgery", "therapy", "prescription", "condition", "disease",
            "hypertension", "diabetes", "cancer", "infection", "inflammation",
            "cardiac", "pulmonary", "renal", "hepatic", "neurological",
        ]
        .into_iter()
        .map(|s| s.to_string())
        .collect()
    }

    #[cfg(feature = "nlp-full")]
    fn initialize_ner_model(&mut self) {
        let enable = std::env::var("CLINICAL_NLP_USE_RUSTBERT")
            .ok()
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);
        if !enable {
            return;
        }

        match NERModel::new(Default::default()) {
            Ok(model) => {
                self.ner_model = Some(model);
                tracing::info!("ClinicalNLP: rust-bert NER enabled");
            }
            Err(e) => {
                tracing::warn!("ClinicalNLP: failed to initialize rust-bert NER: {}", e);
                self.ner_model = None;
            }
        }
    }

    #[cfg(not(feature = "nlp-full"))]
    fn initialize_ner_model(&mut self) {}
    
    /// Detect PHI entities in clinical text
    pub fn detect_phi(&self, text: &str) -> Vec<PhiEntity> {
        let mut entities = Vec::new();
        
        // Pattern-based detection
        for pattern in &self.patterns {
            for capture in pattern.regex.find_iter(text) {
                entities.push(PhiEntity {
                    entity_type: pattern.entity_type.clone(),
                    text: capture.as_str().to_string(),
                    start: capture.start(),
                    end: capture.end(),
                    confidence: pattern.confidence,
                });
            }
        }
        
        // Name detection (rule-based)
        entities.extend(self.detect_names(text));
        
        // Optional model-based detection
        #[cfg(feature = "nlp-full")]
        {
            if let Some(model_entities) = self.detect_phi_with_ner(text) {
                entities.extend(model_entities);
            }
        }
        
        // Sort by position
        entities.sort_by_key(|e| e.start);
        
        // Merge overlapping entities
        self.merge_overlapping_entities(entities)
    }

    #[cfg(feature = "nlp-full")]
    fn detect_phi_with_ner(&self, text: &str) -> Option<Vec<PhiEntity>> {
        let model = self.ner_model.as_ref()?;
        let ner_output = model.predict(&[text]);
        let mut out = Vec::new();
        
        for entity in ner_output.get(0).into_iter().flatten() {
            let entity_type = match entity.label.as_str() {
                "PER" | "PERSON" => Some(PhiEntityType::PersonName),
                "LOC" | "LOCATION" => Some(PhiEntityType::Address),
                "DATE" => Some(PhiEntityType::DateOfBirth),
                _ => None,
            };
            
            if let Some(kind) = entity_type {
                out.push(PhiEntity {
                    entity_type: kind,
                    text: entity.word.clone(),
                    start: entity.start as usize,
                    end: entity.end as usize,
                    confidence: entity.score,
                });
            }
        }
        
        if out.is_empty() { None } else { Some(out) }
    }
    
    fn detect_names(&self, text: &str) -> Vec<PhiEntity> {
        let mut names = Vec::new();
        
        // Simple capitalized word detection
        let word_regex = Regex::new(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b").unwrap();
        
        for capture in word_regex.find_iter(text) {
            let name_candidate = capture.as_str();
            
            // Check if it's a known name or looks like a name
            if self.is_likely_name(name_candidate) {
                names.push(PhiEntity {
                    entity_type: PhiEntityType::PersonName,
                    text: name_candidate.to_string(),
                    start: capture.start(),
                    end: capture.end(),
                    confidence: 0.7,
                });
            }
        }
        
        names
    }
    
    fn is_likely_name(&self, text: &str) -> bool {
        let words: Vec<&str> = text.split_whitespace().collect();
        
        // Single word - check if it's a common name
        if words.len() == 1 {
            return self.common_names.contains(words[0]);
        }
        
        // Multiple words - check if any are common names
        // and it's not a medical term
        if words.len() >= 2 && words.len() <= 4 {
            let has_common_name = words.iter().any(|w| self.common_names.contains(*w));
            let is_medical = words.iter().any(|w| self.medical_terms.contains(&w.to_lowercase()));
            
            return has_common_name && !is_medical;
        }
        
        false
    }
    
    fn merge_overlapping_entities(&self, mut entities: Vec<PhiEntity>) -> Vec<PhiEntity> {
        if entities.is_empty() {
            return entities;
        }
        
        let mut merged = Vec::new();
        let mut current = entities.remove(0);
        
        for entity in entities {
            if entity.start <= current.end {
                // Overlapping - merge
                current.end = current.end.max(entity.end);
                current.confidence = current.confidence.max(entity.confidence);
            } else {
                merged.push(current);
                current = entity;
            }
        }
        merged.push(current);
        
        merged
    }
    
    /// Redact PHI entities from text
    pub fn redact_phi(&self, text: &str, entities: &[PhiEntity]) -> String {
        if entities.is_empty() {
            return text.to_string();
        }
        
        let mut result = String::new();
        let mut last_pos = 0;
        
        for entity in entities {
            // Add text before entity
            result.push_str(&text[last_pos..entity.start]);
            
            // Add redaction marker
            result.push_str(&format!("[{}]", entity.entity_type.as_str()));
            
            last_pos = entity.end;
        }
        
        // Add remaining text
        result.push_str(&text[last_pos..]);
        
        result
    }
    
    /// Full pipeline: detect and redact PHI
    pub fn process_clinical_text(&self, text: &str) -> (String, Vec<PhiEntity>) {
        let entities = self.detect_phi(text);
        let redacted = self.redact_phi(text, &entities);
        (redacted, entities)
    }
}

impl Default for ClinicalNlpEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detect_ssn() {
        let engine = ClinicalNlpEngine::new();
        let text = "Patient SSN: 123-45-6789";
        let entities = engine.detect_phi(text);
        
        assert_eq!(entities.len(), 1);
        assert_eq!(entities[0].entity_type, PhiEntityType::SocialSecurityNumber);
        assert_eq!(entities[0].text, "123-45-6789");
    }
    
    #[test]
    fn test_detect_phone() {
        let engine = ClinicalNlpEngine::new();
        let text = "Contact: (555) 123-4567";
        let entities = engine.detect_phi(text);
        
        assert!(entities.iter().any(|e| e.entity_type == PhiEntityType::PhoneNumber));
    }
    
    #[test]
    fn test_detect_email() {
        let engine = ClinicalNlpEngine::new();
        let text = "Email: patient@example.com";
        let entities = engine.detect_phi(text);
        
        assert!(entities.iter().any(|e| e.entity_type == PhiEntityType::EmailAddress));
    }
    
    #[test]
    fn test_detect_age_over_89() {
        let engine = ClinicalNlpEngine::new();
        let text = "Patient is aged 92 years old";
        let entities = engine.detect_phi(text);
        
        assert!(entities.iter().any(|e| e.entity_type == PhiEntityType::Age));
    }
    
    #[test]
    fn test_redact_phi() {
        let engine = ClinicalNlpEngine::new();
        let text = "Patient John Doe, SSN: 123-45-6789, phone: (555) 123-4567";
        let (redacted, entities) = engine.process_clinical_text(text);
        
        assert!(entities.len() >= 2);
        assert!(redacted.contains("[SSN]"));
        assert!(redacted.contains("[PHONE]"));
        assert!(!redacted.contains("123-45-6789"));
    }
    
    #[test]
    fn test_medical_terms_not_redacted() {
        let engine = ClinicalNlpEngine::new();
        let text = "Patient has hypertension and diabetes";
        let entities = engine.detect_phi(text);
        
        // Medical terms should not be detected as PHI
        assert!(entities.is_empty() || !entities.iter().any(|e| 
            e.text.to_lowercase().contains("hypertension") || 
            e.text.to_lowercase().contains("diabetes")
        ));
    }
}

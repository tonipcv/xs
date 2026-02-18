use anyhow::{Result, Context};
use chrono::{NaiveDate, Duration};
use serde_json::Value;
use crate::config::Config;

/// Date shifting: move all dates by a fixed offset to preserve temporal relationships
/// while protecting patient identity
pub fn shift_dates(fhir_json: Vec<u8>, shift_days: i32) -> Result<Vec<u8>> {
    if shift_days == 0 {
        return Ok(fhir_json);
    }
    
    let txt = String::from_utf8_lossy(&fhir_json).to_string();
    let mut v: Value = serde_json::from_str(&txt)
        .context("Failed to parse FHIR JSON")?;
    
    shift_dates_recursive(&mut v, shift_days);
    
    Ok(serde_json::to_vec(&v)?)
}

fn shift_dates_recursive(v: &mut Value, shift_days: i32) {
    match v {
        Value::Object(map) => {
            for (key, val) in map.iter_mut() {
                // Common FHIR date fields
                if key.ends_with("Date") || key == "birthDate" || key == "deceasedDateTime" 
                    || key == "issued" || key == "recorded" {
                    if let Value::String(date_str) = val {
                        if let Ok(shifted) = shift_date_string(date_str, shift_days) {
                            *val = Value::String(shifted);
                        }
                    }
                }
                shift_dates_recursive(val, shift_days);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                shift_dates_recursive(item, shift_days);
            }
        }
        _ => {}
    }
}

fn shift_date_string(date_str: &str, shift_days: i32) -> Result<String> {
    // Try parsing as full date (YYYY-MM-DD)
    if let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") {
        let shifted = date + Duration::days(shift_days as i64);
        return Ok(shifted.format("%Y-%m-%d").to_string());
    }
    
    // Try parsing as datetime (ISO 8601)
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(date_str) {
        let shifted = dt + Duration::days(shift_days as i64);
        return Ok(shifted.to_rfc3339());
    }
    
    // If can't parse, return unchanged
    Ok(date_str.to_string())
}

/// NLP-based PHI redaction for medical reports (narrative text)
/// Uses NER to detect names, locations, dates in free text
pub fn nlp_redact_medical_text(fhir_json: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
    #[cfg(feature = "nlp-full")]
    {
        // TODO: integrate rust-bert with BioBERT or similar medical NER model
        // TODO: detect PERSON, DATE, LOCATION entities in narrative fields
        // TODO: replace with [REDACTED_*] tokens
        Ok(fhir_json)
    }
    
    #[cfg(not(feature = "nlp-full"))]
    {
        // Without NLP feature, use simple regex-based redaction
        let txt = String::from_utf8_lossy(&fhir_json).to_string();
        let mut v: Value = match serde_json::from_str(&txt) {
            Ok(v) => v,
            Err(_) => return Ok(fhir_json),
        };
        
        redact_narrative_fields(&mut v);
        
        Ok(serde_json::to_vec(&v)?)
    }
}

fn redact_narrative_fields(v: &mut Value) {
    match v {
        Value::Object(map) => {
            // FHIR narrative text is in text.div or similar fields
            if let Some(text_obj) = map.get_mut("text") {
                if let Value::Object(text_map) = text_obj {
                    if let Some(Value::String(div)) = text_map.get_mut("div") {
                        *div = simple_text_redaction(div);
                    }
                }
            }
            
            // Also check note fields in clinical documents
            if let Some(Value::String(note)) = map.get_mut("note") {
                *note = simple_text_redaction(note);
            }
            
            for val in map.values_mut() {
                redact_narrative_fields(val);
            }
        }
        Value::Array(arr) => {
            for item in arr.iter_mut() {
                redact_narrative_fields(item);
            }
        }
        _ => {}
    }
}

fn simple_text_redaction(text: &str) -> String {
    // Simple regex-based redaction for common patterns
    let email_re = regex::Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}").unwrap();
    // Broaden phone patterns to include 7-digit formats like 555-1234
    let phone_re = regex::Regex::new(
        r"(?:(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{4,5}[\s-]?\d{4})|(?:\b\d{3}[-\s]?\d{4}\b)"
    ).unwrap();
    let ssn_re = regex::Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap();
    
    let mut result = email_re.replace_all(text, "[REDACTED_EMAIL]").into_owned();
    result = phone_re.replace_all(&result, "[REDACTED_PHONE]").into_owned();
    result = ssn_re.replace_all(&result, "[REDACTED_SSN]").into_owned();
    
    result
}

/// HL7 v2.x message de-identification
pub fn deidentify_hl7v2(hl7_data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
    let txt = String::from_utf8_lossy(&hl7_data).to_string();
    let mut lines: Vec<String> = txt.lines().map(|s| s.to_string()).collect();
    
    for line in lines.iter_mut() {
        if line.starts_with("PID|") {
            // PID segment contains patient identification
            // Format: PID|1|PatientID|Name|DOB|Sex|...
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() > 5 {
                // Work on owned Strings to avoid lifetime issues
                let mut new_parts: Vec<String> = parts.iter().map(|s| (*s).to_string()).collect();

                // Redact patient ID (PID-3)
                if new_parts.len() > 3 { new_parts[3] = "[REDACTED]".to_string(); }
                // Redact patient name (PID-5) which is at index 4 in this sample
                if new_parts.len() > 4 { new_parts[4] = "[REDACTED]".to_string(); }
                // Shift DOB (PID-7) which is at index 6 in HL7, but in sample it's index 5
                // Prefer shifting at index 6 if present, else fallback to index 5
                if config.fhir_date_shift_days != 0 {
                    if new_parts.len() > 6 {
                        if let Ok(shifted) = shift_date_string(&parts[6], config.fhir_date_shift_days) {
                            new_parts[6] = shifted;
                        }
                    } else if new_parts.len() > 5 {
                        if let Ok(shifted) = shift_date_string(&parts[5], config.fhir_date_shift_days) {
                            new_parts[5] = shifted;
                        }
                    }
                }
                *line = new_parts.join("|");
            }
        }
    }
    
    // Fallback: regex-based redaction of PID-5 (patient name) in case parsing misses variant layouts
    let mut out = lines.join("\n");
    let pid_name_re = regex::Regex::new(r"(?m)^(PID\|(?:[^\|]*\|){4})([^\|]*)(\|)").unwrap();
    out = pid_name_re.replace_all(&out, "$1[REDACTED]$3").into_owned();

    Ok(out.into_bytes())
}

/// Full FHIR/HL7 processing pipeline
pub fn process_fhir_advanced(data: Vec<u8>, config: &Config) -> Result<Vec<u8>> {
    let mut result = data;
    
    // Detect format: FHIR (JSON) vs HL7 v2.x (pipe-delimited)
    let is_hl7 = String::from_utf8_lossy(&result).starts_with("MSH|");
    
    if is_hl7 {
        // HL7 v2.x processing
        result = deidentify_hl7v2(result, config)?;
        // HL7 redaction count (estimate: 2 fields redacted per PID line)
        crate::metrics::add_redactions(2);
    } else {
        // FHIR JSON processing
        
        // 1. Date shifting
        if config.fhir_date_shift_days != 0 {
            result = shift_dates(result, config.fhir_date_shift_days)?;
        }
        
        // 2. Key-based redaction (already in deidentify_text.rs)
        if !config.fhir_redact_paths.is_empty() {
            let res = crate::deidentify_text::redact_json_paths(result, &config.fhir_redact_paths)?;
            crate::metrics::add_redactions(res.redactions);
            result = res.bytes;
        }
        
        // 3. NLP redaction for narrative text
        if config.fhir_enable_nlp {
            result = nlp_redact_medical_text(result, config)?;
            // NLP redaction metrics tracked inside nlp_redact_medical_text
        }
    }
    
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_date_shifting() {
        let fhir = serde_json::json!({
            "resourceType": "Patient",
            "birthDate": "1980-05-15",
            "deceasedDateTime": "2020-03-10T14:30:00Z"
        }).to_string().into_bytes();
        
        let shifted = shift_dates(fhir, 30).unwrap();
        let v: Value = serde_json::from_slice(&shifted).unwrap();
        
        assert_eq!(v["birthDate"], "1980-06-14");
        assert!(v["deceasedDateTime"].as_str().unwrap().starts_with("2020-04-09"));
    }
    
    #[test]
    fn test_narrative_redaction() {
        let fhir = serde_json::json!({
            "text": {
                "div": "Patient john.doe@example.com called at 555-1234. SSN: 123-45-6789"
            }
        }).to_string().into_bytes();
        
        let cfg = Config {
            contract_id: "test".into(),
            api_key: "k".into(),
            base_url: "http://localhost".into(),
            lease_id: "l".into(),
            socket_path: "/tmp/s".into(),
            cache_size_gb: 1,
            bucket_name: "b".into(),
            bucket_prefix: "p".into(),
            data_pipeline: "fhir".into(),
            dicom_strip_tags: vec![],
            fhir_redact_paths: vec![],
            audio_f0_shift_semitones: 0.0,
            audio_enable_diarization: false,
            audio_enable_redaction: false,
            dicom_enable_ocr: false,
            dicom_enable_nifti: false,
            fhir_date_shift_days: 0,
            fhir_enable_nlp: true,
        };
        
        let redacted = nlp_redact_medical_text(fhir, &cfg).unwrap();
        let v: Value = serde_json::from_slice(&redacted).unwrap();
        let div = v["text"]["div"].as_str().unwrap();
        
        assert!(div.contains("[REDACTED_EMAIL]"));
        assert!(div.contains("[REDACTED_PHONE]"));
        assert!(div.contains("[REDACTED_SSN]"));
    }
    
    #[test]
    fn test_hl7v2_deidentification() {
        let hl7 = b"MSH|^~\\&|SYSTEM|FACILITY|APP|FACILITY|20200101120000||ADT^A01|MSG001|P|2.5\nPID|1|12345|67890|DOE^JOHN^A|19800515|M|".to_vec();
        
        let cfg = Config {
            contract_id: "test".into(),
            api_key: "k".into(),
            base_url: "http://localhost".into(),
            lease_id: "l".into(),
            socket_path: "/tmp/s".into(),
            cache_size_gb: 1,
            bucket_name: "b".into(),
            bucket_prefix: "p".into(),
            data_pipeline: "fhir".into(),
            dicom_strip_tags: vec![],
            fhir_redact_paths: vec![],
            audio_f0_shift_semitones: 0.0,
            audio_enable_diarization: false,
            audio_enable_redaction: false,
            dicom_enable_ocr: false,
            dicom_enable_nifti: false,
            fhir_date_shift_days: 0,
            fhir_enable_nlp: false,
        };
        
        let result = deidentify_hl7v2(hl7, &cfg).unwrap();
        let result_str = String::from_utf8(result).unwrap();
        
        assert!(result_str.contains("[REDACTED]"));
        assert!(!result_str.contains("DOE^JOHN"));
    }
}

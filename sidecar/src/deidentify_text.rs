use anyhow::Result;

pub struct RedactResult {
    pub bytes: Vec<u8>,
    pub redactions: u64,
}

// Simple text redaction for common patterns (emails/phones) as a stub
pub fn redact_common_text(data: Vec<u8>) -> Result<RedactResult> {
    let s = String::from_utf8_lossy(&data).to_string();
    let email_re = regex::Regex::new(r"(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}").unwrap();
    // Broaden phone regex to match various formats: +1 415-555-1212, 555-1234, (03) 5555 6473, etc.
    let phone_re = regex::Regex::new(
        r"(?:(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)?\d{3,5}[\s-]?\d{4})|(?:\b\d{3}[-\s]?\d{4}\b)"
    ).unwrap();

    let email_count = email_re.find_iter(&s).count() as u64;
    let s = email_re.replace_all(&s, "[REDACTED_EMAIL]").into_owned();

    let phone_count = phone_re.find_iter(&s).count() as u64;
    let s = phone_re.replace_all(&s, "[REDACTED_PHONE]").into_owned();

    Ok(RedactResult { bytes: s.into_bytes(), redactions: email_count + phone_count })
}

// JSON path redaction stub: if payload is JSON, remove keys that match top-level names passed in paths
pub fn redact_json_paths(data: Vec<u8>, paths: &Vec<String>) -> Result<RedactResult> {
    let txt = String::from_utf8_lossy(&data).to_string();
    let mut v: serde_json::Value = match serde_json::from_str(&txt) { Ok(v) => v, Err(_) => return Ok(RedactResult { bytes: data, redactions: 0 }) };

    let mut removed: u64 = 0;
    for p in paths {
        if let Some(key) = p.trim_start_matches("$.").split('.').next() {
            if let serde_json::Value::Object(ref mut map) = v {
                if map.remove(key).is_some() { removed += 1; }
            }
        }
    }

    Ok(RedactResult { bytes: serde_json::to_vec(&v)?, redactions: removed })
}

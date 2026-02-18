use anyhow::Result;
use crate::config::Config;

// Feature-gated DICOM de-identification. If the `dicom` feature is ON, try to strip
// common PHI tags based on config; otherwise, return unchanged.
pub fn deidentify_dicom(data: Vec<u8>, _config: &Config) -> Result<Vec<u8>> {
    #[cfg(feature = "dicom")]
    {
        use dicom_object::from_reader;
        use dicom_core::Tag;

        // Attempt to parse the DICOM object. If it fails, return unchanged.
        let mut cursor = std::io::Cursor::new(&data);
        let mut obj = match from_reader(&mut cursor) {
            Ok(o) => o,
            Err(_) => return Ok(data),
        };

        // Minimal tag mapping; extend as needed
        fn map_tag(name: &str) -> Option<Tag> {
            match name {
                "PatientName" => Some(Tag(0x0010, 0x0010)),
                "PatientID" => Some(Tag(0x0010, 0x0020)),
                "InstitutionName" => Some(Tag(0x0008, 0x0080)),
                _ => None,
            }
        }

        for tname in &config.dicom_strip_tags {
            if let Some(tag) = map_tag(tname.as_str()) {
                let _ = obj.put_empty(tag);
            }
        }

        // Serialize back to bytes
        let mut out = Vec::new();
        obj.write_to(&mut out)?;
        return Ok(out);
    }

    #[cfg(not(feature = "dicom"))]
    {
        Ok(data)
    }
}

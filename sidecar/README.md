# Xase Sidecar

Runtime data pipeline for multi-modal governance (Audio, DICOM, FHIR/HL7, Text, TimeSeries).

## Pipeline Capabilities and Fallbacks

The Sidecar is compiled with feature flags. When a full feature is not enabled, the Sidecar executes a safe fallback (stub/no-op) and logs a warning.

| Modality | Capability                | Status (default build) | Fallback behavior |
|----------|---------------------------|-------------------------|-------------------|
| Audio    | Speaker diarization       | stub                    | Returns mock segments `SPEAKER_00` only |
| Audio    | PHI redaction             | noop                    | Returns audio unchanged |
| Audio    | Watermarking              | enabled                 | Probabilistic PN watermark |
| DICOM    | OCR pixel scrub           | stub                    | Returns DICOM unchanged |
| DICOM    | NIfTI conversion          | stub                    | Returns minimal 352-byte header |
| FHIR     | Date shifting             | enabled                 | Shifts date/time fields by configured days |
| FHIR     | JSON key redaction        | enabled                 | Removes configured JSON paths |
| FHIR     | NLP narrative redaction   | fallback_regex          | Regex-based redaction (email/phone/SSN) |
| Text     | Regex redaction           | enabled                 | Email/phone redaction + metrics |
| TimeSeries | Passthrough             | enabled                 | Counts bytes only |

Notes:
- When a fallback path executes, a `tracing::warn` is emitted.
- Telemetry aggregates the number of fallback usages per category.

## HTTP Control-Plane: Pipeline Config

Endpoint (served by the app):

GET /api/v1/sidecar/pipeline/config

Response example:

```json
{
  "activePipeline": "audio",
  "modalities": ["AUDIO", "DICOM", "FHIR", "TEXT", "TIMESERIES"],
  "transforms": {
    "AUDIO": ["watermark_probabilistic", "phi_redaction", "diarization"],
    "DICOM": ["tag_stripping", "ocr_pixel_scrub", "nifti_convert"],
    "FHIR": ["date_shift", "json_key_redaction", "nlp_redaction"],
    "TEXT": ["regex_redaction"],
    "TIMESERIES": []
  },
  "capabilities": {
    "audio": { "diarization": {"status":"stub"}, "phi_redaction": {"status":"noop"}, "watermark": {"status":"enabled"} },
    "dicom": { "ocr_scrub": {"status":"stub"}, "nifti_convert": {"status":"stub"} },
    "fhir": { "date_shift": {"status":"enabled"}, "json_key_redaction": {"status":"enabled"}, "nlp_redaction": {"status":"fallback_regex"} },
    "text": { "regex_redaction": {"status":"enabled"} },
    "timeseries": {}
  },
  "versions": {
    "audio": {"watermark": "pn_correlation_v1"},
    "dicom": {},
    "fhir": {},
    "text": {},
    "timeseries": {}
  },
  "updatedAt": "2026-02-18T22:00:00Z"
}
```

Environment flags reflected by the endpoint:
- `DATA_PIPELINE` (audio|dicom|fhir|text|timeseries|passthrough)
- `AUDIO_ENABLE_DIARIZATION` (true/1)
- `AUDIO_ENABLE_REDACTION` (true/1)
- `DICOM_ENABLE_OCR` (true/1)
- `DICOM_ENABLE_NIFTI` (true/1)
- `FHIR_ENABLE_NLP` (true/1)

## Telemetry: Fallback Usage Metrics

Every 10s the Sidecar posts an aggregate telemetry event including fallback counters:

```json
{
  "eventType": "serve",
  "metadata": {
    "fallbacks": {
      "audio_diarization_mock": 0,
      "audio_redaction_noop": 0,
      "dicom_ocr_stub": 0,
      "dicom_nifti_stub": 0,
      "nlp_regex_fallback": 0
    }
  }
}
```

## Enabling Full Features

Build-time features (examples):
- Audio Full: enable `audio-full` to activate real diarization and audio PHI redaction integration stubs.
- DICOM Full: enable `dicom-full` and optionally `tesseract` to activate OCR scrubbing; enable `nifti` to write full NIfTI output.
- NLP Full: enable `nlp-full` to use model-based narrative redaction.

Runtime flags (environment):
- `AUDIO_ENABLE_DIARIZATION=true` to enable diarization in the audio pipeline.
- `AUDIO_ENABLE_REDACTION=true` to enable PHI redaction in the audio pipeline.
- `DICOM_ENABLE_OCR=true` to run OCR scrubbing.
- `DICOM_ENABLE_NIFTI=true` to convert to NIfTI.
- `FHIR_ENABLE_NLP=true` to enable NLP redaction on narrative text.

## Development

- Build: `cargo build`
- Test: `cargo test`
- Logs use `tracing`. Adjust RUST_LOG as needed, e.g. `RUST_LOG=info`.

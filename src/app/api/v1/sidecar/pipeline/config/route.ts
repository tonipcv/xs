import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey, checkApiRateLimit } from '@/lib/xase/auth'

// Minimal pipeline config exposure for SDK control-plane
// Reflects environment-driven capabilities and transforms
export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-api-key') || ''
    const auth = await validateApiKey(apiKey)
    if (!auth.valid || !auth.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting stubbed

    // Read env flags (mirroring Sidecar config flags) to describe capabilities
    const audioDiar = process.env.AUDIO_ENABLE_DIARIZATION === 'true' || process.env.AUDIO_ENABLE_DIARIZATION === '1'
    const audioPHI = process.env.AUDIO_ENABLE_REDACTION === 'true' || process.env.AUDIO_ENABLE_REDACTION === '1'
    const dicomOCR = process.env.DICOM_ENABLE_OCR === 'true' || process.env.DICOM_ENABLE_OCR === '1'
    const dicomNifti = process.env.DICOM_ENABLE_NIFTI === 'true' || process.env.DICOM_ENABLE_NIFTI === '1'
    const fhirNlp = process.env.FHIR_ENABLE_NLP === 'true' || process.env.FHIR_ENABLE_NLP === '1'

    const activePipeline = process.env.DATA_PIPELINE || 'audio'

    const modalities = ['AUDIO','DICOM','FHIR','TEXT','TIMESERIES']

    const transforms: Record<string, string[]> = {
      AUDIO: ['watermark_probabilistic'].concat(audioPHI ? ['phi_redaction'] : []).concat(audioDiar ? ['diarization'] : []),
      DICOM: ['tag_stripping'].concat(dicomOCR ? ['ocr_pixel_scrub'] : []).concat(dicomNifti ? ['nifti_convert'] : []),
      FHIR: ['date_shift','json_key_redaction'].concat(fhirNlp ? ['nlp_redaction'] : []),
      TEXT: ['regex_redaction'],
      TIMESERIES: []
    }

    const capabilities = {
      audio: {
        diarization: audioDiar ? { status: 'enabled' } : { status: 'stub' },
        phi_redaction: audioPHI ? { status: 'enabled' } : { status: 'noop' },
        watermark: { status: 'enabled', method: 'probabilistic_v1' }
      },
      dicom: {
        ocr_scrub: dicomOCR ? { status: 'enabled' } : { status: 'stub' },
        nifti_convert: dicomNifti ? { status: 'enabled' } : { status: 'stub' }
      },
      fhir: {
        date_shift: { status: 'enabled' },
        json_key_redaction: { status: 'enabled' },
        nlp_redaction: fhirNlp ? { status: 'enabled' } : { status: 'fallback_regex' }
      },
      text: {
        regex_redaction: { status: 'enabled' }
      },
      timeseries: {}
    }

    const versions = {
      audio: { watermark: 'pn_correlation_v1' },
      dicom: {},
      fhir: {},
      text: {},
      timeseries: {}
    }

    return NextResponse.json({
      activePipeline,
      modalities,
      transforms,
      capabilities,
      versions,
      updatedAt: new Date().toISOString()
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}

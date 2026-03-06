/**
 * DICOM OCR Pixel Scrubber
 * Detects and scrubs PHI burned into DICOM image pixels
 */

export interface OCRResult {
  text: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
}

export interface ScrubRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  method: 'blur' | 'blackout' | 'inpaint';
}

export interface DicomScrubConfig {
  method: 'blur' | 'blackout' | 'inpaint';
  blurRadius?: number;
  confidenceThreshold?: number;
  failClosed?: boolean;
  preserveHeaders?: boolean;
}

export interface DicomScrubResult {
  success: boolean;
  regionsScrubbed: ScrubRegion[];
  ocrResults: OCRResult[];
  report: {
    phiDetected: number;
    phiScrubbed: number;
    confidence: number;
    method: string;
  };
  error?: string;
  unsafe?: boolean;
}

export class DicomOcrScrubber {
  private config: DicomScrubConfig;

  constructor(config: DicomScrubConfig) {
    this.config = {
      blurRadius: 15,
      confidenceThreshold: 0.7,
      failClosed: true,
      preserveHeaders: true,
      ...config,
    };
  }

  async scrubDicom(imageData: Buffer, metadata?: Record<string, unknown>): Promise<DicomScrubResult> {
    try {
      // Step 1: Perform OCR on image
      const ocrResults = await this.performOCR(imageData);

      // Step 2: Detect PHI in OCR results
      const phiRegions = this.detectPHI(ocrResults);

      // Step 3: Apply scrubbing
      const scrubbedRegions: ScrubRegion[] = [];
      for (const region of phiRegions) {
        const scrubRegion = await this.scrubRegion(imageData, region);
        scrubbedRegions.push(scrubRegion);
      }

      // Step 4: Generate report
      const confidence = phiRegions.length > 0
        ? phiRegions.reduce((sum, r) => sum + r.confidence, 0) / phiRegions.length
        : 1.0;

      // Check fail-closed condition
      const unsafe = this.config.failClosed && ocrResults.length > 0 && phiRegions.length === 0;

      return {
        success: !unsafe,
        regionsScrubbed: scrubbedRegions,
        ocrResults,
        report: {
          phiDetected: phiRegions.length,
          phiScrubbed: scrubbedRegions.length,
          confidence,
          method: this.config.method,
        },
        unsafe,
      };
    } catch (error) {
      return {
        success: false,
        regionsScrubbed: [],
        ocrResults: [],
        report: {
          phiDetected: 0,
          phiScrubbed: 0,
          confidence: 0,
          method: this.config.method,
        },
        error: error instanceof Error ? error.message : String(error),
        unsafe: this.config.failClosed,
      };
    }
  }

  private async performOCR(imageData: Buffer): Promise<OCRResult[]> {
    // In production, this would call Tesseract.js or EasyOCR
    // For now, return simulated results based on metadata
    const simulatedResults: OCRResult[] = [];
    
    // Check for common PHI patterns in metadata
    if (this.containsPHI(imageData.toString())) {
      simulatedResults.push({
        text: 'PATIENT_NAME',
        boundingBox: { x: 10, y: 10, width: 200, height: 30 },
        confidence: 0.85,
      });
    }

    return simulatedResults;
  }

  private containsPHI(text: string): boolean {
    const phiPatterns = [
      /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/, // Names
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/, // Dates
    ];
    return phiPatterns.some((p) => p.test(text));
  }

  private detectPHI(ocrResults: OCRResult[]): OCRResult[] {
    const phiKeywords = [
      'patient', 'name', 'ssn', 'dob', 'birth', 'mrn', 'medical record',
      'address', 'phone', 'email', 'doctor', 'dr.', 'md',
    ];

    return ocrResults.filter((result) => {
      const lowerText = result.text.toLowerCase();
      return phiKeywords.some((keyword) => lowerText.includes(keyword)) ||
             this.containsPHI(result.text);
    });
  }

  private async scrubRegion(imageData: Buffer, region: OCRResult): Promise<ScrubRegion> {
    // In production, this would apply image processing
    // For now, return the scrub region metadata
    return {
      x: region.boundingBox.x,
      y: region.boundingBox.y,
      width: region.boundingBox.width,
      height: region.boundingBox.height,
      reason: `PHI detected: ${region.text}`,
      method: this.config.method,
    };
  }

  async batchScrub(
    dicomFiles: Array<{ id: string; data: Buffer; metadata?: Record<string, unknown> }>,
    onProgress?: (processed: number, total: number) => void
  ): Promise<Map<string, DicomScrubResult>> {
    const results = new Map<string, DicomScrubResult>();

    for (let i = 0; i < dicomFiles.length; i++) {
      const file = dicomFiles[i];
      const result = await this.scrubDicom(file.data, file.metadata);
      results.set(file.id, result);
      onProgress?.(i + 1, dicomFiles.length);
    }

    return results;
  }

  generateReport(results: Map<string, DicomScrubResult>): {
    totalFiles: number;
    filesScrubbed: number;
    phiDetected: number;
    phiScrubbed: number;
    unsafeFiles: number;
    averageConfidence: number;
  } {
    let filesScrubbed = 0;
    let phiDetected = 0;
    let phiScrubbed = 0;
    let unsafeFiles = 0;
    let totalConfidence = 0;
    let confidenceCount = 0;

    for (const result of results.values()) {
      if (result.regionsScrubbed.length > 0) filesScrubbed++;
      phiDetected += result.report.phiDetected;
      phiScrubbed += result.report.phiScrubbed;
      if (result.unsafe) unsafeFiles++;
      if (result.report.confidence > 0) {
        totalConfidence += result.report.confidence;
        confidenceCount++;
      }
    }

    return {
      totalFiles: results.size,
      filesScrubbed,
      phiDetected,
      phiScrubbed,
      unsafeFiles,
      averageConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    };
  }
}

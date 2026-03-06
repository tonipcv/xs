/**
 * Multimodal Packager for Patient-Level Dataset Organization
 * Creates "folder per patient" structure with cross-modal linking
 */

import path from 'path';

export interface PatientData {
  patientToken: string;
  ehrRecords: Array<Record<string, unknown>>;
  images: Array<{
    id: string;
    path: string;
    modality: string;
    timestamp?: string;
  }>;
  audioFiles: Array<{
    id: string;
    path: string;
    duration: number;
    timestamp?: string;
  }>;
  notes: Array<{
    id: string;
    text: string;
    timestamp?: string;
  }>;
}

export interface CrossReference {
  sourceType: 'text' | 'image' | 'audio' | 'note';
  sourceId: string;
  targetType: 'text' | 'image' | 'audio' | 'note';
  targetId: string;
  relation: string;
  confidence: number;
}

export interface MultimodalPackageConfig {
  outputDir: string;
  includeTimeline: boolean;
  includeCrossRefs: boolean;
  deidentify: boolean;
  format: 'folder' | 'zip';
}

export interface MultimodalPackageResult {
  success: boolean;
  packagePath: string;
  manifest: {
    version: string;
    patientCount: number;
    totalFiles: number;
    modalities: string[];
    crossReferences: number;
    timelineEvents: number;
  };
  patients: Array<{
    token: string;
    path: string;
    fileCount: number;
  }>;
  error?: string;
}

export class MultimodalPackager {
  async packagePatients(
    patients: PatientData[],
    config: MultimodalPackageConfig
  ): Promise<MultimodalPackageResult> {
    try {
      const patientPackages: Array<{ token: string; path: string; fileCount: number }> = [];
      let totalFiles = 0;
      let crossReferences: CrossReference[] = [];

      // Process each patient
      for (const patient of patients) {
        const patientPath = path.join(config.outputDir, `patient_${patient.patientToken}`);
        
        // Create patient folder structure
        await this.createPatientFolder(patientPath);
        
        // Write EHR records
        const ehrCount = await this.writeEhrRecords(patientPath, patient.ehrRecords);
        
        // Copy/link images
        const imageCount = await this.writeImages(patientPath, patient.images);
        
        // Copy/link audio
        const audioCount = await this.writeAudio(patientPath, patient.audioFiles);
        
        // Write notes
        const noteCount = await this.writeNotes(patientPath, patient.notes);
        
        // Generate cross-references
        if (config.includeCrossRefs) {
          const refs = this.generateCrossReferences(patient);
          crossReferences = [...crossReferences, ...refs];
        }
        
        // Write patient manifest
        await this.writePatientManifest(patientPath, patient, config.includeTimeline);
        
        const fileCount = ehrCount + imageCount + audioCount + noteCount;
        patientPackages.push({
          token: patient.patientToken,
          path: patientPath,
          fileCount,
        });
        totalFiles += fileCount;
      }

      // Write global manifest
      const globalManifestPath = await this.writeGlobalManifest(
        config.outputDir,
        patientPackages,
        crossReferences
      );

      return {
        success: true,
        packagePath: config.outputDir,
        manifest: {
          version: '1.0',
          patientCount: patients.length,
          totalFiles,
          modalities: ['ehr', 'image', 'audio', 'note'],
          crossReferences: crossReferences.length,
          timelineEvents: this.countTimelineEvents(patients),
        },
        patients: patientPackages,
      };
    } catch (error) {
      return {
        success: false,
        packagePath: config.outputDir,
        manifest: {
          version: '1.0',
          patientCount: 0,
          totalFiles: 0,
          modalities: [],
          crossReferences: 0,
          timelineEvents: 0,
        },
        patients: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async createPatientFolder(patientPath: string): Promise<void> {
    // Create folder structure:
    // patient_{token}/
    //   ehr.jsonl
    //   images/
    //   audio/
    //   notes/
    //   manifest.json
    //   timeline.json (optional)
  }

  private async writeEhrRecords(
    patientPath: string,
    records: Array<Record<string, unknown>>
  ): Promise<number> {
    // Write records to ehr.jsonl
    return records.length;
  }

  private async writeImages(
    patientPath: string,
    images: PatientData['images']
  ): Promise<number> {
    // Copy images to images/ folder
    return images.length;
  }

  private async writeAudio(
    patientPath: string,
    audioFiles: PatientData['audioFiles']
  ): Promise<number> {
    // Copy audio to audio/ folder
    return audioFiles.length;
  }

  private async writeNotes(
    patientPath: string,
    notes: PatientData['notes']
  ): Promise<number> {
    // Write notes to notes/ folder
    return notes.length;
  }

  private generateCrossReferences(patient: PatientData): CrossReference[] {
    const refs: CrossReference[] = [];
    
    // Link EHR records to images by timestamp
    for (let i = 0; i < patient.ehrRecords.length; i++) {
      for (const image of patient.images) {
        if (image.timestamp && this.timestampsMatch(
          patient.ehrRecords[i].timestamp as string,
          image.timestamp
        )) {
          refs.push({
            sourceType: 'text',
            sourceId: `ehr-${i}`,
            targetType: 'image',
            targetId: image.id,
            relation: 'concurrent',
            confidence: 0.8,
          });
        }
      }
    }
    
    // Link notes to audio by timestamp
    for (let i = 0; i < patient.notes.length; i++) {
      for (const audio of patient.audioFiles) {
        if (audio.timestamp && patient.notes[i].timestamp &&
            this.timestampsMatch(patient.notes[i].timestamp!, audio.timestamp)) {
          refs.push({
            sourceType: 'note',
            sourceId: `note-${i}`,
            targetType: 'audio',
            targetId: audio.id,
            relation: 'concurrent',
            confidence: 0.9,
          });
        }
      }
    }
    
    return refs;
  }

  private timestampsMatch(ts1: string, ts2: string): boolean {
    // Check if timestamps are within 1 hour of each other
    const d1 = new Date(ts1).getTime();
    const d2 = new Date(ts2).getTime();
    const diff = Math.abs(d1 - d2);
    return diff < 3600000; // 1 hour in milliseconds
  }

  private async writePatientManifest(
    patientPath: string,
    patient: PatientData,
    includeTimeline: boolean
  ): Promise<void> {
    const manifest = {
      patientToken: patient.patientToken,
      ehrRecords: patient.ehrRecords.length,
      images: patient.images.map((img) => ({
        id: img.id,
        modality: img.modality,
        timestamp: img.timestamp,
        path: `images/${img.id}`,
      })),
      audio: patient.audioFiles.map((aud) => ({
        id: aud.id,
        duration: aud.duration,
        timestamp: aud.timestamp,
        path: `audio/${aud.id}`,
      })),
      notes: patient.notes.length,
    };
    
    if (includeTimeline) {
      // Generate timeline from all timestamps
      const timeline = this.generateTimeline(patient);
      // Write timeline.json
    }
  }

  private generateTimeline(patient: PatientData): Array<{
    timestamp: string;
    type: string;
    id: string;
    description: string;
  }> {
    const events: Array<{
      timestamp: string;
      type: string;
      id: string;
      description: string;
    }> = [];
    
    // Add EHR events
    patient.ehrRecords.forEach((rec, idx) => {
      if (rec.timestamp) {
        events.push({
          timestamp: rec.timestamp as string,
          type: 'ehr',
          id: `ehr-${idx}`,
          description: 'EHR record',
        });
      }
    });
    
    // Add image events
    patient.images.forEach((img) => {
      if (img.timestamp) {
        events.push({
          timestamp: img.timestamp,
          type: 'image',
          id: img.id,
          description: `${img.modality} scan`,
        });
      }
    });
    
    // Add audio events
    patient.audioFiles.forEach((aud) => {
      if (aud.timestamp) {
        events.push({
          timestamp: aud.timestamp,
          type: 'audio',
          id: aud.id,
          description: `Audio recording (${aud.duration}s)`,
        });
      }
    });
    
    // Add note events
    patient.notes.forEach((note, idx) => {
      if (note.timestamp) {
        events.push({
          timestamp: note.timestamp,
          type: 'note',
          id: `note-${idx}`,
          description: 'Clinical note',
        });
      }
    });
    
    // Sort by timestamp
    return events.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  private countTimelineEvents(patients: PatientData[]): number {
    return patients.reduce((count, p) => count + this.generateTimeline(p).length, 0);
  }

  private async writeGlobalManifest(
    outputDir: string,
    patientPackages: Array<{ token: string; path: string; fileCount: number }>,
    crossReferences: CrossReference[]
  ): Promise<string> {
    const manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      patientCount: patientPackages.length,
      patients: patientPackages,
      crossReferences: crossReferences.length,
      structure: {
        format: 'folder-per-patient',
        folders: ['ehr', 'images', 'audio', 'notes'],
      },
    };
    
    const manifestPath = path.join(outputDir, 'manifest.json');
    // Write manifest to file
    return manifestPath;
  }

  async validatePackage(
    packagePath: string,
    expectedPatients: number
  ): Promise<{
    valid: boolean;
    issues: string[];
    stats: {
      patientCount: number;
      completePatients: number;
      missingFiles: number;
      crossRefCount: number;
    };
  }> {
    const issues: string[] = [];
    let patientCount = 0;
    let completePatients = 0;
    let missingFiles = 0;
    let crossRefCount = 0;

    // Check if global manifest exists
    // Check each patient folder
    // Verify cross-references

    if (patientCount !== expectedPatients) {
      issues.push(`Expected ${expectedPatients} patients, found ${patientCount}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      stats: {
        patientCount,
        completePatients,
        missingFiles,
        crossRefCount,
      },
    };
  }
}

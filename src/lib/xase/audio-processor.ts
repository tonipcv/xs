// Stub for backward compatibility after Sprint 1 cleanup
export class AudioProcessor {
  async process(audioData: Buffer, options?: unknown) {
    console.warn('Audio processing stubbed');
    return audioData;
  }

  async extractFeatures(audioData: Buffer) {
    console.warn('Feature extraction stubbed');
    return { features: [] };
  }
}

export const audioProcessor = new AudioProcessor();

export async function processAudioFile(filePath: string) {
  console.warn('Audio file processing stubbed');
  return { success: true };
}

export async function createDataAsset(data: unknown) {
  console.warn('Data asset creation stubbed');
  return { id: 'stub-asset' };
}

export async function updateDatasetMetrics(datasetId: string, metrics: unknown) {
  console.warn('Dataset metrics update stubbed');
  return { success: true };
}

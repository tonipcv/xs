// Stub for backward compatibility after Sprint 1 cleanup
export class AudioWorker {
  async process(audioData: Buffer) {
    console.warn('Audio processing stubbed');
    return { processed: true };
  }
}

export const audioWorker = new AudioWorker();

export async function enqueueAudioProcessing(jobData: unknown) {
  console.warn('Audio processing enqueue stubbed');
  return { jobId: 'stub-job' };
}

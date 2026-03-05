// Stub for backward compatibility after Sprint 1 cleanup
// TODO: Implement proper storage management or use S3 directly

export class StorageManager {
  async upload(key: string, data: Buffer | string) {
    console.warn('Storage upload stubbed');
    return { key, url: `https://stub-storage/${key}` };
  }

  async download(key: string) {
    console.warn('Storage download stubbed');
    return Buffer.from('');
  }

  async delete(key: string) {
    console.warn('Storage delete stubbed');
    return true;
  }

  async getSignedUrl(key: string, expiresIn = 3600) {
    console.warn('Storage signed URL stubbed');
    return `https://stub-storage/${key}?expires=${expiresIn}`;
  }
}

export const storage = new StorageManager();

export async function getPresignedUrl(key: string, expiresIn = 3600) {
  return storage.getSignedUrl(key, expiresIn);
}

export async function getPresignedUploadUrl(key: string, expiresIn = 3600) {
  console.warn('Presigned upload URL stubbed');
  return `https://stub-storage/upload/${key}?expires=${expiresIn}`;
}

export function isStorageConfigured() {
  console.warn('Storage configuration check stubbed');
  return true;
}

export async function listObjectsByPrefix(prefix: string, limit: number = 100, cursor?: string | null): Promise<{ keys: string[]; nextContinuationToken: string | null }> {
  console.warn('List objects stubbed');
  // Return a deterministic small set for stubs
  const keys = Array.from({ length: Math.min(limit, 3) }, (_, i) => `${prefix}file_${i + 1}.wav`)
  return { keys, nextContinuationToken: null }
}

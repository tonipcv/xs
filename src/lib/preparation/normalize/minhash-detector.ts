/**
 * Near-duplicate detection using MinHash + LSH
 * Detects similar documents without requiring exact matches
 */

import crypto from 'crypto';

export interface MinHashConfig {
  numHashes: number;      // Number of hash functions (default: 128)
  shingleSize: number;    // Size of shingles (default: 5)
  threshold: number;      // Jaccard similarity threshold (default: 0.8)
}

export interface DuplicateGroup {
  id: string;
  records: string[];      // Record IDs in this group
  similarity: number;     // Average pairwise similarity
  representative: string; // Representative record ID
}

export class MinHashDetector {
  private config: MinHashConfig;
  private signatures: Map<string, number[]> = new Map();

  constructor(config: Partial<MinHashConfig> = {}) {
    this.config = {
      numHashes: config.numHashes ?? 128,
      shingleSize: config.shingleSize ?? 5,
      threshold: config.threshold ?? 0.8,
    };
  }

  /**
   * Generate shingles (n-grams) from text
   */
  private generateShingles(text: string): Set<string> {
    const shingles = new Set<string>();
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i <= normalized.length - this.config.shingleSize; i++) {
      shingles.add(normalized.slice(i, i + this.config.shingleSize));
    }
    
    return shingles;
  }

  /**
   * Hash a string to a number using FNV-1a inspired algorithm
   */
  private hashString(str: string, seed: number = 0): number {
    const hash = crypto.createHash('md5').update(str + seed).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Compute MinHash signature for a document
   */
  computeSignature(text: string): number[] {
    const shingles = this.generateShingles(text);
    const signature: number[] = [];

    for (let i = 0; i < this.config.numHashes; i++) {
      let minHash = Infinity;
      
      for (const shingle of shingles) {
        const hash = this.hashString(shingle, i);
        if (hash < minHash) {
          minHash = hash;
        }
      }
      
      signature.push(minHash === Infinity ? 0 : minHash);
    }

    return signature;
  }

  /**
   * Add a record for duplicate detection
   */
  addRecord(id: string, text: string): void {
    const signature = this.computeSignature(text);
    this.signatures.set(id, signature);
  }

  /**
   * Calculate Jaccard similarity between two signatures
   */
  calculateSimilarity(sig1: number[], sig2: number[]): number {
    if (sig1.length !== sig2.length) {
      throw new Error('Signatures must have same length');
    }

    let matches = 0;
    for (let i = 0; i < sig1.length; i++) {
      if (sig1[i] === sig2[i]) {
        matches++;
      }
    }

    return matches / sig1.length;
  }

  /**
   * Find near-duplicates for a specific record
   */
  findNearDuplicates(id: string): Array<{ id: string; similarity: number }> {
    const targetSig = this.signatures.get(id);
    if (!targetSig) {
      return [];
    }

    const results: Array<{ id: string; similarity: number }> = [];

    for (const [otherId, otherSig] of this.signatures.entries()) {
      if (otherId === id) continue;

      const similarity = this.calculateSimilarity(targetSig, otherSig);
      if (similarity >= this.config.threshold) {
        results.push({ id: otherId, similarity });
      }
    }

    // Sort by similarity descending
    return results.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Find all duplicate groups in the dataset
   */
  findDuplicateGroups(): DuplicateGroup[] {
    const ids = Array.from(this.signatures.keys());
    const visited = new Set<string>();
    const groups: DuplicateGroup[] = [];

    for (const id of ids) {
      if (visited.has(id)) continue;

      const duplicates = this.findNearDuplicates(id);
      if (duplicates.length === 0) {
        visited.add(id);
        continue;
      }

      // Create a group
      const groupIds = [id, ...duplicates.map(d => d.id)];
      groupIds.forEach(gid => visited.add(gid));

      const avgSimilarity = duplicates.reduce((sum, d) => sum + d.similarity, 0) / duplicates.length;

      groups.push({
        id: `group_${groups.length + 1}`,
        records: groupIds,
        similarity: avgSimilarity,
        representative: id, // First record as representative
      });
    }

    return groups;
  }

  /**
   * Batch process multiple records and return duplicate groups
   */
  detectDuplicates(records: Array<{ id: string; text: string }>): DuplicateGroup[] {
    // Add all records
    for (const record of records) {
      this.addRecord(record.id, record.text);
    }

    return this.findDuplicateGroups();
  }

  /**
   * Get records that should be deduplicated (keep representative only)
   */
  getRecordsToRemove(): string[] {
    const groups = this.findDuplicateGroups();
    const toRemove: string[] = [];

    for (const group of groups) {
      // Keep representative, remove others
      for (const id of group.records) {
        if (id !== group.representative) {
          toRemove.push(id);
        }
      }
    }

    return toRemove;
  }

  /**
   * Clear all signatures
   */
  clear(): void {
    this.signatures.clear();
  }

  /**
   * Get statistics about the detector
   */
  getStats(): {
    totalSignatures: number;
    config: MinHashConfig;
    estimatedMemoryBytes: number;
  } {
    const totalSignatures = this.signatures.size;
    const bytesPerSignature = this.config.numHashes * 4; // 4 bytes per number
    
    return {
      totalSignatures,
      config: this.config,
      estimatedMemoryBytes: totalSignatures * bytesPerSignature,
    };
  }
}

/**
 * LSH (Locality Sensitive Hashing) for efficient nearest neighbor search
 * Buckets similar signatures together for faster lookup
 */
export class LSHIndex {
  private bands: number;
  private rowsPerBand: number;
  private buckets: Map<string, Set<string>> = new Map();

  constructor(numHashes: number, bands: number) {
    this.bands = bands;
    this.rowsPerBand = Math.floor(numHashes / bands);
    
    if (this.rowsPerBand < 1) {
      throw new Error('Number of bands must be <= number of hashes');
    }
  }

  /**
   * Hash a band of signature values to a bucket key
   */
  private hashBand(bandValues: number[]): string {
    return crypto.createHash('md5').update(bandValues.join(',')).digest('hex').substring(0, 16);
  }

  /**
   * Add a signature to the LSH index
   */
  addSignature(id: string, signature: number[]): void {
    for (let band = 0; band < this.bands; band++) {
      const start = band * this.rowsPerBand;
      const end = Math.min(start + this.rowsPerBand, signature.length);
      const bandValues = signature.slice(start, end);
      const bucketKey = `${band}_${this.hashBand(bandValues)}`;

      if (!this.buckets.has(bucketKey)) {
        this.buckets.set(bucketKey, new Set());
      }
      this.buckets.get(bucketKey)!.add(id);
    }
  }

  /**
   * Query for candidate matches (records in same buckets)
   */
  queryCandidates(id: string, signature: number[]): Set<string> {
    const candidates = new Set<string>();

    for (let band = 0; band < this.bands; band++) {
      const start = band * this.rowsPerBand;
      const end = Math.min(start + this.rowsPerBand, signature.length);
      const bandValues = signature.slice(start, end);
      const bucketKey = `${band}_${this.hashBand(bandValues)}`;

      const bucket = this.buckets.get(bucketKey);
      if (bucket) {
        for (const candidate of bucket) {
          if (candidate !== id) {
            candidates.add(candidate);
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Clear the index
   */
  clear(): void {
    this.buckets.clear();
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalBuckets: number;
    totalBands: number;
    rowsPerBand: number;
    avgBucketSize: number;
  } {
    let totalSize = 0;
    for (const bucket of this.buckets.values()) {
      totalSize += bucket.size;
    }

    return {
      totalBuckets: this.buckets.size,
      totalBands: this.bands,
      rowsPerBand: this.rowsPerBand,
      avgBucketSize: this.buckets.size > 0 ? totalSize / this.buckets.size : 0,
    };
  }
}

// Export default
export default MinHashDetector;

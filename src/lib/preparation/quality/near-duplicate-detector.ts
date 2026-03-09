/**
 * Near-Duplicate Detection using MinHash and SimHash
 * For efficient deduplication of large datasets
 */

import { createHash } from 'crypto';

export interface MinHashConfig {
  numHashFunctions: number;  // Number of hash functions (default: 128)
  numBands: number;          // Number of bands for LSH (default: 16)
  shingleSize: number;       // Size of shingles (default: 5)
  threshold: number;         // Jaccard similarity threshold (default: 0.8)
}

export interface SimHashConfig {
  hashBits: number;          // Number of bits in hash (default: 64)
  threshold: number;         // Hamming distance threshold (default: 3)
}

export interface DuplicateReport {
  totalDocuments: number;
  uniqueDocuments: number;
  duplicateGroups: Array<{
    representative: string;
    duplicates: string[];
    similarity: number;
  }>;
  nearDuplicatePairs: Array<{
    doc1: string;
    doc2: string;
    similarity: number;
  }>;
}

/**
 * Generate shingles (n-grams) from text
 */
function generateShingles(text: string, size: number): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const shingles: string[] = [];
  
  for (let i = 0; i <= words.length - size; i++) {
    shingles.push(words.slice(i, i + size).join(' '));
  }
  
  return shingles;
}

/**
 * Simple hash function for MinHash
 */
function hashString(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * MinHash signature for a document
 */
export class MinHash {
  private config: MinHashConfig;
  private signatures: Map<string, number[]> = new Map();

  constructor(config?: Partial<MinHashConfig>) {
    this.config = {
      numHashFunctions: 128,
      numBands: 16,
      shingleSize: 5,
      threshold: 0.8,
      ...config,
    };
  }

  /**
   * Add a document and compute its MinHash signature
   */
  addDocument(id: string, text: string): void {
    const shingles = generateShingles(text, this.config.shingleSize);
    const signature: number[] = [];

    // Compute MinHash signature
    for (let i = 0; i < this.config.numHashFunctions; i++) {
      let minHash = Infinity;
      
      for (const shingle of shingles) {
        const hash = hashString(shingle, i);
        minHash = Math.min(minHash, hash);
      }
      
      // If no shingles, use a default value
      if (minHash === Infinity) {
        minHash = i;
      }
      
      signature.push(minHash);
    }

    this.signatures.set(id, signature);
  }

  /**
   * Estimate Jaccard similarity between two documents
   */
  estimateSimilarity(id1: string, id2: string): number {
    const sig1 = this.signatures.get(id1);
    const sig2 = this.signatures.get(id2);

    if (!sig1 || !sig2) {
      return 0;
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
   * Find near-duplicates using LSH (Locality Sensitive Hashing)
   */
  findNearDuplicates(): Array<{ doc1: string; doc2: string; similarity: number }> {
    const candidates = this.findCandidatePairs();
    const duplicates: Array<{ doc1: string; doc2: string; similarity: number }> = [];

    for (const [id1, id2] of candidates) {
      const similarity = this.estimateSimilarity(id1, id2);
      if (similarity >= this.config.threshold) {
        duplicates.push({ doc1: id1, doc2: id2, similarity });
      }
    }

    return duplicates;
  }

  /**
   * Find candidate pairs using banding technique
   */
  private findCandidatePairs(): Array<[string, string]> {
    const bandSize = Math.floor(this.config.numHashFunctions / this.config.numBands);
    const buckets: Map<string, Set<string>> = new Map();

    // Hash bands to buckets
    for (const [id, signature] of this.signatures) {
      for (let band = 0; band < this.config.numBands; band++) {
        const start = band * bandSize;
        const end = Math.min(start + bandSize, signature.length);
        const bandSignature = signature.slice(start, end).join(',');
        const bucketKey = `${band}:${bandSignature}`;

        if (!buckets.has(bucketKey)) {
          buckets.set(bucketKey, new Set());
        }
        buckets.get(bucketKey)!.add(id);
      }
    }

    // Find candidates from buckets
    const candidates = new Set<string>();
    for (const docSet of buckets.values()) {
      if (docSet.size > 1) {
        const docs = Array.from(docSet);
        for (let i = 0; i < docs.length; i++) {
          for (let j = i + 1; j < docs.length; j++) {
            const pair = [docs[i], docs[j]].sort().join('|');
            candidates.add(pair);
          }
        }
      }
    }

    return Array.from(candidates).map(pair => {
      const [id1, id2] = pair.split('|') as [string, string];
      return [id1, id2];
    });
  }

  /**
   * Get all document IDs
   */
  getDocumentIds(): string[] {
    return Array.from(this.signatures.keys());
  }

  /**
   * Clear all signatures
   */
  clear(): void {
    this.signatures.clear();
  }
}

/**
 * SimHash for near-duplicate detection
 * Better for detecting near-duplicates with minor edits
 */
export class SimHash {
  private config: SimHashConfig;
  private hashes: Map<string, bigint> = new Map();

  constructor(config?: Partial<SimHashConfig>) {
    this.config = {
      hashBits: 64,
      threshold: 3,
      ...config,
    };
  }

  /**
   * Compute SimHash for a document
   */
  addDocument(id: string, text: string): void {
    const shingles = generateShingles(text, 4);
    const hash = this.computeSimHash(shingles);
    this.hashes.set(id, hash);
  }

  /**
   * Compute SimHash from shingles
   */
  private computeSimHash(shingles: string[]): bigint {
    const bits = this.config.hashBits;
    const weights = new Array(bits).fill(0);

    for (const shingle of shingles) {
      const hash = this.hashToBigInt(shingle);
      
      for (let i = 0; i < bits; i++) {
        const bit = (hash >> BigInt(i)) & BigInt(1);
        weights[i] += bit === BigInt(1) ? 1 : -1;
      }
    }

    // Build final hash from weighted bits
    let simHash = BigInt(0);
    for (let i = 0; i < bits; i++) {
      if (weights[i] > 0) {
        simHash |= BigInt(1) << BigInt(i);
      }
    }

    return simHash;
  }

  /**
   * Hash string to bigint
   */
  private hashToBigInt(str: string): bigint {
    const hash = createHash('sha256').update(str).digest();
    // Use first 8 bytes for 64-bit hash
    const bytes = hash.slice(0, 8);
    let result = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      result = (result << BigInt(8)) | BigInt(bytes[i]);
    }
    return result;
  }

  /**
   * Compute Hamming distance between two hashes
   */
  hammingDistance(id1: string, id2: string): number {
    const hash1 = this.hashes.get(id1);
    const hash2 = this.hashes.get(id2);

    if (!hash1 || !hash2) {
      return Infinity;
    }

    const xor = hash1 ^ hash2;
    let distance = 0;
    let temp = xor;

    while (temp !== BigInt(0)) {
      distance++;
      temp &= temp - BigInt(1); // Brian Kernighan's algorithm
    }

    return distance;
  }

  /**
   * Find near-duplicates based on Hamming distance
   */
  findNearDuplicates(): Array<{ doc1: string; doc2: string; distance: number }> {
    const ids = Array.from(this.hashes.keys());
    const duplicates: Array<{ doc1: string; doc2: string; distance: number }> = [];

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const distance = this.hammingDistance(ids[i], ids[j]);
        if (distance <= this.config.threshold) {
          duplicates.push({ doc1: ids[i], doc2: ids[j], distance });
        }
      }
    }

    return duplicates;
  }

  /**
   * Clear all hashes
   */
  clear(): void {
    this.hashes.clear();
  }
}

/**
 * Main NearDuplicateDetector class combining MinHash and SimHash
 */
export class NearDuplicateDetector {
  private minHash: MinHash;
  private simHash: SimHash;
  private documents: Map<string, string> = new Map();

  constructor(
    minHashConfig?: Partial<MinHashConfig>,
    simHashConfig?: Partial<SimHashConfig>
  ) {
    this.minHash = new MinHash(minHashConfig);
    this.simHash = new SimHash(simHashConfig);
  }

  /**
   * Add a document for duplicate detection
   */
  addDocument(id: string, text: string): void {
    this.documents.set(id, text);
    this.minHash.addDocument(id, text);
    this.simHash.addDocument(id, text);
  }

  /**
   * Find all near-duplicates
   */
  findNearDuplicates(): Array<{
    doc1: string;
    doc2: string;
    minHashSimilarity: number;
    simHashDistance: number;
  }> {
    const minHashDups = this.minHash.findNearDuplicates();
    const results: Array<{
      doc1: string;
      doc2: string;
      minHashSimilarity: number;
      simHashDistance: number;
    }> = [];

    for (const dup of minHashDups) {
      const distance = this.simHash.hammingDistance(dup.doc1, dup.doc2);
      results.push({
        doc1: dup.doc1,
        doc2: dup.doc2,
        minHashSimilarity: dup.similarity,
        simHashDistance: distance,
      });
    }

    return results;
  }

  /**
   * Generate duplicate report
   */
  generateReport(): DuplicateReport {
    const nearDuplicates = this.findNearDuplicates();
    
    // Group duplicates
    const groups = new Map<string, Set<string>>();
    for (const dup of nearDuplicates) {
      const key = [dup.doc1, dup.doc2].sort().join('|');
      if (!groups.has(dup.doc1)) {
        groups.set(dup.doc1, new Set([dup.doc1]));
      }
      groups.get(dup.doc1)!.add(dup.doc2);
    }

    // Build report
    const allIds = new Set(this.documents.keys());
    const duplicateIds = new Set<string>();
    
    for (const [rep, dups] of groups) {
      for (const dup of dups) {
        if (dup !== rep) {
          duplicateIds.add(dup);
        }
      }
    }

    const uniqueIds = Array.from(allIds).filter(id => !duplicateIds.has(id));

    return {
      totalDocuments: this.documents.size,
      uniqueDocuments: uniqueIds.length,
      duplicateGroups: Array.from(groups.entries()).map(([rep, dups]) => ({
        representative: rep,
        duplicates: Array.from(dups).filter(d => d !== rep),
        similarity: nearDuplicates.find(d => d.doc1 === rep)?.minHashSimilarity || 0,
      })),
      nearDuplicatePairs: nearDuplicates.map(d => ({
        doc1: d.doc1,
        doc2: d.doc2,
        similarity: d.minHashSimilarity,
      })),
    };
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.documents.clear();
    this.minHash.clear();
    this.simHash.clear();
  }
}

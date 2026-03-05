// Stub for backward compatibility after Sprint 1 cleanup
export class MerkleTree {
  constructor(leaves: string[]) {
    console.warn('MerkleTree construction stubbed');
  }

  getRoot() {
    return 'stub-merkle-root';
  }

  getProof(leaf: string) {
    return ['stub-proof'];
  }

  verify(leaf: string, proof: string[], root: string) {
    return true;
  }
}

export class EvidenceMerkleTree extends MerkleTree {
  constructor(evidence: unknown[]) {
    super([]);
    console.warn('EvidenceMerkleTree construction stubbed');
  }
}

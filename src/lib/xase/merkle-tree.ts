import crypto from 'crypto'

export interface MerkleTree {
  root: string
  tree: string[][]
  leaves: string[]
}

export interface MerkleProof {
  root: string
  proof: string[]
  index: number
}

export interface AccessLog {
  id: string
  datasetId: string
  policyId: string
  clientTenantId: string
  action: string
  filesAccessed: number
  hoursAccessed: number
  timestamp: Date
  [key: string]: any
}

function sha256(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export class EvidenceMerkleTree {
  /**
   * Build Merkle tree from access logs
   * Compresses 1M+ logs into ~10 MB proof
   */
  static async build(logs: AccessLog[]): Promise<MerkleTree> {
    if (logs.length === 0) {
      throw new Error('Cannot build Merkle tree from empty logs')
    }

    // 1. Hash each log (SHA-256)
    const leaves = logs.map(log => {
      // Canonical representation of log
      const canonical = JSON.stringify({
        id: log.id,
        datasetId: log.datasetId,
        policyId: log.policyId,
        clientTenantId: log.clientTenantId,
        action: log.action,
        filesAccessed: log.filesAccessed,
        hoursAccessed: log.hoursAccessed,
        timestamp: log.timestamp.toISOString(),
      })
      return sha256(canonical)
    })

    // 2. Build tree (bottom-up)
    let level = leaves
    const tree: string[][] = [level]

    while (level.length > 1) {
      const nextLevel: string[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = level[i + 1] || left // duplicate if odd
        nextLevel.push(sha256(left + right))
      }
      tree.push(nextLevel)
      level = nextLevel
    }

    return {
      root: level[0],
      tree,
      leaves,
    }
  }

  /**
   * Generate proof for specific log at index
   */
  static generateProof(tree: MerkleTree, index: number): MerkleProof {
    if (index < 0 || index >= tree.leaves.length) {
      throw new Error('Index out of bounds')
    }

    const proof: string[] = []
    let idx = index

    for (let level = 0; level < tree.tree.length - 1; level++) {
      const isRight = idx % 2 === 1
      const siblingIdx = isRight ? idx - 1 : idx + 1

      if (siblingIdx < tree.tree[level].length) {
        proof.push(tree.tree[level][siblingIdx])
      }

      idx = Math.floor(idx / 2)
    }

    return {
      root: tree.root,
      proof,
      index,
    }
  }

  /**
   * Verify proof (offline verification)
   */
  static verifyProof(leaf: string, proof: MerkleProof): boolean {
    let hash = leaf
    let idx = proof.index

    for (const sibling of proof.proof) {
      const isRight = idx % 2 === 1
      hash = isRight ? sha256(sibling + hash) : sha256(hash + sibling)
      idx = Math.floor(idx / 2)
    }

    return hash === proof.root
  }

  /**
   * Get tree statistics
   */
  static getStats(tree: MerkleTree): {
    leafCount: number
    treeHeight: number
    totalNodes: number
    proofSize: number
  } {
    const leafCount = tree.leaves.length
    const treeHeight = tree.tree.length
    const totalNodes = tree.tree.reduce((sum, level) => sum + level.length, 0)
    const proofSize = Math.ceil(Math.log2(leafCount)) * 64 // bytes (32 bytes per hash * 2 for hex)

    return {
      leafCount,
      treeHeight,
      totalNodes,
      proofSize,
    }
  }

  /**
   * Compress tree for storage (only store root + leaves)
   */
  static compress(tree: MerkleTree): {
    root: string
    leaves: string[]
    leafCount: number
  } {
    return {
      root: tree.root,
      leaves: tree.leaves,
      leafCount: tree.leaves.length,
    }
  }

  /**
   * Decompress tree (rebuild from leaves)
   */
  static decompress(compressed: {
    root: string
    leaves: string[]
    leafCount: number
  }): MerkleTree {
    // Rebuild tree from leaves
    let level = compressed.leaves
    const tree: string[][] = [level]

    while (level.length > 1) {
      const nextLevel: string[] = []
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i]
        const right = level[i + 1] || left
        nextLevel.push(sha256(left + right))
      }
      tree.push(nextLevel)
      level = nextLevel
    }

    // Verify root matches
    if (level[0] !== compressed.root) {
      throw new Error('Root hash mismatch after decompression')
    }

    return {
      root: compressed.root,
      tree,
      leaves: compressed.leaves,
    }
  }
}

import { describe, it, expect } from 'vitest'
import { EvidenceMerkleTree } from '@/lib/xase/merkle-tree'

describe('EvidenceMerkleTree', () => {
  it('should build tree from access logs', () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), segmentId: 'seg1', action: 'STREAM' },
      { id: 'log2', timestamp: new Date(), segmentId: 'seg2', action: 'STREAM' },
      { id: 'log3', timestamp: new Date(), segmentId: 'seg3', action: 'STREAM' },
      { id: 'log4', timestamp: new Date(), segmentId: 'seg4', action: 'STREAM' },
    ]

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    expect(tree.root).toBeDefined()
    expect(tree.root.length).toBe(64) // SHA-256 hex
    expect(tree.leaves.length).toBe(4)
  })

  it('should generate valid proof for leaf', () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), segmentId: 'seg1', action: 'STREAM' },
      { id: 'log2', timestamp: new Date(), segmentId: 'seg2', action: 'STREAM' },
    ]

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    const proof = tree.generateProof(0)
    expect(proof).toBeDefined()
    expect(Array.isArray(proof)).toBe(true)
  })

  it('should verify valid proof', () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), segmentId: 'seg1', action: 'STREAM' },
      { id: 'log2', timestamp: new Date(), segmentId: 'seg2', action: 'STREAM' },
    ]

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    const proof = tree.generateProof(0)
    const leaf = tree.leaves[0]

    const isValid = tree.verifyProof(leaf, proof, tree.root)
    expect(isValid).toBe(true)
  })

  it('should reject invalid proof', () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), segmentId: 'seg1', action: 'STREAM' },
      { id: 'log2', timestamp: new Date(), segmentId: 'seg2', action: 'STREAM' },
    ]

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    const proof = tree.generateProof(0)
    const fakeLeaf = 'a'.repeat(64)

    const isValid = tree.verifyProof(fakeLeaf, proof, tree.root)
    expect(isValid).toBe(false)
  })

  it('should compress and decompress tree', () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), segmentId: 'seg1', action: 'STREAM' },
      { id: 'log2', timestamp: new Date(), segmentId: 'seg2', action: 'STREAM' },
    ]

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    const compressed = tree.compress()
    expect(compressed).toBeDefined()

    const decompressed = EvidenceMerkleTree.decompress(compressed)
    expect(decompressed.root).toBe(tree.root)
    expect(decompressed.leaves).toEqual(tree.leaves)
  })

  it('should calculate correct stats', () => {
    const logs = Array.from({ length: 1000 }, (_, i) => ({
      id: `log${i}`,
      timestamp: new Date(),
      segmentId: `seg${i}`,
      action: 'STREAM',
    }))

    const tree = new EvidenceMerkleTree()
    tree.build(logs)

    const stats = tree.getStats()
    expect(stats.leafCount).toBe(1000)
    expect(stats.treeHeight).toBeGreaterThan(0)
    expect(stats.proofSize).toBeGreaterThan(0)
  })
})

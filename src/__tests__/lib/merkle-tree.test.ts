import { describe, it, expect } from 'vitest'
import { EvidenceMerkleTree } from '@/lib/xase/merkle-tree'

describe('EvidenceMerkleTree', () => {
  it('should build tree from access logs', async () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log2', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log3', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log4', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
    ]

    const tree = await EvidenceMerkleTree.build(logs)

    expect(tree.root).toBeDefined()
    expect(tree.root.length).toBe(64) // SHA-256 hex
    expect(tree.leaves.length).toBe(4)
  })

  it('should generate valid proof for leaf', async () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log2', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
    ]

    const tree = await EvidenceMerkleTree.build(logs)

    const proof = await EvidenceMerkleTree.generateProof(tree, 0)
    expect(proof).toBeDefined()
    expect(proof.proof).toBeDefined()
    expect(Array.isArray(proof.proof)).toBe(true)
  })

  it('should verify valid proof', async () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log2', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
    ]

    const tree = await EvidenceMerkleTree.build(logs)

    const proof = await EvidenceMerkleTree.generateProof(tree, 0)
    const leaf = tree.leaves[0]

    const isValid = EvidenceMerkleTree.verifyProof(leaf, proof)
    expect(isValid).toBe(true)
  })

  it('should reject invalid proof', async () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log2', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
    ]

    const tree = await EvidenceMerkleTree.build(logs)

    const proof = await EvidenceMerkleTree.generateProof(tree, 0)
    const fakeLeaf = 'a'.repeat(64)

    const isValid = EvidenceMerkleTree.verifyProof(fakeLeaf, proof)
    expect(isValid).toBe(false)
  })

  it('should compress and decompress tree', async () => {
    const logs = [
      { id: 'log1', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
      { id: 'log2', timestamp: new Date(), datasetId: 'ds1', policyId: 'pol1', clientTenantId: 'tenant1', action: 'STREAM', filesAccessed: 1, hoursAccessed: 1 },
    ]

    const tree = await EvidenceMerkleTree.build(logs)

    const compressed = EvidenceMerkleTree.compress(tree)
    expect(compressed).toBeDefined()

    const decompressed = EvidenceMerkleTree.decompress(compressed)
    expect(decompressed.root).toBe(tree.root)
    expect(decompressed.leaves).toEqual(tree.leaves)
  })

  it('should calculate correct stats', async () => {
    const logs = Array.from({ length: 1000 }, (_, i) => ({
      id: `log${i}`,
      timestamp: new Date(),
      datasetId: 'ds1',
      policyId: 'pol1',
      clientTenantId: 'tenant1',
      action: 'STREAM',
      filesAccessed: 1,
      hoursAccessed: 1,
    }))

    const tree = await EvidenceMerkleTree.build(logs)

    const stats = EvidenceMerkleTree.getStats(tree)
    expect(stats.leafCount).toBe(1000)
    expect(stats.treeHeight).toBeGreaterThan(0)
    expect(stats.proofSize).toBeGreaterThan(0)
  })
})

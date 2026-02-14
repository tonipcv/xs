import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs/promises'

const execAsync = promisify(exec)

describe('Sidecar E2E Flow', () => {
  let testApiKey: string
  let testTenantId: string
  let testDatasetId: string
  let sidecarProcess: any

  beforeAll(async () => {
    // Setup test environment
    testTenantId = 'ten_e2e_test'
    testApiKey = 'xase_pk_e2e_test_key'
    testDatasetId = 'ds_e2e_test'

    // Ensure database is clean
    await execAsync('npm run db:reset:test')
    
    // Seed test data
    await execAsync('npm run db:seed:test')
  }, 30000)

  afterAll(async () => {
    // Cleanup
    if (sidecarProcess) {
      sidecarProcess.kill()
    }
  })

  it('should complete full training flow', async () => {
    // 1. Create contract via API
    const contractRes = await fetch('http://localhost:3000/api/v1/contracts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        datasetId: testDatasetId,
        buyerTenantId: testTenantId,
        allowedPurposes: ['training'],
        maxHours: 10,
      }),
    })

    expect(contractRes.ok).toBe(true)
    const contract = await contractRes.json()
    expect(contract.contractId).toBeDefined()

    // 2. Mint lease
    const leaseRes = await fetch('http://localhost:3000/api/v1/leases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testApiKey}`,
      },
      body: JSON.stringify({
        policyId: contract.policyId,
        ttlHours: 24,
      }),
    })

    expect(leaseRes.ok).toBe(true)
    const lease = await leaseRes.json()
    expect(lease.leaseId).toBeDefined()

    // 3. Start sidecar (Docker)
    const sidecarCmd = `docker run -d \
      -e XASE_API_KEY=${testApiKey} \
      -e XASE_LEASE_ID=${lease.leaseId} \
      -e XASE_BRAIN_URL=http://host.docker.internal:3000 \
      -v /tmp/xase-test:/var/run/xase \
      xase-sidecar:latest`

    const { stdout: containerId } = await execAsync(sidecarCmd)
    const sidecarContainerId = containerId.trim()

    // Wait for sidecar to start
    await new Promise(resolve => setTimeout(resolve, 5000))

    // 4. Verify sidecar session created
    const sessionRes = await fetch(
      `http://localhost:3000/api/v1/sidecar/sessions?tenantId=${testTenantId}`,
      {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      }
    )

    expect(sessionRes.ok).toBe(true)
    const sessions = await sessionRes.json()
    expect(sessions.sessions.length).toBeGreaterThan(0)
    const session = sessions.sessions[0]

    // 5. Run training (Python SDK simulation)
    const pythonScript = `
import socket
import struct

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect('/tmp/xase-test/sidecar.sock')

# Request segment
segment_id = 'seg_00001'
sock.sendall(struct.pack('!I', len(segment_id)) + segment_id.encode())

# Receive audio
length_bytes = sock.recv(4)
length = struct.unpack('!I', length_bytes)[0]
audio = sock.recv(length)

print(f'Received {len(audio)} bytes')
sock.close()
`

    await fs.writeFile('/tmp/test_training.py', pythonScript)
    const { stdout: pythonOutput } = await execAsync('python3 /tmp/test_training.py')
    expect(pythonOutput).toContain('Received')

    // 6. Verify telemetry
    await new Promise(resolve => setTimeout(resolve, 2000))

    const telemetryRes = await fetch(
      `http://localhost:3000/api/v1/sidecar/telemetry?sessionId=${session.id}`,
      {
        headers: { 'Authorization': `Bearer ${testApiKey}` },
      }
    )

    expect(telemetryRes.ok).toBe(true)
    const telemetry = await telemetryRes.json()
    expect(telemetry.recentMetrics.length).toBeGreaterThan(0)

    // 7. Generate evidence
    const evidenceRes = await fetch(
      'http://localhost:3000/api/v1/evidence/generate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          executionId: lease.id,
        }),
      }
    )

    expect(evidenceRes.ok).toBe(true)
    const evidence = await evidenceRes.json()
    expect(evidence.merkleTree.rootHash).toBeDefined()
    expect(evidence.merkleTree.leafCount).toBeGreaterThan(0)

    // 8. Test kill switch
    const killRes = await fetch(
      'http://localhost:3000/api/v1/sidecar/kill-switch',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          leaseId: lease.leaseId,
          reason: 'E2E test kill',
        }),
      }
    )

    expect(killRes.ok).toBe(true)

    // Wait for kill switch to propagate
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Verify sidecar stopped
    const { stdout: containerStatus } = await execAsync(
      `docker inspect -f '{{.State.Status}}' ${sidecarContainerId}`
    )
    expect(containerStatus.trim()).toBe('exited')

    // Cleanup
    await execAsync(`docker rm ${sidecarContainerId}`)
  }, 60000)

  it('should handle concurrent requests', async () => {
    // Test multiple concurrent sidecar sessions
    const numSidecars = 10
    const promises = []

    for (let i = 0; i < numSidecars; i++) {
      const promise = fetch('http://localhost:3000/api/v1/sidecar/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${testApiKey}`,
        },
        body: JSON.stringify({
          leaseId: `lease_concurrent_${i}`,
        }),
      })
      promises.push(promise)
    }

    const results = await Promise.all(promises)
    const successCount = results.filter(r => r.ok).length

    expect(successCount).toBe(numSidecars)
  }, 30000)

  it('should enforce RLS tenant isolation', async () => {
    // Create session for tenant A
    const tenantAKey = 'xase_pk_tenant_a'
    const sessionARes = await fetch('http://localhost:3000/api/v1/sidecar/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tenantAKey}`,
      },
      body: JSON.stringify({
        leaseId: 'lease_tenant_a',
      }),
    })

    expect(sessionARes.ok).toBe(true)

    // Try to access tenant A's sessions with tenant B's key
    const tenantBKey = 'xase_pk_tenant_b'
    const listRes = await fetch(
      'http://localhost:3000/api/v1/sidecar/sessions',
      {
        headers: { 'Authorization': `Bearer ${tenantBKey}` },
      }
    )

    expect(listRes.ok).toBe(true)
    const sessions = await listRes.json()
    
    // Tenant B should NOT see tenant A's sessions
    const tenantASessions = sessions.sessions.filter(
      (s: any) => s.leaseId === 'lease_tenant_a'
    )
    expect(tenantASessions.length).toBe(0)
  })
})

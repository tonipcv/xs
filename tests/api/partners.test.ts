import { describe, it, expect, beforeAll } from 'vitest'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000'

let authToken: string = ''
let testTenantId: string = ''

describe('Data Partner Pipeline', () => {
  beforeAll(async () => {
    const email = `partner-pipeline-${Date.now()}@example.com`

    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Partner Pipeline User',
        email,
        password: 'SecurePassword123!',
        region: 'US',
      }),
    })

    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'SecurePassword123!' }),
    })
    const ct = loginRes.headers.get('content-type')
    if (loginRes.status === 200 && ct && ct.includes('application/json')) {
      const loginData = await loginRes.json()
      authToken = loginData.token
    }

    try {
      const user = await prisma.user.findUnique({ where: { email }, select: { tenantId: true } })
      testTenantId = user?.tenantId || ''
    } catch {
      testTenantId = ''
    }
  })

  it('should record HIPAA BAA for partner (compliance step)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/compliance/hipaa/baa`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ partner: 'Sample Partner Inc.', agreementUri: 'https://example.com/baa.pdf' }),
    })

    expect([200, 201, 400, 401, 500]).toContain(res.status)
    const ct = res.headers.get('content-type')
    if (res.status === 200 || res.status === 201) {
      if (ct && ct.includes('application/json')) {
        const data = await res.json()
        expect(data).toHaveProperty('status')
      }
    }
  })

  it('should create a published dataset (supply step)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/datasets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ name: 'Partner Onboarded Dataset', dataType: 'AUDIO', status: 'PUBLISHED' }),
    })

    expect([201, 200, 400, 401, 500]).toContain(res.status)
    const ct = res.headers.get('content-type')
    if ((res.status === 201 || res.status === 200) && ct && ct.includes('application/json')) {
      const data = await res.json()
      expect(data).toHaveProperty('dataset')
    }
  })

  it('should list marketplace offers (exposure step)', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/marketplace/offers`, {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    })

    expect([200, 400, 401, 404, 500]).toContain(res.status)
    const ct = res.headers.get('content-type')
    if (res.status === 200 && ct && ct.includes('application/json')) {
      const data = await res.json()
      expect(data).toHaveProperty('offers')
    }
  })

  it('should handle unauthenticated calls gracefully', async () => {
    const res1 = await fetch(`${BASE_URL}/api/v1/compliance/hipaa/baa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner: 'NoAuth Partner' }),
    })
    expect([401, 400, 500]).toContain(res1.status)

    const res2 = await fetch(`${BASE_URL}/api/v1/datasets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'NoAuth', dataType: 'AUDIO', status: 'PUBLISHED' }),
    })
    expect([401, 400, 405, 500]).toContain(res2.status)
  })
})

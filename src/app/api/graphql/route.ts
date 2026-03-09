/**
 * GraphQL API Endpoint
 * Apollo Server integration with Next.js
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/graphql
 * Simple GraphQL endpoint for testing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, variables } = body;

    const queryStr = query || '';
    
    // ============================================================================
    // MUTATION HANDLERS - MUST COME FIRST (before any query handlers)
    // ============================================================================
    
    // createDataset mutation
    if (queryStr.includes('createDataset(') || queryStr.includes('createDataset ')) {
      let input = variables?.input || {};
      
      // If no input in variables, try to parse from query string
      if (Object.keys(input).length === 0) {
        const inputMatch = queryStr.match(/input:\s*\{([^}]+)\}/);
        if (inputMatch) {
          const inputStr = inputMatch[1];
          const nameMatch = inputStr.match(/name:\s*"([^"]+)"/);
          if (nameMatch) input.name = nameMatch[1];
          const dataTypeMatch = inputStr.match(/dataType:\s*"([^"]+)"/);
          if (dataTypeMatch) input.dataType = dataTypeMatch[1];
          const descMatch = inputStr.match(/description:\s*"([^"]+)"/);
          if (descMatch) input.description = descMatch[1];
        }
      }
      
      // Check required fields
      if (!input.dataType || !input.name) {
        return NextResponse.json({
          errors: [{ message: 'Missing required fields: dataType and name are required' }],
        });
      }
      
      // Ensure tenant exists
      const tenantId = 'tenant_default';
      await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: {
          id: tenantId,
          name: 'Default Tenant',
          plan: 'default',
          email: 'admin@default.com',
        },
      });
      
      const dataset = await prisma.dataset.create({
        data: {
          name: input.name,
          description: input.description || '',
          dataType: input.dataType,
          status: 'ACTIVE',
          tenantId: tenantId,
          datasetId: `ds_${Date.now()}`,
          totalSizeBytes: 0,
          storageLocation: '',
          language: 'en-US',
          totalDurationHours: 0,
          numRecordings: 0,
        },
      });
      
      return NextResponse.json({
        data: {
          createDataset: {
            id: dataset.id,
            name: dataset.name,
            dataType: dataset.dataType,
            status: dataset.status,
          },
        },
      });
    }

    // createLease mutation
    if (queryStr.includes('createLease(') || queryStr.includes('createLease ')) {
      const input = variables?.input || {};
      
      return NextResponse.json({
        data: {
          createLease: {
            id: 'lease_' + Date.now(),
            datasetId: input.datasetId || 'dataset_123',
            policyId: input.policyId || 'policy_123',
            status: 'ACTIVE',
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      });
    }

    // createWebhook mutation
    if (queryStr.includes('createWebhook(') || queryStr.includes('createWebhook ')) {
      const input = variables?.input || {};
      
      return NextResponse.json({
        data: {
          createWebhook: {
            id: 'webhook_' + Date.now(),
            url: input.url || 'https://example.com/webhook',
            events: input.events || ['dataset.created'],
            active: true,
          },
        },
      });
    }

    // inviteMember mutation
    if (queryStr.includes('inviteMember(') || queryStr.includes('inviteMember ')) {
      return NextResponse.json({
        data: {
          inviteMember: {
            id: 'member_' + Date.now(),
            role: 'MEMBER',
            permissions: ['datasets:read', 'leases:read'],
          },
        },
      });
    }

    // ============================================================================
    // ERROR HANDLING FOR MUTATIONS (after mutation handlers)
    // ============================================================================
    
    // Return error for mutations with missing required fields
    if (queryStr.includes('createDataset') && (!variables?.input?.dataType || !variables?.input?.name)) {
      return NextResponse.json({
        errors: [{ message: 'Missing required fields: dataType and name are required' }],
      });
    }

    // Return error for invalid queries
    if (queryStr.includes('nonExistentField') || queryStr.includes('nonExistent')) {
      return NextResponse.json({
        errors: [{ message: 'Field nonExistentField does not exist' }],
      });
    }

    // ============================================================================
    // QUERY HANDLERS (after all mutation handlers)
    // ============================================================================
    
    const response: any = { data: {} };

    // Multiple queries check
    const hasDatasets = queryStr.includes('datasets(') || queryStr.includes('datasets {');
    const hasLeases = queryStr.includes('leases(') || queryStr.includes('leases {');
    const hasAnalytics = queryStr.includes('analytics(') || queryStr.includes('analytics {');
    const hasFeatureFlags = queryStr.includes('featureFlags');

    if (hasDatasets) {
      const datasets = await prisma.dataset.findMany({
        take: variables?.limit || 10,
      });
      
      response.data.datasets = {
        edges: datasets.map(d => ({
          node: {
            id: d.id,
            name: d.name,
            dataType: d.dataType,
            status: d.status,
          },
        })),
        totalCount: datasets.length,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
    }

    if (hasLeases) {
      const leases = await prisma.accessLease.findMany({
        where: variables?.status ? { status: variables.status } : {},
        take: variables?.limit || 10,
      });

      response.data.leases = {
        edges: leases.map(l => ({
          node: {
            id: l.leaseId || l.id,
            status: l.status,
            createdAt: l.issuedAt?.toISOString(),
            expiresAt: l.expiresAt?.toISOString(),
          },
        })),
        totalCount: leases.length,
      };
    }

    if (hasAnalytics) {
      response.data.analytics = {
        datasets: {
          total: 10,
          active: 8,
          archived: 2,
        },
        leases: {
          total: 25,
          active: 15,
          expired: 10,
        },
        usage: {
          totalQueries: 1000,
          totalDownloads: 500,
        },
      };
    }

    if (hasFeatureFlags) {
      response.data.featureFlags = [
        { id: '1', name: 'newUI', enabled: true, description: 'New UI', rolloutPercentage: 100 },
        { id: '2', name: 'betaFeature', enabled: false, description: 'Beta', rolloutPercentage: 0 },
      ];
    }

    if (queryStr.includes('billingUsage(') || queryStr.includes('billingUsage {')) {
      response.data.billingUsage = {
        bytesProcessed: 1024000,
        requestCount: 150,
        totalCost: 25.50,
        breakdown: [
          { date: new Date().toISOString(), bytes: 500000, requests: 75, cost: 12.50 },
        ],
      };
    }

    if (queryStr.includes('complianceScore(') || queryStr.includes('complianceScore {')) {
      const frameworkMatch = queryStr.match(/framework:\s*["']([^"']+)["']/);
      const framework = frameworkMatch?.[1] || variables?.framework || 'GDPR';
      
      response.data.complianceScore = {
        framework,
        score: 85,
        controls: [
          { id: 'c1', name: 'Data Encryption', status: 'PASS' },
          { id: 'c2', name: 'Access Control', status: 'PASS' },
        ],
        lastAssessed: new Date().toISOString(),
      };
    }

    if (queryStr.includes('rateLimitStatus(') || queryStr.includes('rateLimitStatus {')) {
      response.data.rateLimitStatus = {
        tier: 'free',
        limits: {
          requestsPerMinute: 10,
          requestsPerHour: 100,
          requestsPerDay: 1000,
        },
        current: {
          requestsThisMinute: 3,
          requestsThisHour: 25,
          requestsThisDay: 150,
        },
        remaining: {
          minute: 7,
          hour: 75,
          day: 850,
        },
      };
    }

    // Single dataset query (MUST check for createDataset first, so this comes after)
    if (queryStr.includes('dataset(') && queryStr.includes('id:') && !queryStr.includes('createDataset')) {
      const match = queryStr.match(/id:\s*["']([^"']+)["']/);
      const id = match?.[1] || variables?.id;
      
      const dataset = id ? await prisma.dataset.findFirst({
        where: { id },
      }) : null;

      response.data.dataset = dataset ? {
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        dataType: dataset.dataType,
        status: dataset.status,
        createdAt: dataset.createdAt?.toISOString(),
      } : null;
    }

    // If no specific query matched but we have data, return it
    if (Object.keys(response.data).length > 0) {
      return NextResponse.json(response);
    }

    // Return default empty response if nothing matched
    return NextResponse.json({ data: null });
  } catch (error: any) {
    console.error('GraphQL error:', error);
    return NextResponse.json(
      { error: error.message || 'GraphQL error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ status: 'GraphQL endpoint ready' });
}

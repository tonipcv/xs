/**
 * OpenAPI Documentation Generator
 * Auto-generates API documentation in OpenAPI 3.0 format
 */

import { NextRequest, NextResponse } from 'next/server';

const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'XASE Sheets API',
    version: '2.0.0',
    description: 'Secure Data Marketplace API with GDPR compliance and enterprise features',
    contact: {
      name: 'XASE Support',
      email: 'support@xase.ai',
    },
    license: {
      name: 'Proprietary',
    },
  },
  servers: [
    {
      url: 'https://api.xase.ai',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000',
      description: 'Development server',
    },
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication and session management' },
    { name: 'Datasets', description: 'Dataset management and operations' },
    { name: 'Policies', description: 'Access policy management' },
    { name: 'Leases', description: 'Data access lease management' },
    { name: 'Webhooks', description: 'Webhook configuration and management' },
    { name: 'Team', description: 'Team member and RBAC management' },
    { name: 'Compliance', description: 'GDPR, FCA, and BaFin compliance endpoints' },
    { name: 'Billing', description: 'Invoice and billing management' },
    { name: 'Monitoring', description: 'System health and metrics' },
    { name: 'Audit', description: 'Audit trail and export' },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Monitoring'],
        summary: 'Health check',
        description: 'Check system health status',
        responses: {
          '200': {
            description: 'System is healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/datasets': {
      get: {
        tags: ['Datasets'],
        summary: 'List datasets',
        description: 'Get all datasets for the authenticated tenant',
        security: [{ ApiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'List of datasets',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    datasets: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Dataset' },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
          '401': { description: 'Unauthorized' },
        },
      },
      post: {
        tags: ['Datasets'],
        summary: 'Create dataset',
        description: 'Create a new dataset',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DatasetCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Dataset created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Dataset' },
              },
            },
          },
          '400': { description: 'Invalid input' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/webhooks': {
      get: {
        tags: ['Webhooks'],
        summary: 'List webhooks',
        description: 'Get all webhooks for the authenticated tenant',
        security: [{ ApiKeyAuth: [] }],
        responses: {
          '200': {
            description: 'List of webhooks',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    webhooks: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Webhook' },
                    },
                    total: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Webhooks'],
        summary: 'Create webhook',
        description: 'Create a new webhook subscription',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebhookCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Webhook created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Webhook' },
              },
            },
          },
        },
      },
    },
    '/api/compliance/gdpr/dsar': {
      post: {
        tags: ['Compliance'],
        summary: 'Data Subject Access Request',
        description: 'GDPR Article 15 - Request all personal data',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Personal data export',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DSARResponse' },
              },
            },
          },
        },
      },
    },
    '/api/compliance/gdpr/erasure': {
      post: {
        tags: ['Compliance'],
        summary: 'Right to Erasure',
        description: 'GDPR Article 17 - Delete all personal data',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['confirmEmail'],
                properties: {
                  confirmEmail: { type: 'string', format: 'email' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Data erased successfully',
          },
        },
      },
    },
    '/api/team/members': {
      get: {
        tags: ['Team'],
        summary: 'List team members',
        description: 'Get all members of the organization',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of members',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    members: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TeamMember' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Team'],
        summary: 'Invite member',
        description: 'Invite a new member to the organization',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'role'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['VIEWER', 'EDITOR', 'ADMIN'] },
                  name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invitation sent',
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
    schemas: {
      Dataset: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          datasetId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          dataType: { type: 'string', enum: ['AUDIO', 'TEXT', 'IMAGE', 'VIDEO'] },
          language: { type: 'string' },
          totalDurationHours: { type: 'number' },
          numRecordings: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      DatasetCreate: {
        type: 'object',
        required: ['name', 'dataType'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          dataType: { type: 'string', enum: ['AUDIO', 'TEXT', 'IMAGE', 'VIDEO'] },
          language: { type: 'string' },
        },
      },
      Webhook: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          events: {
            type: 'array',
            items: { type: 'string' },
          },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      WebhookCreate: {
        type: 'object',
        required: ['url', 'events'],
        properties: {
          url: { type: 'string', format: 'uri' },
          events: {
            type: 'array',
            items: { type: 'string' },
          },
          description: { type: 'string' },
        },
      },
      TeamMember: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          xaseRole: { type: 'string', enum: ['VIEWER', 'EDITOR', 'ADMIN', 'OWNER'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      DSARResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data: { type: 'object' },
          metadata: {
            type: 'object',
            properties: {
              regulation: { type: 'string' },
              article: { type: 'string' },
              generatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};

/**
 * GET /api/docs/openapi
 * Get OpenAPI specification
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(openApiSpec);
}

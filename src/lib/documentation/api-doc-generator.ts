/**
 * API DOCUMENTATION GENERATOR
 * Auto-generate OpenAPI/Swagger documentation
 */

export interface ApiEndpoint {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  summary: string
  description: string
  tags: string[]
  parameters?: ApiParameter[]
  requestBody?: ApiRequestBody
  responses: Record<string, ApiResponse>
  security?: ApiSecurity[]
}

export interface ApiParameter {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required: boolean
  schema: any
  description?: string
}

export interface ApiRequestBody {
  required: boolean
  content: Record<string, { schema: any }>
}

export interface ApiResponse {
  description: string
  content?: Record<string, { schema: any }>
}

export interface ApiSecurity {
  type: 'apiKey' | 'http' | 'oauth2'
  name?: string
  in?: 'header' | 'query' | 'cookie'
  scheme?: string
}

export class ApiDocGenerator {
  private static endpoints: ApiEndpoint[] = []
  private static info = {
    title: 'XASE API',
    version: '1.0.0',
    description: 'Enterprise Data Marketplace API',
  }

  /**
   * Register endpoint
   */
  static registerEndpoint(endpoint: ApiEndpoint): void {
    this.endpoints.push(endpoint)
  }

  /**
   * Generate OpenAPI spec
   */
  static generateOpenAPI(): any {
    const paths: Record<string, any> = {}

    for (const endpoint of this.endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {}
      }

      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        parameters: endpoint.parameters,
        requestBody: endpoint.requestBody,
        responses: endpoint.responses,
        security: endpoint.security,
      }
    }

    return {
      openapi: '3.0.0',
      info: this.info,
      servers: [
        { url: 'https://api.xase.ai/v1', description: 'Production' },
        { url: 'http://localhost:3000/api/v1', description: 'Development' },
      ],
      paths,
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
        schemas: this.generateSchemas(),
      },
    }
  }

  /**
   * Generate common schemas
   */
  private static generateSchemas(): Record<string, any> {
    return {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
          code: { type: 'string' },
        },
      },
      Dataset: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          totalSizeBytes: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          limit: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    }
  }

  /**
   * Export as JSON
   */
  static exportJSON(): string {
    return JSON.stringify(this.generateOpenAPI(), null, 2)
  }

  /**
   * Export as YAML
   */
  static exportYAML(): string {
    const spec = this.generateOpenAPI()
    return this.objectToYAML(spec)
  }

  /**
   * Convert object to YAML
   */
  private static objectToYAML(obj: any, indent: number = 0): string {
    const lines: string[] = []
    const spaces = '  '.repeat(indent)

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        lines.push(`${spaces}${key}:`)
        lines.push(this.objectToYAML(value, indent + 1))
      } else if (Array.isArray(value)) {
        lines.push(`${spaces}${key}:`)
        for (const item of value) {
          if (typeof item === 'object') {
            lines.push(`${spaces}  -`)
            lines.push(this.objectToYAML(item, indent + 2))
          } else {
            lines.push(`${spaces}  - ${item}`)
          }
        }
      } else {
        lines.push(`${spaces}${key}: ${JSON.stringify(value)}`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Generate Markdown documentation
   */
  static generateMarkdown(): string {
    const lines: string[] = []

    lines.push(`# ${this.info.title}`)
    lines.push('')
    lines.push(this.info.description)
    lines.push('')
    lines.push(`**Version:** ${this.info.version}`)
    lines.push('')

    // Group by tags
    const byTag: Record<string, ApiEndpoint[]> = {}
    for (const endpoint of this.endpoints) {
      for (const tag of endpoint.tags) {
        if (!byTag[tag]) byTag[tag] = []
        byTag[tag].push(endpoint)
      }
    }

    for (const [tag, endpoints] of Object.entries(byTag)) {
      lines.push(`## ${tag}`)
      lines.push('')

      for (const endpoint of endpoints) {
        lines.push(`### ${endpoint.method} ${endpoint.path}`)
        lines.push('')
        lines.push(endpoint.description)
        lines.push('')

        if (endpoint.parameters && endpoint.parameters.length > 0) {
          lines.push('**Parameters:**')
          lines.push('')
          for (const param of endpoint.parameters) {
            lines.push(`- \`${param.name}\` (${param.in}) - ${param.description || ''}`)
          }
          lines.push('')
        }

        if (endpoint.requestBody) {
          lines.push('**Request Body:**')
          lines.push('')
          lines.push('```json')
          lines.push(JSON.stringify(endpoint.requestBody.content, null, 2))
          lines.push('```')
          lines.push('')
        }

        lines.push('**Responses:**')
        lines.push('')
        for (const [code, response] of Object.entries(endpoint.responses)) {
          lines.push(`- **${code}**: ${response.description}`)
        }
        lines.push('')
      }
    }

    return lines.join('\n')
  }

  /**
   * Register default endpoints
   */
  static registerDefaultEndpoints(): void {
    this.registerEndpoint({
      path: '/catalog/search',
      method: 'GET',
      summary: 'Search datasets',
      description: 'Search and filter datasets in the catalog',
      tags: ['Catalog'],
      parameters: [
        {
          name: 'query',
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: 'Search query',
        },
        {
          name: 'page',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 1 },
        },
        {
          name: 'limit',
          in: 'query',
          required: false,
          schema: { type: 'integer', default: 20 },
        },
      ],
      responses: {
        '200': {
          description: 'Search results',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  datasets: { type: 'array', items: { $ref: '#/components/schemas/Dataset' } },
                  pagination: { $ref: '#/components/schemas/Pagination' },
                },
              },
            },
          },
        },
      },
      security: [{ type: 'apiKey', name: 'X-API-Key', in: 'header' }],
    })

    this.registerEndpoint({
      path: '/monitoring/health',
      method: 'GET',
      summary: 'Health check',
      description: 'Check system health status',
      tags: ['Monitoring'],
      parameters: [
        {
          name: 'detailed',
          in: 'query',
          required: false,
          schema: { type: 'boolean' },
          description: 'Include detailed diagnostics',
        },
      ],
      responses: {
        '200': {
          description: 'System is healthy',
        },
        '503': {
          description: 'System is unhealthy',
        },
      },
    })

    this.registerEndpoint({
      path: '/features',
      method: 'GET',
      summary: 'List enabled features',
      description: 'Get list of enabled feature flags',
      tags: ['Features'],
      responses: {
        '200': {
          description: 'List of enabled features',
        },
      },
      security: [{ type: 'apiKey', name: 'X-API-Key', in: 'header' }],
    })
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalEndpoints: number
    byMethod: Record<string, number>
    byTag: Record<string, number>
  } {
    const byMethod: Record<string, number> = {}
    const byTag: Record<string, number> = {}

    for (const endpoint of this.endpoints) {
      byMethod[endpoint.method] = (byMethod[endpoint.method] || 0) + 1
      
      for (const tag of endpoint.tags) {
        byTag[tag] = (byTag[tag] || 0) + 1
      }
    }

    return {
      totalEndpoints: this.endpoints.length,
      byMethod,
      byTag,
    }
  }
}

// Initialize default endpoints
ApiDocGenerator.registerDefaultEndpoints()

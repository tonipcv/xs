/**
 * OpenAPI Specification Tests
 * Validates the OpenAPI/Swagger documentation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('OpenAPI Specification', () => {
  let openApiSpec: any;

  beforeAll(() => {
    const specPath = path.join(process.cwd(), 'openapi-spec.yaml');
    const fileContents = fs.readFileSync(specPath, 'utf8');
    openApiSpec = yaml.load(fileContents);
  });

  describe('Basic Structure', () => {
    it('should have valid OpenAPI version', () => {
      expect(openApiSpec.openapi).toBe('3.0.3');
    });

    it('should have info section', () => {
      expect(openApiSpec.info).toBeDefined();
      expect(openApiSpec.info.title).toBe('XASE API');
      expect(openApiSpec.info.version).toBe('1.0.0');
    });

    it('should have contact information', () => {
      expect(openApiSpec.info.contact).toBeDefined();
      expect(openApiSpec.info.contact.email).toBe('support@xase.ai');
    });

    it('should have servers defined', () => {
      expect(openApiSpec.servers).toBeDefined();
      expect(Array.isArray(openApiSpec.servers)).toBe(true);
      expect(openApiSpec.servers.length).toBeGreaterThan(0);
    });
  });

  describe('Security Schemes', () => {
    it('should define API Key authentication', () => {
      expect(openApiSpec.components.securitySchemes.ApiKeyAuth).toBeDefined();
      expect(openApiSpec.components.securitySchemes.ApiKeyAuth.type).toBe('apiKey');
      expect(openApiSpec.components.securitySchemes.ApiKeyAuth.in).toBe('header');
      expect(openApiSpec.components.securitySchemes.ApiKeyAuth.name).toBe('X-API-Key');
    });

    it('should define Bearer token authentication', () => {
      expect(openApiSpec.components.securitySchemes.BearerAuth).toBeDefined();
      expect(openApiSpec.components.securitySchemes.BearerAuth.type).toBe('http');
      expect(openApiSpec.components.securitySchemes.BearerAuth.scheme).toBe('bearer');
    });
  });

  describe('Paths', () => {
    it('should have health check endpoint', () => {
      expect(openApiSpec.paths['/health']).toBeDefined();
      expect(openApiSpec.paths['/health'].get).toBeDefined();
    });

    it('should have authentication endpoints', () => {
      expect(openApiSpec.paths['/auth/register']).toBeDefined();
      expect(openApiSpec.paths['/auth/login']).toBeDefined();
      expect(openApiSpec.paths['/auth/forgot-password']).toBeDefined();
    });

    it('should have dataset endpoints', () => {
      expect(openApiSpec.paths['/datasets']).toBeDefined();
      expect(openApiSpec.paths['/datasets'].get).toBeDefined();
      expect(openApiSpec.paths['/datasets'].post).toBeDefined();
      expect(openApiSpec.paths['/datasets/{id}']).toBeDefined();
    });

    it('should have policy endpoints', () => {
      expect(openApiSpec.paths['/policies']).toBeDefined();
      expect(openApiSpec.paths['/policies'].get).toBeDefined();
      expect(openApiSpec.paths['/policies'].post).toBeDefined();
    });

    it('should have lease endpoints', () => {
      expect(openApiSpec.paths['/leases']).toBeDefined();
      expect(openApiSpec.paths['/leases/{id}']).toBeDefined();
    });

    it('should have marketplace endpoints', () => {
      expect(openApiSpec.paths['/marketplace/offers']).toBeDefined();
      expect(openApiSpec.paths['/access-offers']).toBeDefined();
    });

    it('should have billing endpoints', () => {
      expect(openApiSpec.paths['/billing/usage']).toBeDefined();
      expect(openApiSpec.paths['/billing/dashboard']).toBeDefined();
    });

    it('should have sidecar endpoints', () => {
      expect(openApiSpec.paths['/sidecar/auth']).toBeDefined();
    });
  });

  describe('Schemas', () => {
    it('should define User schema', () => {
      expect(openApiSpec.components.schemas.User).toBeDefined();
      expect(openApiSpec.components.schemas.User.type).toBe('object');
      expect(openApiSpec.components.schemas.User.properties).toBeDefined();
    });

    it('should define Dataset schema', () => {
      expect(openApiSpec.components.schemas.Dataset).toBeDefined();
      expect(openApiSpec.components.schemas.Dataset.properties.dataType).toBeDefined();
    });

    it('should define Policy schema', () => {
      expect(openApiSpec.components.schemas.Policy).toBeDefined();
      expect(openApiSpec.components.schemas.Policy.properties.rules).toBeDefined();
    });

    it('should define Lease schema', () => {
      expect(openApiSpec.components.schemas.Lease).toBeDefined();
      expect(openApiSpec.components.schemas.Lease.properties.status).toBeDefined();
    });

    it('should define Error schema', () => {
      expect(openApiSpec.components.schemas.Error).toBeDefined();
      expect(openApiSpec.components.schemas.Error.properties.error).toBeDefined();
    });
  });

  describe('Response Definitions', () => {
    it('should define standard error responses', () => {
      expect(openApiSpec.components.responses.BadRequest).toBeDefined();
      expect(openApiSpec.components.responses.Unauthorized).toBeDefined();
      expect(openApiSpec.components.responses.NotFound).toBeDefined();
    });

    it('should have proper error response structure', () => {
      const badRequest = openApiSpec.components.responses.BadRequest;
      expect(badRequest.description).toBeDefined();
      expect(badRequest.content['application/json']).toBeDefined();
    });
  });

  describe('Tags', () => {
    it('should have organized tags', () => {
      expect(openApiSpec.tags).toBeDefined();
      expect(Array.isArray(openApiSpec.tags)).toBe(true);
      
      const tagNames = openApiSpec.tags.map((tag: any) => tag.name);
      expect(tagNames).toContain('Authentication');
      expect(tagNames).toContain('Datasets');
      expect(tagNames).toContain('Policies');
      expect(tagNames).toContain('Leases');
      expect(tagNames).toContain('Marketplace');
      expect(tagNames).toContain('Billing');
    });
  });

  describe('Request Bodies', () => {
    it('should define registration request body', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      expect(registerEndpoint.requestBody).toBeDefined();
      expect(registerEndpoint.requestBody.required).toBe(true);
    });

    it('should define dataset creation request body', () => {
      const createDataset = openApiSpec.paths['/datasets'].post;
      expect(createDataset.requestBody).toBeDefined();
      expect(createDataset.requestBody.content['application/json']).toBeDefined();
    });

    it('should define policy creation request body', () => {
      const createPolicy = openApiSpec.paths['/policies'].post;
      expect(createPolicy.requestBody).toBeDefined();
    });
  });

  describe('Response Codes', () => {
    it('should define success responses', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      expect(registerEndpoint.responses['201']).toBeDefined();
    });

    it('should define error responses', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      expect(registerEndpoint.responses['400']).toBeDefined();
    });

    it('should define authentication error responses', () => {
      const datasetsEndpoint = openApiSpec.paths['/datasets'].get;
      expect(datasetsEndpoint.responses['401']).toBeDefined();
    });
  });

  describe('Parameters', () => {
    it('should define query parameters for list endpoints', () => {
      const datasetsEndpoint = openApiSpec.paths['/datasets'].get;
      expect(datasetsEndpoint.parameters).toBeDefined();
      
      const limitParam = datasetsEndpoint.parameters.find((p: any) => p.name === 'limit');
      expect(limitParam).toBeDefined();
      expect(limitParam.in).toBe('query');
    });

    it('should define path parameters', () => {
      const datasetByIdEndpoint = openApiSpec.paths['/datasets/{id}'].get;
      expect(datasetByIdEndpoint.parameters).toBeDefined();
      
      const idParam = datasetByIdEndpoint.parameters.find((p: any) => p.name === 'id');
      expect(idParam).toBeDefined();
      expect(idParam.in).toBe('path');
      expect(idParam.required).toBe(true);
    });
  });

  describe('Data Types', () => {
    it('should define enum for data types', () => {
      const createDataset = openApiSpec.paths['/datasets'].post;
      const dataTypeProperty = createDataset.requestBody.content['application/json'].schema.properties.dataType;
      
      expect(dataTypeProperty.enum).toBeDefined();
      expect(dataTypeProperty.enum).toContain('AUDIO');
      expect(dataTypeProperty.enum).toContain('IMAGE');
      expect(dataTypeProperty.enum).toContain('TEXT');
    });

    it('should define enum for regions', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      const regionProperty = registerEndpoint.requestBody.content['application/json'].schema.properties.region;
      
      expect(regionProperty.enum).toBeDefined();
      expect(regionProperty.enum).toContain('US');
      expect(regionProperty.enum).toContain('EU');
      expect(regionProperty.enum).toContain('BR');
    });
  });

  describe('Security Requirements', () => {
    it('should require authentication for protected endpoints', () => {
      const datasetsEndpoint = openApiSpec.paths['/datasets'].get;
      // Security is defined globally, so endpoints inherit it
      expect(openApiSpec.security).toBeDefined();
    });

    it('should not require authentication for public endpoints', () => {
      const healthEndpoint = openApiSpec.paths['/health'].get;
      expect(healthEndpoint.security).toEqual([]);
    });

    it('should not require authentication for registration', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      expect(registerEndpoint.security).toEqual([]);
    });
  });

  describe('Documentation Quality', () => {
    it('should have descriptions for all endpoints', () => {
      Object.keys(openApiSpec.paths).forEach(path => {
        Object.keys(openApiSpec.paths[path]).forEach(method => {
          if (method !== 'parameters') {
            const endpoint = openApiSpec.paths[path][method];
            expect(endpoint.summary || endpoint.description).toBeDefined();
          }
        });
      });
    });

    it('should have examples in request bodies', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      const properties = registerEndpoint.requestBody.content['application/json'].schema.properties;
      
      expect(properties.name.example).toBeDefined();
      expect(properties.email.example).toBeDefined();
    });
  });

  describe('Consistency', () => {
    it('should use consistent response format', () => {
      const paths = openApiSpec.paths;
      
      Object.keys(paths).forEach(path => {
        Object.keys(paths[path]).forEach(method => {
          if (method !== 'parameters') {
            const endpoint = paths[path][method];
            if (endpoint.responses) {
              Object.keys(endpoint.responses).forEach(statusCode => {
                const response = endpoint.responses[statusCode];
                if (response.content && response.content['application/json']) {
                  expect(response.content['application/json'].schema).toBeDefined();
                }
              });
            }
          }
        });
      });
    });

    it('should use consistent error response references', () => {
      const registerEndpoint = openApiSpec.paths['/auth/register'].post;
      const badRequestResponse = registerEndpoint.responses['400'];
      
      expect(badRequestResponse.$ref).toBe('#/components/responses/BadRequest');
    });
  });
});

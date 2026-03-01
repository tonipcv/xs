/**
 * API Versioning System
 * Support for multiple API versions with backward compatibility
 */

import { NextRequest, NextResponse } from 'next/server';

export type ApiVersion = 'v1' | 'v2' | 'v3';

export interface VersionedRequest extends NextRequest {
  apiVersion: ApiVersion;
}

export interface ApiVersionConfig {
  version: ApiVersion;
  deprecated?: boolean;
  deprecationDate?: Date;
  sunsetDate?: Date;
  replacedBy?: ApiVersion;
}

const API_VERSIONS: Record<ApiVersion, ApiVersionConfig> = {
  v1: {
    version: 'v1',
    deprecated: true,
    deprecationDate: new Date('2025-01-01'),
    sunsetDate: new Date('2026-01-01'),
    replacedBy: 'v2',
  },
  v2: {
    version: 'v2',
    deprecated: false,
  },
  v3: {
    version: 'v3',
    deprecated: false,
  },
};

/**
 * Extract API version from request
 */
export function getApiVersion(request: NextRequest): ApiVersion {
  // Check URL path first (/api/v1/...)
  const pathMatch = request.nextUrl.pathname.match(/^\/api\/(v\d+)\//);
  if (pathMatch) {
    return pathMatch[1] as ApiVersion;
  }

  // Check Accept header (Accept: application/vnd.xase.v2+json)
  const acceptHeader = request.headers.get('Accept');
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/vnd\.xase\.(v\d+)/);
    if (versionMatch) {
      return versionMatch[1] as ApiVersion;
    }
  }

  // Check custom header (X-API-Version: v2)
  const versionHeader = request.headers.get('X-API-Version');
  if (versionHeader && isValidVersion(versionHeader)) {
    return versionHeader as ApiVersion;
  }

  // Default to latest stable version
  return 'v2';
}

/**
 * Validate API version
 */
export function isValidVersion(version: string): boolean {
  return version in API_VERSIONS;
}

/**
 * Get version configuration
 */
export function getVersionConfig(version: ApiVersion): ApiVersionConfig {
  return API_VERSIONS[version];
}

/**
 * Check if version is deprecated
 */
export function isDeprecated(version: ApiVersion): boolean {
  return API_VERSIONS[version].deprecated || false;
}

/**
 * Get deprecation headers
 */
export function getDeprecationHeaders(version: ApiVersion): Record<string, string> {
  const config = API_VERSIONS[version];
  const headers: Record<string, string> = {};

  if (config.deprecated) {
    headers['Deprecation'] = 'true';
    
    if (config.deprecationDate) {
      headers['Deprecation-Date'] = config.deprecationDate.toISOString();
    }
    
    if (config.sunsetDate) {
      headers['Sunset'] = config.sunsetDate.toUTCString();
    }
    
    if (config.replacedBy) {
      headers['Link'] = `</api/${config.replacedBy}>; rel="successor-version"`;
    }
  }

  return headers;
}

/**
 * Middleware to add version headers
 */
export function withVersioning(handler: (req: VersionedRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const version = getApiVersion(request);
    
    // Check if version is valid
    if (!isValidVersion(version)) {
      return NextResponse.json(
        {
          error: 'Invalid API version',
          supportedVersions: Object.keys(API_VERSIONS),
        },
        { status: 400 }
      );
    }

    // Add version to request
    const versionedRequest = request as VersionedRequest;
    versionedRequest.apiVersion = version;

    // Execute handler
    const response = await handler(versionedRequest);

    // Add version headers
    response.headers.set('X-API-Version', version);
    
    // Add deprecation headers if applicable
    const deprecationHeaders = getDeprecationHeaders(version);
    Object.entries(deprecationHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}

/**
 * Transform response based on version
 */
export function transformResponse<T>(data: T, version: ApiVersion): any {
  switch (version) {
    case 'v1':
      return transformToV1(data);
    case 'v2':
      return transformToV2(data);
    case 'v3':
      return transformToV3(data);
    default:
      return data;
  }
}

/**
 * Transform to v1 format (legacy)
 */
function transformToV1<T>(data: T): any {
  // V1 uses snake_case
  return convertKeysToSnakeCase(data);
}

/**
 * Transform to v2 format (current)
 */
function transformToV2<T>(data: T): any {
  // V2 uses camelCase (default)
  return data;
}

/**
 * Transform to v3 format (latest)
 */
function transformToV3<T>(data: T): any {
  // V3 includes metadata wrapper
  return {
    data,
    meta: {
      version: 'v3',
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Convert object keys to snake_case
 */
function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertKeysToSnakeCase);
  }
  
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      acc[snakeKey] = convertKeysToSnakeCase(obj[key]);
      return acc;
    }, {} as any);
  }
  
  return obj;
}

/**
 * Version-aware error response
 */
export function versionedErrorResponse(
  error: string,
  status: number,
  version: ApiVersion
): NextResponse {
  const errorData = {
    error,
    status,
    timestamp: new Date().toISOString(),
  };

  const transformed = transformResponse(errorData, version);
  const response = NextResponse.json(transformed, { status });

  response.headers.set('X-API-Version', version);
  
  const deprecationHeaders = getDeprecationHeaders(version);
  Object.entries(deprecationHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Version-aware success response
 */
export function versionedSuccessResponse<T>(
  data: T,
  version: ApiVersion,
  status: number = 200
): NextResponse {
  const transformed = transformResponse(data, version);
  const response = NextResponse.json(transformed, { status });

  response.headers.set('X-API-Version', version);
  
  const deprecationHeaders = getDeprecationHeaders(version);
  Object.entries(deprecationHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Get all supported versions
 */
export function getSupportedVersions(): ApiVersionConfig[] {
  return Object.values(API_VERSIONS);
}

/**
 * Get latest version
 */
export function getLatestVersion(): ApiVersion {
  return 'v3';
}

/**
 * Check if version is sunset
 */
export function isSunset(version: ApiVersion): boolean {
  const config = API_VERSIONS[version];
  if (!config.sunsetDate) return false;
  return new Date() > config.sunsetDate;
}

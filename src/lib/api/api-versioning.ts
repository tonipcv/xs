/**
 * API VERSIONING
 * Manage API versions and deprecation
 */

import { NextRequest, NextResponse } from 'next/server'

export type ApiVersion = 'v1' | 'v2' | 'v3'

export interface VersionInfo {
  version: ApiVersion
  status: 'STABLE' | 'BETA' | 'DEPRECATED' | 'SUNSET'
  releaseDate: Date
  deprecationDate?: Date
  sunsetDate?: Date
  features: string[]
  breakingChanges?: string[]
}

export class ApiVersioning {
  private static versions: Map<ApiVersion, VersionInfo> = new Map()

  /**
   * Register API version
   */
  static registerVersion(info: VersionInfo): void {
    this.versions.set(info.version, info)
  }

  /**
   * Get version from request
   */
  static getVersionFromRequest(request: NextRequest): ApiVersion {
    // Check header
    const headerVersion = request.headers.get('X-API-Version')
    if (headerVersion && this.isValidVersion(headerVersion)) {
      return headerVersion as ApiVersion
    }

    // Check URL path
    const url = new URL(request.url)
    const pathMatch = url.pathname.match(/\/api\/(v\d+)\//)
    if (pathMatch && this.isValidVersion(pathMatch[1])) {
      return pathMatch[1] as ApiVersion
    }

    // Default to latest stable
    return this.getLatestStable()
  }

  /**
   * Validate version
   */
  static isValidVersion(version: string): boolean {
    return this.versions.has(version as ApiVersion)
  }

  /**
   * Get latest stable version
   */
  static getLatestStable(): ApiVersion {
    const stable = Array.from(this.versions.values())
      .filter(v => v.status === 'STABLE')
      .sort((a, b) => b.releaseDate.getTime() - a.releaseDate.getTime())

    return stable[0]?.version || 'v1'
  }

  /**
   * Check if version is deprecated
   */
  static isDeprecated(version: ApiVersion): boolean {
    const info = this.versions.get(version)
    return info?.status === 'DEPRECATED' || info?.status === 'SUNSET'
  }

  /**
   * Get deprecation warning
   */
  static getDeprecationWarning(version: ApiVersion): string | null {
    const info = this.versions.get(version)
    
    if (!info || info.status === 'STABLE' || info.status === 'BETA') {
      return null
    }

    if (info.status === 'SUNSET') {
      return `API ${version} has been sunset and is no longer supported. Please upgrade to ${this.getLatestStable()}.`
    }

    if (info.status === 'DEPRECATED' && info.sunsetDate) {
      return `API ${version} is deprecated and will be sunset on ${info.sunsetDate.toISOString()}. Please upgrade to ${this.getLatestStable()}.`
    }

    return `API ${version} is deprecated. Please upgrade to ${this.getLatestStable()}.`
  }

  /**
   * Add version headers to response
   */
  static addVersionHeaders(
    response: NextResponse,
    version: ApiVersion
  ): NextResponse {
    response.headers.set('X-API-Version', version)
    response.headers.set('X-API-Latest-Version', this.getLatestStable())

    const warning = this.getDeprecationWarning(version)
    if (warning) {
      response.headers.set('X-API-Deprecation-Warning', warning)
      response.headers.set('Warning', `299 - "${warning}"`)
    }

    return response
  }

  /**
   * Create versioned response
   */
  static createVersionedResponse(
    data: any,
    version: ApiVersion,
    status: number = 200
  ): NextResponse {
    const response = NextResponse.json(data, { status })
    return this.addVersionHeaders(response, version)
  }

  /**
   * Get version info
   */
  static getVersionInfo(version: ApiVersion): VersionInfo | undefined {
    return this.versions.get(version)
  }

  /**
   * List all versions
   */
  static listVersions(): VersionInfo[] {
    return Array.from(this.versions.values())
      .sort((a, b) => b.releaseDate.getTime() - a.releaseDate.getTime())
  }

  /**
   * Check if feature is available in version
   */
  static hasFeature(version: ApiVersion, feature: string): boolean {
    const info = this.versions.get(version)
    return info?.features.includes(feature) || false
  }

  /**
   * Get migration guide
   */
  static getMigrationGuide(
    fromVersion: ApiVersion,
    toVersion: ApiVersion
  ): {
    breakingChanges: string[]
    newFeatures: string[]
    removedFeatures: string[]
  } {
    const from = this.versions.get(fromVersion)
    const to = this.versions.get(toVersion)

    if (!from || !to) {
      return {
        breakingChanges: [],
        newFeatures: [],
        removedFeatures: [],
      }
    }

    const newFeatures = to.features.filter(f => !from.features.includes(f))
    const removedFeatures = from.features.filter(f => !to.features.includes(f))

    return {
      breakingChanges: to.breakingChanges || [],
      newFeatures,
      removedFeatures,
    }
  }

  /**
   * Register default versions
   */
  static registerDefaultVersions(): void {
    this.registerVersion({
      version: 'v1',
      status: 'STABLE',
      releaseDate: new Date('2024-01-01'),
      features: [
        'dataset_catalog',
        'cohort_builder',
        'entity_resolution',
        'basic_analytics',
      ],
    })

    this.registerVersion({
      version: 'v2',
      status: 'BETA',
      releaseDate: new Date('2024-06-01'),
      features: [
        'dataset_catalog',
        'cohort_builder',
        'entity_resolution',
        'advanced_analytics',
        'real_time_monitoring',
        'feature_flags',
      ],
      breakingChanges: [
        'Changed pagination format',
        'Renamed some endpoints',
      ],
    })
  }
}

// Initialize default versions
ApiVersioning.registerDefaultVersions()

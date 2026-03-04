/**
 * PERFORMANCE PROFILER
 * Profile and analyze application performance
 */

export interface ProfileEntry {
  id: string
  name: string
  startTime: number
  endTime?: number
  duration?: number
  metadata?: Record<string, any>
  children: ProfileEntry[]
  parent?: ProfileEntry
}

export interface ProfileReport {
  name: string
  totalDuration: number
  selfDuration: number
  callCount: number
  avgDuration: number
  minDuration: number
  maxDuration: number
  children: ProfileReport[]
}

export class Profiler {
  private static profiles: Map<string, ProfileEntry> = new Map()
  private static activeProfiles: Map<string, ProfileEntry> = new Map()

  /**
   * Start profiling
   */
  static start(name: string, metadata?: Record<string, any>): string {
    const id = `prof_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    const entry: ProfileEntry = {
      id,
      name,
      startTime: performance.now(),
      metadata,
      children: [],
    }

    this.activeProfiles.set(id, entry)
    return id
  }

  /**
   * End profiling
   */
  static end(id: string): number {
    const entry = this.activeProfiles.get(id)
    if (!entry) return 0

    entry.endTime = performance.now()
    entry.duration = entry.endTime - entry.startTime

    this.activeProfiles.delete(id)
    this.profiles.set(id, entry)

    return entry.duration
  }

  /**
   * Profile async function
   */
  static async profile<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; duration: number }> {
    const id = this.start(name, metadata)
    
    try {
      const result = await fn()
      const duration = this.end(id)
      return { result, duration }
    } catch (error) {
      this.end(id)
      throw error
    }
  }

  /**
   * Profile sync function
   */
  static profileSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, any>
  ): { result: T; duration: number } {
    const id = this.start(name, metadata)
    
    try {
      const result = fn()
      const duration = this.end(id)
      return { result, duration }
    } catch (error) {
      this.end(id)
      throw error
    }
  }

  /**
   * Get profile entry
   */
  static getProfile(id: string): ProfileEntry | undefined {
    return this.profiles.get(id)
  }

  /**
   * Get all profiles
   */
  static getAllProfiles(): ProfileEntry[] {
    return Array.from(this.profiles.values())
  }

  /**
   * Get profiles by name
   */
  static getProfilesByName(name: string): ProfileEntry[] {
    return Array.from(this.profiles.values())
      .filter(p => p.name === name)
  }

  /**
   * Generate report
   */
  static generateReport(name?: string): ProfileReport[] {
    const profiles = name
      ? this.getProfilesByName(name)
      : this.getAllProfiles()

    const grouped = new Map<string, ProfileEntry[]>()

    for (const profile of profiles) {
      const key = profile.name
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(profile)
    }

    const reports: ProfileReport[] = []

    for (const [profileName, entries] of grouped.entries()) {
      const durations = entries
        .filter(e => e.duration !== undefined)
        .map(e => e.duration!)

      if (durations.length === 0) continue

      const totalDuration = durations.reduce((sum, d) => sum + d, 0)
      const avgDuration = totalDuration / durations.length
      const minDuration = Math.min(...durations)
      const maxDuration = Math.max(...durations)

      reports.push({
        name: profileName,
        totalDuration,
        selfDuration: totalDuration,
        callCount: durations.length,
        avgDuration,
        minDuration,
        maxDuration,
        children: [],
      })
    }

    return reports.sort((a, b) => b.totalDuration - a.totalDuration)
  }

  /**
   * Get slowest operations
   */
  static getSlowest(limit: number = 10): ProfileEntry[] {
    return Array.from(this.profiles.values())
      .filter(p => p.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, limit)
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalProfiles: number
    activeProfiles: number
    avgDuration: number
    totalDuration: number
    byName: Record<string, number>
  } {
    const profiles = Array.from(this.profiles.values())
    const byName: Record<string, number> = {}
    let totalDuration = 0

    for (const profile of profiles) {
      byName[profile.name] = (byName[profile.name] || 0) + 1
      if (profile.duration) {
        totalDuration += profile.duration
      }
    }

    const avgDuration = profiles.length > 0 ? totalDuration / profiles.length : 0

    return {
      totalProfiles: profiles.length,
      activeProfiles: this.activeProfiles.size,
      avgDuration,
      totalDuration,
      byName,
    }
  }

  /**
   * Clear profiles
   */
  static clear(): void {
    this.profiles.clear()
  }

  /**
   * Export report
   */
  static exportReport(format: 'json' | 'text' = 'json'): string {
    const reports = this.generateReport()

    if (format === 'json') {
      return JSON.stringify(reports, null, 2)
    }

    // Text format
    const lines: string[] = []
    lines.push('Performance Profile Report')
    lines.push('=========================')
    lines.push('')

    for (const report of reports) {
      lines.push(`${report.name}:`)
      lines.push(`  Calls: ${report.callCount}`)
      lines.push(`  Total: ${report.totalDuration.toFixed(2)}ms`)
      lines.push(`  Avg: ${report.avgDuration.toFixed(2)}ms`)
      lines.push(`  Min: ${report.minDuration.toFixed(2)}ms`)
      lines.push(`  Max: ${report.maxDuration.toFixed(2)}ms`)
      lines.push('')
    }

    return lines.join('\n')
  }

  /**
   * Create profiler decorator
   */
  static createDecorator(name?: string) {
    return function (
      target: any,
      propertyKey: string,
      descriptor: PropertyDescriptor
    ) {
      const originalMethod = descriptor.value
      const profileName = name || `${target.constructor.name}.${propertyKey}`

      descriptor.value = async function (...args: any[]) {
        const { result, duration } = await Profiler.profile(
          profileName,
          () => originalMethod.apply(this, args)
        )

        return result
      }

      return descriptor
    }
  }

  /**
   * Measure memory usage
   */
  static measureMemory(): {
    heapUsed: number
    heapTotal: number
    external: number
    arrayBuffers: number
  } {
    const mem = process.memoryUsage()
    
    return {
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
    }
  }

  /**
   * Get performance marks
   */
  static mark(name: string): void {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(name)
    }
  }

  /**
   * Measure between marks
   */
  static measure(name: string, startMark: string, endMark: string): number {
    if (typeof performance !== 'undefined' && performance.measure) {
      performance.measure(name, startMark, endMark)
      const entries = performance.getEntriesByName(name)
      return entries.length > 0 ? entries[0].duration : 0
    }
    return 0
  }
}

/**
 * Performance Profiler
 * Tracks execution time and performance metrics
 */

export interface ProfileResult {
  id: string;
  name: string;
  duration: number;
  timestamp: Date;
}

export interface ProfilerStats {
  totalCalls: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
}

export class Profiler {
  private static profiles: Map<string, ProfileResult> = new Map();
  private static activeTimers: Map<string, number> = new Map();
  private static counter = 0;

  static clear(): void {
    this.profiles.clear();
    this.activeTimers.clear();
  }

  static start(name: string): string {
    const id = `prof_${++this.counter}_${Date.now()}`;
    this.activeTimers.set(id, performance.now());
    return id;
  }

  static end(id: string): number {
    const startTime = this.activeTimers.get(id);
    if (startTime === undefined) {
      return 0;
    }

    const duration = performance.now() - startTime;
    this.activeTimers.delete(id);

    return duration;
  }

  static async profile<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    const result = await fn();
    const duration = performance.now() - start;
    
    // Store the profile
    const id = `prof_${++this.counter}_${Date.now()}`;
    this.profiles.set(id, {
      id,
      name,
      duration,
      timestamp: new Date(),
    });
    
    return { result, duration };
  }

  static profileSync<T>(name: string, fn: () => T): { result: T; duration: number } {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    return { result, duration };
  }

  static getProfilesByName(name: string): ProfileResult[] {
    return Array.from(this.profiles.values()).filter(p => p.name === name);
  }

  static generateReport(name?: string): { name: string; callCount: number; totalDuration: number; avgDuration: number }[] {
    const allProfiles = this.getAllProfiles();
    
    // Group by name
    const grouped: Record<string, { name: string; callCount: number; totalDuration: number; avgDuration: number }> = {};
    
    for (const profile of allProfiles) {
      if (name && profile.name !== name) continue;
      
      if (!grouped[profile.name]) {
        grouped[profile.name] = {
          name: profile.name,
          callCount: 0,
          totalDuration: 0,
          avgDuration: 0,
        };
      }
      grouped[profile.name].callCount += 1;
      grouped[profile.name].totalDuration += profile.duration;
    }
    
    // Calculate averages
    for (const key of Object.keys(grouped)) {
      grouped[key].avgDuration = grouped[key].totalDuration / grouped[key].callCount;
    }
    
    return Object.values(grouped);
  }

  static getSlowest(n: number): { name: string; duration: number }[] {
    const profiles = this.getAllProfiles()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, n)
      .map(p => ({ name: p.name, duration: p.duration }));
    return profiles;
  }

  static getStatistics(): { totalProfiles: number; activeProfiles: number; byName: Record<string, number> } {
    const profiles = this.getAllProfiles();
    const byName: Record<string, number> = {};
    
    for (const profile of profiles) {
      byName[profile.name] = (byName[profile.name] || 0) + 1;
    }
    
    return {
      totalProfiles: profiles.length,
      activeProfiles: this.activeTimers.size,
      byName,
    };
  }

  static exportReport(format: 'json' | 'text'): string {
    const stats = this.getStatistics();
    
    if (format === 'json') {
      return JSON.stringify(stats, null, 2);
    }
    
    let text = 'Performance Profile Report\n';
    text += '='.repeat(30) + '\n\n';
    text += `Total Profiles: ${stats.totalProfiles}\n`;
    text += `Active Profiles: ${stats.activeProfiles}\n\n`;
    
    for (const [name, count] of Object.entries(stats.byName)) {
      text += `${name}: ${count} calls\n`;
    }
    
    return text;
  }

  static measureMemory(): { used: number; total: number; free: number; heapUsed: number; heapTotal: number } {
    const usage = process.memoryUsage();
    return {
      used: usage.heapUsed,
      total: usage.heapTotal,
      free: usage.heapTotal - usage.heapUsed,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
    };
  }

  static getStats(name: string): ProfilerStats | undefined {
    const calls = Array.from(this.profiles.values()).filter(p => p.name === name);
    if (calls.length === 0) {
      return undefined;
    }

    const durations = calls.map(c => c.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);

    return {
      totalCalls: calls.length,
      totalDuration,
      averageDuration: totalDuration / calls.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
    };
  }

  static getAllProfiles(): ProfileResult[] {
    return Array.from(this.profiles.values());
  }

  static reset(name?: string): void {
    if (name) {
      for (const [id, profile] of this.profiles) {
        if (profile.name === name) {
          this.profiles.delete(id);
        }
      }
    } else {
      this.clear();
    }
  }
}

export function createProfiler(): Profiler {
  return new Profiler();
}

export const globalProfiler = new Profiler();

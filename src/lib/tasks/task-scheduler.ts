/**
 * TASK SCHEDULER
 * Schedule and manage background tasks
 */

export interface ScheduledTask {
  id: string
  name: string
  schedule: string // cron expression
  handler: () => Promise<void>
  enabled: boolean
  lastRun?: Date
  nextRun?: Date
  runCount: number
  errorCount: number
}

export interface TaskExecution {
  taskId: string
  startTime: Date
  endTime?: Date
  duration?: number
  success: boolean
  error?: string
}

export class TaskScheduler {
  private static tasks: Map<string, ScheduledTask> = new Map()
  private static executions: TaskExecution[] = []
  private static intervals: Map<string, NodeJS.Timeout> = new Map()
  private static readonly MAX_EXECUTIONS = 1000

  /**
   * Register task
   */
  static register(task: Omit<ScheduledTask, 'runCount' | 'errorCount'>): void {
    const fullTask: ScheduledTask = {
      ...task,
      runCount: 0,
      errorCount: 0,
    }

    this.tasks.set(task.id, fullTask)

    if (task.enabled) {
      this.scheduleTask(fullTask)
    }
  }

  /**
   * Schedule task
   */
  private static scheduleTask(task: ScheduledTask): void {
    const interval = this.parseSchedule(task.schedule)
    
    if (interval) {
      const timer = setInterval(async () => {
        await this.executeTask(task.id)
      }, interval)

      this.intervals.set(task.id, timer)
    }
  }

  /**
   * Parse schedule to interval
   */
  private static parseSchedule(schedule: string): number | null {
    // Simple parsing - in production would use cron parser
    const patterns: Record<string, number> = {
      '* * * * *': 60000, // every minute
      '*/5 * * * *': 300000, // every 5 minutes
      '*/15 * * * *': 900000, // every 15 minutes
      '*/30 * * * *': 1800000, // every 30 minutes
      '0 * * * *': 3600000, // every hour
      '0 0 * * *': 86400000, // daily
    }

    return patterns[schedule] || null
  }

  /**
   * Execute task
   */
  static async executeTask(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId)
    if (!task || !task.enabled) return false

    const execution: TaskExecution = {
      taskId,
      startTime: new Date(),
      success: false,
    }

    try {
      await task.handler()
      
      execution.success = true
      task.runCount++
      task.lastRun = new Date()
    } catch (error) {
      execution.success = false
      execution.error = error instanceof Error ? error.message : String(error)
      task.errorCount++
    } finally {
      execution.endTime = new Date()
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime()

      this.executions.push(execution)

      // Trim executions
      if (this.executions.length > this.MAX_EXECUTIONS) {
        this.executions = this.executions.slice(-this.MAX_EXECUTIONS)
      }

      this.tasks.set(taskId, task)
    }

    return execution.success
  }

  /**
   * Enable task
   */
  static enableTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.enabled = true
    this.tasks.set(taskId, task)
    this.scheduleTask(task)
  }

  /**
   * Disable task
   */
  static disableTask(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return

    task.enabled = false
    this.tasks.set(taskId, task)

    const interval = this.intervals.get(taskId)
    if (interval) {
      clearInterval(interval)
      this.intervals.delete(taskId)
    }
  }

  /**
   * Get task
   */
  static getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId)
  }

  /**
   * List tasks
   */
  static listTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Get executions
   */
  static getExecutions(taskId?: string, limit: number = 50): TaskExecution[] {
    let executions = this.executions

    if (taskId) {
      executions = executions.filter(e => e.taskId === taskId)
    }

    return executions.slice(-limit).reverse()
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalTasks: number
    enabledTasks: number
    totalExecutions: number
    successRate: number
    avgDuration: number
  } {
    const tasks = Array.from(this.tasks.values())
    const successfulExecutions = this.executions.filter(e => e.success).length
    const totalDuration = this.executions.reduce((sum, e) => sum + (e.duration || 0), 0)

    return {
      totalTasks: tasks.length,
      enabledTasks: tasks.filter(t => t.enabled).length,
      totalExecutions: this.executions.length,
      successRate: this.executions.length > 0
        ? (successfulExecutions / this.executions.length) * 100
        : 0,
      avgDuration: this.executions.length > 0
        ? totalDuration / this.executions.length
        : 0,
    }
  }

  /**
   * Clear executions
   */
  static clearExecutions(): void {
    this.executions = []
  }

  /**
   * Stop all tasks
   */
  static stopAll(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval)
    }
    this.intervals.clear()
  }

  /**
   * Register default tasks
   */
  static registerDefaultTasks(): void {
    this.register({
      id: 'cleanup_old_logs',
      name: 'Cleanup Old Logs',
      schedule: '0 0 * * *', // daily
      enabled: true,
      handler: async () => {
        console.log('[TaskScheduler] Cleaning up old logs...')
        // Cleanup logic here
      },
    })

    this.register({
      id: 'refresh_cache',
      name: 'Refresh Cache',
      schedule: '*/30 * * * *', // every 30 minutes
      enabled: true,
      handler: async () => {
        console.log('[TaskScheduler] Refreshing cache...')
        // Cache refresh logic here
      },
    })

    this.register({
      id: 'health_check',
      name: 'Health Check',
      schedule: '*/5 * * * *', // every 5 minutes
      enabled: true,
      handler: async () => {
        console.log('[TaskScheduler] Running health check...')
        // Health check logic here
      },
    })
  }
}

// Initialize default tasks
TaskScheduler.registerDefaultTasks()

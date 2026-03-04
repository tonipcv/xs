/**
 * Task Scheduler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { TaskScheduler } from '@/lib/tasks/task-scheduler'

describe('Task Scheduler', () => {
  beforeEach(() => {
    TaskScheduler.stopAll()
    TaskScheduler.clearExecutions()
  })

  describe('register', () => {
    it('should register task', () => {
      TaskScheduler.register({
        id: 'test',
        name: 'Test Task',
        schedule: '* * * * *',
        enabled: false,
        handler: async () => {},
      })
      
      const task = TaskScheduler.getTask('test')
      expect(task).toBeDefined()
      expect(task?.name).toBe('Test Task')
    })
  })

  describe('executeTask', () => {
    it('should execute task successfully', async () => {
      const handler = vi.fn().mockResolvedValue(undefined)
      
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: true,
        handler,
      })
      
      const success = await TaskScheduler.executeTask('test')
      
      expect(success).toBe(true)
      expect(handler).toHaveBeenCalled()
    })

    it('should handle task failure', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('fail'))
      
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: true,
        handler,
      })
      
      const success = await TaskScheduler.executeTask('test')
      
      expect(success).toBe(false)
    })

    it('should not execute disabled task', async () => {
      const handler = vi.fn()
      
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: false,
        handler,
      })
      
      const success = await TaskScheduler.executeTask('test')
      
      expect(success).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('enableTask / disableTask', () => {
    it('should enable task', () => {
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: false,
        handler: async () => {},
      })
      
      TaskScheduler.enableTask('test')
      
      const task = TaskScheduler.getTask('test')
      expect(task?.enabled).toBe(true)
    })

    it('should disable task', () => {
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: true,
        handler: async () => {},
      })
      
      TaskScheduler.disableTask('test')
      
      const task = TaskScheduler.getTask('test')
      expect(task?.enabled).toBe(false)
    })
  })

  describe('listTasks', () => {
    it('should list all tasks', () => {
      TaskScheduler.register({
        id: 'test1',
        name: 'Test 1',
        schedule: '* * * * *',
        enabled: true,
        handler: async () => {},
      })
      
      TaskScheduler.register({
        id: 'test2',
        name: 'Test 2',
        schedule: '* * * * *',
        enabled: false,
        handler: async () => {},
      })
      
      const tasks = TaskScheduler.listTasks()
      expect(tasks.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getStatistics', () => {
    it('should get statistics', async () => {
      TaskScheduler.register({
        id: 'test',
        name: 'Test',
        schedule: '* * * * *',
        enabled: true,
        handler: async () => {},
      })
      
      await TaskScheduler.executeTask('test')
      
      const stats = TaskScheduler.getStatistics()
      
      expect(stats.totalExecutions).toBeGreaterThan(0)
      expect(stats.successRate).toBeGreaterThan(0)
    })
  })
})

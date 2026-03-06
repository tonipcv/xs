import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StructuredLogger, LogLevel, createJobLogger, createRequestLogger } from '@/lib/preparation/observability/logger';

describe('StructuredLogger', () => {
  let logger: StructuredLogger;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logger = new StructuredLogger();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('initialization', () => {
    it('should create logger with auto-generated correlation ID', () => {
      const correlationId = logger.getCorrelationId();
      expect(correlationId).toBeDefined();
      expect(correlationId.length).toBeGreaterThan(0);
    });

    it('should create logger with provided correlation ID', () => {
      const customId = 'custom-correlation-id';
      const customLogger = new StructuredLogger({ correlationId: customId });
      expect(customLogger.getCorrelationId()).toBe(customId);
    });

    it('should create logger with job context', () => {
      const jobLogger = new StructuredLogger({
        jobId: 'job-123',
        datasetId: 'dataset-456',
      });
      expect(jobLogger.getCorrelationId()).toBeDefined();
    });
  });

  describe('logging methods', () => {
    it('should log info message', () => {
      logger.info('Test info message');
      
      expect(consoleInfoSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe(LogLevel.INFO);
      expect(loggedData.message).toBe('Test info message');
      expect(loggedData.timestamp).toBeDefined();
    });

    it('should log debug message', () => {
      logger.debug('Test debug message');
      
      const loggedData = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe(LogLevel.DEBUG);
      expect(loggedData.message).toBe('Test debug message');
    });

    it('should log warning message', () => {
      logger.warn('Test warning message');
      
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe(LogLevel.WARN);
      expect(loggedData.message).toBe('Test warning message');
    });

    it('should log error message', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe(LogLevel.ERROR);
      expect(loggedData.message).toBe('Error occurred');
      expect(loggedData.error).toBeDefined();
      expect(loggedData.error.name).toBe('Error');
      expect(loggedData.error.message).toBe('Test error');
    });

    it('should log with metadata', () => {
      logger.info('Message with metadata', { userId: 'user-123', action: 'compile' });
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.metadata).toEqual({ userId: 'user-123', action: 'compile' });
    });
  });

  describe('context management', () => {
    it('should include correlation ID in all logs', () => {
      const correlationId = logger.getCorrelationId();
      logger.info('Test message');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.context.correlationId).toBe(correlationId);
    });

    it('should update context', () => {
      logger.updateContext({ jobId: 'job-789', stage: 'compilation' });
      logger.info('Test message');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.context.jobId).toBe('job-789');
      expect(loggedData.context.stage).toBe('compilation');
    });

    it('should create child logger with additional context', () => {
      const parentLogger = new StructuredLogger({ jobId: 'job-123' });
      const childLogger = parentLogger.child({ stage: 'normalization' });
      
      childLogger.info('Child message');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.context.jobId).toBe('job-123');
      expect(loggedData.context.stage).toBe('normalization');
      expect(loggedData.context.correlationId).toBe(parentLogger.getCorrelationId());
    });
  });

  describe('helper functions', () => {
    it('should create job logger', () => {
      const jobLogger = createJobLogger('job-abc', 'dataset-xyz');
      jobLogger.info('Job started');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.context.jobId).toBe('job-abc');
      expect(loggedData.context.datasetId).toBe('dataset-xyz');
    });

    it('should create request logger with correlation ID', () => {
      const requestLogger = createRequestLogger('req-123');
      expect(requestLogger.getCorrelationId()).toBe('req-123');
    });

    it('should create request logger with auto-generated ID', () => {
      const requestLogger = createRequestLogger();
      expect(requestLogger.getCorrelationId()).toBeDefined();
    });
  });

  describe('structured format', () => {
    it('should produce valid JSON', () => {
      logger.info('Test message', { key: 'value' });
      
      const logOutput = consoleInfoSpy.mock.calls[0][0];
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it('should include all required fields', () => {
      logger.info('Test message');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData).toHaveProperty('timestamp');
      expect(loggedData).toHaveProperty('level');
      expect(loggedData).toHaveProperty('message');
      expect(loggedData).toHaveProperty('context');
    });

    it('should format timestamp as ISO string', () => {
      logger.info('Test message');
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(() => new Date(loggedData.timestamp)).not.toThrow();
    });
  });

  describe('medical use cases', () => {
    it('should log clinical data preparation', () => {
      const clinicalLogger = createJobLogger('job-clinical', 'clinical-notes');
      clinicalLogger.updateContext({ stage: 'normalization', tenantId: 'hospital-1' });
      
      clinicalLogger.info('Starting de-identification', {
        recordCount: 1000,
        piiHandling: 'mask',
      });
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.context.jobId).toBe('job-clinical');
      expect(loggedData.context.stage).toBe('normalization');
      expect(loggedData.metadata.recordCount).toBe(1000);
    });

    it('should log medical chatbot training preparation', () => {
      const chatbotLogger = createJobLogger('job-chatbot', 'medical-qa');
      chatbotLogger.updateContext({ stage: 'compilation' });
      
      chatbotLogger.info('Formatting SFT examples', {
        template: 'chatml',
        validExamples: 950,
        invalidExamples: 50,
      });
      
      const loggedData = JSON.parse(consoleInfoSpy.mock.calls[0][0]);
      expect(loggedData.metadata.template).toBe('chatml');
    });

    it('should log errors with patient safety context', () => {
      const safetyLogger = createJobLogger('job-safety', 'patient-data');
      
      const error = new Error('PII detection failed');
      safetyLogger.error('Critical safety violation', error, {
        severity: 'high',
        action: 'block_delivery',
      });
      
      const loggedData = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
      expect(loggedData.level).toBe(LogLevel.ERROR);
      expect(loggedData.error.message).toBe('PII detection failed');
      expect(loggedData.metadata.severity).toBe('high');
    });
  });
});

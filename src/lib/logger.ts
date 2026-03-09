/**
 * Simple logger export for compatibility
 * Re-exports from structured-logger for modules that expect @/lib/logger
 */

export { 
  logger,
  LogLevel,
  type LogEntry,
  createRequestLogger,
  PerformanceLogger,
  queryLogs,
  getLogStatistics
} from './logging/structured-logger';

// Re-export logger as default
import { logger } from './logging/structured-logger';
export default logger;

import winston from 'winston';
import path from 'path';
import fs from 'fs/promises';

/**
 * Centralized logging configuration for the IBM Bob 2.0 Modernization Pipeline
 */
class Logger {
  /**
   * Create a logger instance
   * @param {Object} options - Logger options
   * @param {string} options.name - Logger name
   * @param {string} options.level - Log level (error, warn, info, debug, silly)
   * @param {boolean} options.console - Enable console logging
   * @param {boolean} options.file - Enable file logging
   * @param {string} options.logDir - Directory for log files
   * @param {number} options.maxSize - Maximum log file size before rotation
   * @param {number} options.maxFiles - Maximum number of log files to retain
   * @returns {winston.Logger} Configured Winston logger instance
   */
  static createLogger(options = {}) {
    const {
      name = 'application',
      level = process.env.LOG_LEVEL || 'info',
      console = process.env.LOG_CONSOLE !== 'false',
      file = process.env.LOG_FILE !== 'false',
      logDir = process.env.LOG_DIR || './logs',
      maxSize = process.env.LOG_MAX_SIZE || '10m',
      maxFiles = parseInt(process.env.LOG_MAX_FILES) || 5
    } = options;

    try {
      // Ensure log directory exists
      fs.access(logDir).catch(() => fs.mkdir(logDir, { recursive: true }));
    } catch (error) {
      console.warn(`Could not ensure log directory ${logDir}: ${error.message}`);
    }

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json()
    );

    // Define transports
    const transports = [];

    if (console) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(
              ({ timestamp, level, message, stack }) => {
                return `${timestamp} [${level}] ${message}${stack ? '\n' + stack : ''}`;
              }
            )
          )
        })
      );
    }

    if (file) {
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, `${name}.log`),
          level: level,
          maxsize: this.parseSize(maxSize),
          maxFiles: maxFiles,
          format: winston.format.uncolorize()
        })
      );

      // Add error file transport
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, `${name}-error.log`),
          level: 'error',
          maxsize: this.parseSize(maxSize),
          maxFiles: maxFiles,
          format: winston.format.uncolorize()
        })
      );
    }

    // Create logger instance
    const logger = winston.createLogger({
      level: level,
      format: logFormat,
      transports: transports,
      exitOnError: false
    });

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception thrown', error);
      process.exit(1);
    });

    return logger;
  }

  /**
   * Parse size string (e.g., '10m', '1g') to bytes
   * @param {string} sizeStr - Size string
   * @returns {number} Size in bytes
   */
  static parseSize(sizeStr) {
    if (typeof sizeStr === 'number') return sizeStr;

    const match = sizeStr.toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmg]?b?)$/);
    if (!match) return parseInt(sizeStr) || 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'kb': return value * 1024;
      case 'mb': return value * 1024 * 1024;
      case 'gb': return value * 1024 * 1024 * 1024;
      case 'b':
      case '':
      default: return value;
    }
  }

  /**
   * Create a child logger with additional metadata
   * @param {winston.Logger} parentLogger - Parent logger
   * @param {Object} metadata - Metadata to include in all log entries
   * @returns {winston.Logger} Child logger
   */
  static createChildLogger(parentLogger, metadata = {}) {
    return parentLogger.child(metadata);
  }

  /**
   * Create a request-scoped logger
   * @param {winston.Logger} baseLogger - Base logger
   * @param {string} requestId - Request ID
   * @param {string} jobId - Job ID (optional)
   * @returns {winston.Logger} Request-scoped logger
   */
  static createRequestLogger(baseLogger, requestId, jobId = '') {
    return baseLogger.child({
      requestId,
      jobId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log performance metrics
   * @param {winston.Logger} logger - Logger instance
   * @param {string} operation - Operation name
   * @param {number} durationMs - Duration in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  static logPerformance(logger, operation, durationMs, metadata = {}) {
    logger.info(`Performance: ${operation} completed in ${durationMs}ms`, {
      ...metadata,
      operation,
      durationMs,
      type: 'performance'
    });
  }

  /**
   * Log audit event
   * @param {winston.Logger} logger - Logger instance
   * @param {string} event - Event description
   * @param {Object} details - Event details
   */
  static logAudit(logger, event, details = {}) {
    logger.info(`Audit: ${event}`, {
      ...details,
      event,
      type: 'audit',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log security event
   * @param {winston.Logger} logger - Logger instance
   * @param {string} event - Security event description
   * @param {Object} details - Event details
   */
  static logSecurity(logger, event, details = {}) {
    logger.warn(`Security: ${event}`, {
      ...details,
      event,
      type: 'security',
      timestamp: new Date().toISOString()
    });
  }
}

export default Logger;
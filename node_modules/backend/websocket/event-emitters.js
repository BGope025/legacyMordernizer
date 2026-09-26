import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} ${level}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/event-emitters.log' })
  ]
});

class EventEmitters {
  /**
   * Create event emitters for WebSocket server
   * @param {WebSocketServer} wsServer - The WebSocket server instance
   * @returns {Object} Object with emit methods
   */
  static create(wsServer) {
    return {
      /**
       * Emit subagent lifecycle events
       * @param {string} jobId - Job ID
       * @param {string} subagentId - Subagent ID
       * @param {string} type - Subagent type
       * @param {string} status - Status (spawned, started, completed, failed, terminated)
       * @param {Object} additionalData - Additional data to include
       */
      emitSubagentEvent: (jobId, subagentId, type, status, additionalData = {}) => {
        const eventData = {
          jobId,
          subagentId,
          type,
          status,
          timestamp: new Date().toISOString(),
          ...additionalData
        };

        wsServer.emitToJob(jobId, 'subagent-event', eventData);
        logger.debug(`Emitted subagent-event: ${type} ${status} for job ${jobId}, subagent ${subagentId}`);
      },

      /**
       * Emit terminal/log output from subagents
       * @param {string} jobId - Job ID
       * @param {string} subagentId - Subagent ID
       * @param {string} logLevel - Log level (info, warn, error, debug)
       * @param {string} message - Log message
       */
      emitLog: (jobId, subagentId, logLevel, message) => {
        const eventData = {
          jobId,
          subagentId,
          level: logLevel,
          message,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'terminal-log', eventData);
        logger.debug(`Emitted terminal-log: [${subagentId}] ${message}`);
      },

      /**
       * Emit progress updates
       * @param {string} jobId - Job ID
       * @param {string} subagentId - Subagent ID
       * @param {number} progress - Progress percentage (0-100)
       * @param {string} message - Optional progress message
       */
      emitProgress: (jobId, subagentId, progress, message = '') => {
        const eventData = {
          jobId,
          subagentId,
          progress: Math.min(100, Math.max(0, progress)),
          message,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'progress-update', eventData);
        logger.debug(`Emitted progress-update: ${subagentId} ${progress}%`);
      },

      /**
       * Emit phase changes in modernization process
       * @param {string} jobId - Job ID
       * @param {number} phase - Phase number
       * @param {string} phaseName - Phase name
       * @param {string} description - Optional description
       */
      emitPhaseChange: (jobId, phase, phaseName, description = '') => {
        const eventData = {
          jobId,
          phase,
          phaseName,
          description,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'phase-change', eventData);
        logger.debug(`Emitted phase-change: Phase ${phase} - ${phaseName} for job ${jobId}`);
      },

      /**
       * Emit modernization completion
       * @param {string} jobId - Job ID
       * @param {Object} results - Modernization results
       */
      emitModernizationComplete: (jobId, results) => {
        const eventData = {
          jobId,
          status: 'completed',
          results,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'modernization-complete', eventData);
        logger.info(`Emitted modernization-complete for job ${jobId}`);
      },

      /**
       * Emit modernization failure
       * @param {string} jobId - Job ID
       * @param {Object} error - Error information
       */
      emitModernizationFailed: (jobId, error) => {
        const eventData = {
          jobId,
          status: 'failed',
          error,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'modernization-failed', eventData);
        logger.error(`Emitted modernization-failed for job ${jobId}: ${error.message || error}`);
      },

      /**
       * Emit test results
       * @param {string} jobId - Job ID
       * @param {string} testRunId - Test run ID
       * @param {Object} testResults - Test results
       */
      emitTestResults: (jobId, testRunId, testResults) => {
        const eventData = {
          jobId,
          testRunId,
          results: testResults,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'test-results', eventData);
        logger.info(`Emitted test-results for job ${jobId}, test run ${testRunId}`);
      },

      /**
       * Emit plan generation completion
       * @param {string} jobId - Job ID
       * @param {string} planId - Plan ID
       * @param {Object} plan - The generated plan
       */
      emitPlanGenerated: (jobId, planId, plan) => {
        const eventData = {
          jobId,
          planId,
          plan,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'plan-generated', eventData);
        logger.info(`Emitted plan-generated for job ${jobId}, plan ${planId}`);
      },

      /**
       * Emit transformation start/completion
       * @param {string} jobId - Job ID
       * @param {string} transformationId - Transformation ID
       * @param {string} status - Status (started, completed, failed)
       * @param {Object} details - Transformation details
       */
      emitTransformationEvent: (jobId, transformationId, status, details = {}) => {
        const eventData = {
          jobId,
          transformationId,
          status,
          ...details,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'transformation-event', eventData);
        logger.debug(`Emitted transformation-event: ${transformationId} ${status} for job ${jobId}`);
      },

      /**
       * Emit system metrics
       * @param {string} jobId - Job ID
       * @param {Object} metrics - System metrics (CPU, memory, etc.)
       */
      emitMetrics: (jobId, metrics) => {
        const eventData = {
          jobId,
          metrics,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'metrics-update', eventData);
        logger.debug(`Emitted metrics-update for job ${jobId}`);
      },

      /**
       * Emit custom event
       * @param {string} jobId - Job ID
       * @param {string} eventName - Custom event name
       * @param {Object} data - Event data
       */
      emitCustom: (jobId, eventName, data) => {
        const eventData = {
          jobId,
          ...data,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, eventName, eventData);
        logger.debug(`Emitted custom event ${eventName} for job ${jobId}`);
      },

      /**
       * Emit health check
       * @param {string} jobId - Job ID
       * @param {Object} health - Health status
       */
      emitHealthCheck: (jobId, health) => {
        const eventData = {
          jobId,
          health,
          timestamp: new Date().toISOString()
        };

        wsServer.emitToJob(jobId, 'health-check', eventData);
        logger.debug(`Emitted health-check for job ${jobId}`);
      }
    };
  }
}

export default EventEmitters;
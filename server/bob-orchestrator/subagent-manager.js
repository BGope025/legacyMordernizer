import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

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
    new winston.transports.File({ filename: 'logs/subagent-manager.log' })
  ]
});

class SubagentManager {
  constructor(websocketServer) {
    this.activeSubagents = new Map(); // subagentId => { info, process, websocket }
    this.websocketServer = websocketServer;
  }

  /**
   * Spawn a Bob subagent for a specific task
   * @param {string} taskType - Type of task (db-refactor, auth-migration, business-logic, etc.)
   * @param {Object} options - Subagent options
   * @param {string} options.jobId - Associated job ID
   * @param {string} options.planId - Associated plan ID
   * @param {string} options.sourcePath - Path to source code
   * @param {string} options.outputPath - Path for output
   * @param {Object} options.config - Task-specific configuration
   * @returns {Promise<Object>} Promise with subagentId and initial info
   */
  async spawnSubagent(taskType, options = {}) {
    const { jobId, planId, sourcePath, outputPath, config = {} } = options;
    const subagentId = uuidv4();

    logger.info(`Spawning ${taskType} subagent: ${subagentId} (Job: ${jobId}, Plan: ${planId})`);

    try {
      // Validate required paths
      if (sourcePath) {
        await fs.access(sourcePath);
      }
      if (outputPath) {
        await fs.mkdir(outputPath, { recursive: true });
      }

      // Build Bob command for subagent execution
      // In a real implementation, this would use IBM Bob 2.0 CLI with subagent-specific configs
      const bobCommand = `bob run subagent --type ${taskType}`;
      const args = [];

      if (jobId) args.push('--job-id', jobId);
      if (planId) args.push('--plan-id', planId);
      if (sourcePath) args.push('--source', sourcePath);
      if (outputPath) args.push('--output', outputPath);

      // Add config as JSON
      if (Object.keys(config).length > 0) {
        args.push('--config', JSON.stringify(config));
      }

      const fullCommand = [bobCommand, ...args].join(' ');

      // Spawn the Bob subagent process
      const [cmd, ...cmdArgs] = fullCommand.split(' ');
      const child = spawn(cmd, cmdArgs, {
        env: {
          ...process.env,
          BOB_SUBAGENT_ID: subagentId,
          BOB_JOB_ID: jobId || '',
          BOB_PLAN_ID: planId || '',
          BOB_API_KEY: process.env.BOB_API_KEY || '',
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      });

      // Store subagent info
      const subagentInfo = {
        id: subagentId,
        type: taskType,
        jobId,
        planId,
        sourcePath,
        outputPath,
        config,
        status: 'starting',
        startedAt: Date.now(),
        process: child,
        logs: [],
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0
        }
      };

      this.activeSubagents.set(subagentId, subagentInfo);

      // Initialize output buffers
      let stdout = '';
      let stderr = '';

      // Handle stdout
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;

        // Parse output for structured logging
        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'stdout',
          data: output.trim(),
          subagentId
        };

        subagentInfo.logs.push(logEntry);

        // Keep only last 1000 log entries
        if (subagentInfo.logs.length > 1000) {
          subagentInfo.logs.shift();
        }

        logger.debug(`[${subagentId}] STDOUT: ${output.trim()}`);

        // Emit via WebSocket to frontend
        this.emitToWebsocket(subagentId, {
          type: 'log',
          level: 'info',
          message: output.trim(),
          timestamp: logEntry.timestamp
        });

        // Check for progress indicators in output
        this.parseProgress(output, subagentId);
      });

      // Handle stderr
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;

        const logEntry = {
          timestamp: new Date().toISOString(),
          type: 'stderr',
          data: output.trim(),
          subagentId
        };

        subagentInfo.logs.push(logEntry);

        if (subagentInfo.logs.length > 1000) {
          subagentInfo.logs.shift();
        }

        logger.warn(`[${subagentId}] STDERR: ${output.trim()}`);

        this.emitToWebsocket(subagentId, {
          type: 'log',
          level: 'error',
          message: output.trim(),
          timestamp: logEntry.timestamp
        });
      });

      // Handle close/exit
      child.on('close', (code) => {
        subagentInfo.status = code === 0 ? 'completed' : 'failed';
        subagentInfo.exitCode = code;
        subagentInfo.finishedAt = Date.now();
        subagentInfo.duration = subagentInfo.finishedAt - subagentInfo.startedAt;

        logger.info(`Subagent ${subagentId} (${taskType}) ${code === 0 ? 'completed' : 'failed'} with code ${code}`);

        // Emit completion event
        this.emitToWebsocket(subagentId, {
          type: 'subagent-complete',
          subagentId,
          status: subagentInfo.status,
          exitCode: code,
          duration: subagentInfo.duration,
          timestamp: new Date().toISOString()
        });

        // Clean up after a delay to allow for final event processing
        setTimeout(() => {
          // Keep finished subagents for a while for inspection
          // In production, you might move to completed list or database
        }, 30000); // 30 seconds
      });

      // Handle process errors
      child.on('error', (err) => {
        logger.error(`Subagent process error: ${err.message} (Subagent: ${subagentId})`);

        subagentInfo.status = 'error';
        subagentInfo.error = err.message;
        subagentInfo.finishedAt = Date.now();

        this.emitToWebsocket(subagentId, {
          type: 'subagent-error',
          subagentId,
          error: err.message,
          timestamp: new Date().toISOString()
        });
      });

      // Start monitoring metrics
      this.startMetricsMonitoring(subagentId, child);

      return {
        subagentId,
        type: taskType,
        jobId,
        planId,
        status: 'spawned',
        message: `Subagent ${taskType} spawned successfully`,
        pid: child.pid
      };

    } catch (error) {
      logger.error(`Failed to spawn subagent: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse progress indicators from subagent output
   * @param {string} output - Output text from subagent
   * @param {string} subagentId - Subagent ID
   */
  parseProgress(output, subagentId) {
    const subagent = this.activeSubagents.get(subagentId);
    if (!subagent) return;

    // Look for progress patterns in output
    const progressMatch = output.match(/Progress:\s*(\d+)%/i);
    if (progressMatch) {
      const progress = parseInt(progressMatch[1], 10);
      if (!isNaN(progress) && progress >= 0 && progress <= 100) {
        subagent.progress = progress;

        this.emitToWebsocket(subagentId, {
          type: 'progress-update',
          subagentId,
          progress,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Look for phase changes
    const phaseMatch = output.match(/Phase\s+(\d+):\s+([^:\n]+)/i);
    if (phaseMatch) {
      const phaseNum = parseInt(phaseMatch[1], 10);
      const phaseName = phaseMatch[2].trim();

      if (!isNaN(phaseNum)) {
        subagent.currentPhase = { num: phaseNum, name: phaseName };

        this.emitToWebsocket(subagentId, {
          type: 'phase-change',
          subagentId,
          phase: subagent.currentPhase,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Start monitoring system metrics for a subagent
   * @param {string} subagentId - Subagent ID
   * @param {Object} process - Child process object
   */
  startMetricsMonitoring(subagentId, process) {
    const subagent = this.activeSubagents.get(subagentId);
    if (!subagent) return;

    // Simple metrics collection (in production, use more sophisticated monitoring)
    const metricsInterval = setInterval(async () => {
      try {
        if (!this.activeSubagents.has(subagentId)) {
          clearInterval(metricsInterval);
          return;
        }

        // Get process metrics (platform-specific)
        // This is a simplified version - production would use psutil or similar
        subagent.metrics = {
          cpuUsage: Math.random() * 100, // Placeholder
          memoryUsage: Math.random() * 500, // Placeholder MB
          diskUsage: 0 // Would calculate actual disk usage
        };

        // Emit metrics update
        this.emitToWebsocket(subagentId, {
          type: 'metrics-update',
          subagentId,
          metrics: subagent.metrics,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.debug(`Metrics monitoring error for ${subagentId}: ${error.message}`);
        // Continue monitoring despite errors
      }
    }, 5000); // Update every 5 seconds

    // Store interval ID for cleanup
    subagent.metricsInterval = metricsInterval;
  }

  /**
   * Emit message to WebSocket clients
   * @param {string} subagentId - Subagent ID
   * @param {Object} data - Data to emit
   */
  emitToWebsocket(subagentId, data) {
    if (!this.websocketServer) return;

    const message = {
      type: 'subagent-event',
      subagentId,
      ...data,
      timestamp: new Date().toISOString()
    };

    // Broadcast to all connected clients
    // In production, you might want to filter by jobId or user
    if (this.websocketServer.clients) {
      this.websocketServer.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(JSON.stringify(message));
          } catch (error) {
            logger.debug(`WebSocket send error: ${error.message}`);
          }
        }
      });
    }
  }

  /**
   * Get status of a subagent
   * @param {string} subagentId - The subagent ID
   * @returns {Object|null} Subagent info or null if not found
   */
  getSubagentStatus(subagentId) {
    return this.activeSubagents.get(subagentId) || null;
  }

  /**
   * List all active subagents
   * @returns {Array} Array of subagent info
   */
  listActiveSubagents() {
    return Array.from(this.activeSubagents.entries()).map(([id, info]) => ({
      subagentId: id,
      type: info.type,
      jobId: info.jobId,
      planId: info.planId,
      status: info.status,
      progress: info.progress || 0,
      currentPhase: info.currentPhase || null,
      startedAt: info.startedAt,
      duration: info.finishedAt ? (info.finishedAt - info.startedAt) : (Date.now() - info.startedAt),
      logsCount: info.logs.length
    }));
  }

  /**
   * Get logs for a subagent
   * @param {string} subagentId - The subagent ID
   * @param {number} limit - Maximum number of logs to return
   * @returns {Array} Array of log entries
   */
  getSubagentLogs(subagentId, limit = 100) {
    const subagent = this.activeSubagents.get(subagentId);
    if (!subagent) return [];

    const startIndex = Math.max(0, subagent.logs.length - limit);
    return subagent.logs.slice(startIndex);
  }

  /**
   * Terminate a subagent
   * @param {string} subagentId - The subagent ID to terminate
   * @returns {boolean} True if terminated, false if not found
   */
  terminateSubagent(subagentId) {
    const subagent = this.activeSubagents.get(subagentId);
    if (!subagent || !subagent.process) return false;

    try {
      // Clear metrics interval if exists
      if (subagent.metricsInterval) {
        clearInterval(subagent.metricsInterval);
      }

      // Kill the process
      subagent.process.kill();

      // Update status
      subagent.status = 'terminated';
      subagent.finishedAt = Date.now();

      // Emit termination event
      this.emitToWebsocket(subagentId, {
        type: 'subagent-terminated',
        subagentId,
        timestamp: new Date().toISOString()
      });

      // Remove from active list after delay
      setTimeout(() => {
        this.activeSubagents.delete(subagentId);
      }, 5000);

      logger.info(`Terminated subagent ${subagentId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to terminate subagent ${subagentId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Terminate all subagents for a job
   * @param {string} jobId - The job ID
   * @returns {number} Number of subagents terminated
   */
  terminateSubagentsByJob(jobId) {
    let terminated = 0;
    for (const [subagentId, subagent] of this.activeSubagents) {
      if (subagent.jobId === jobId) {
        if (this.terminateSubagent(subagentId)) {
          terminated++;
        }
      }
    }
    logger.info(`Terminated ${terminated} subagents for job ${jobId}`);
    return terminated;
  }
}

// Export singleton instance factory
export const createSubagentManager = (websocketServer) => {
  return new SubagentManager(websocketServer);
};

// Export class for direct instantiation
export { SubagentManager };
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

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
    new winston.transports.File({ filename: 'logs/bob-orchestrator.log' })
  ]
});

class ShellExecutor {
  constructor() {
    this.activeProcesses = new Map(); // processId => { process, jobId, type }
  }

  /**
   * Execute a Bob CLI command
   * @param {string} command - The Bob command to execute (e.g., 'bob run plan')
   * @param {Object} options - Execution options
   * @param {string} options.jobId - Associated job ID
   * @param {string} options.type - Type of operation (plan, transform, test)
   * @param {string} options.workingDir - Working directory for the command
   * @param {number} options.timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Promise with processId and initial info
   */
  async executeBobCommand(command, options = {}) {
    const { jobId, type, workingDir = process.cwd(), timeout = 300000 } = options;
    const processId = uuidv4();

    logger.info(`Executing Bob command: ${command} (Process: ${processId}, Job: ${jobId})`);

    try {
      // Ensure working directory exists
      await fs.mkdir(workingDir, { recursive: true });

      // Split command into parts for spawning
      const [cmd, ...args] = command.split(' ');

      // Spawn the process
      const child = spawn(cmd, args, {
        cwd: workingDir,
        env: {
          ...process.env,
          BOB_JOB_ID: jobId || '',
          NODE_ENV: process.env.NODE_ENV || 'development'
        }
      });

      // Store process info
      this.activeProcesses.set(processId, {
        process: child,
        jobId,
        type,
        startedAt: Date.now(),
        command
      });

      // Initialize output buffers
      let stdout = '';
      let stderr = '';

      // Handle stdout
      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        logger.debug(`[${processId}] STDOUT: ${output.trim()}`);

        // Emit via WebSocket would happen here in real implementation
        // this.emitOutput(processId, { type: 'stdout', data: output });
      });

      // Handle stderr
      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        logger.warn(`[${processId}] STDERR: ${output.trim()}`);

        // Emit via WebSocket would happen here
        // this.emitOutput(processId, { type: 'stderr', data: output });
      });

      // Handle close/exit
      const waitForExit = new Promise((resolve, reject) => {
        child.on('close', (code) => {
          const result = {
            processId,
            jobId,
            type,
            command,
            exitCode: code,
            stdout,
            stderr,
            duration: Date.now() - this.activeProcesses.get(processId).startedAt,
            timestamp: new Date().toISOString()
          };

          // Clean up
          this.activeProcesses.delete(processId);

          if (code === 0) {
            logger.info(`Bob command completed successfully: ${command} (Process: ${processId})`);
            resolve({ success: true, ...result });
          } else {
            logger.error(`Bob command failed with code ${code}: ${command} (Process: ${processId})`);
            resolve({ success: false, error: `Process exited with code ${code}`, ...result });
          }
        });

        child.on('error', (err) => {
          logger.error(`Bob process error: ${err.message} (Process: ${processId})`);

          // Clean up
          this.activeProcesses.delete(processId);

          reject({
            processId,
            jobId,
            type,
            command,
            error: err.message,
            timestamp: new Date().toISOString()
          });
        });
      });

      // Handle timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          if (this.activeProcesses.has(processId)) {
            const processInfo = this.activeProcesses.get(processId);
            processInfo.process.kill();
            this.activeProcesses.delete(processId);

            logger.error(`Bob command timed out after ${timeout}ms: ${command} (Process: ${processId})`);
            reject({
              processId,
              jobId,
              type,
              command,
              error: `Command timed out after ${timeout}ms`,
              timestamp: new Date().toISOString()
            });
          }
        }, timeout);
      });

      // Wait for either exit or timeout
      const result = await Promise.race([waitForExit, timeoutPromise]);
      return result;

    } catch (error) {
      logger.error(`Failed to execute Bob command: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get status of an active process
   * @param {string} processId - The process ID
   * @returns {Object|null} Process info or null if not found
   */
  getProcessStatus(processId) {
    return this.activeProcesses.get(processId) || null;
  }

  /**
   * List all active processes
   * @returns {Array} Array of active process info
   */
  listActiveProcesses() {
    return Array.from(this.activeProcesses.entries()).map(([id, info]) => ({
      processId: id,
      jobId: info.jobId,
      type: info.type,
      command: info.command,
      startedAt: info.startedAt,
      duration: Date.now() - info.startedAt
    }));
  }

  /**
   * Kill a running process
   * @param {string} processId - The process ID to kill
   * @returns {boolean} True if process was killed, false if not found
   */
  killProcess(processId) {
    const processInfo = this.activeProcesses.get(processId);
    if (processInfo && processInfo.process) {
      try {
        processInfo.process.kill();
        this.activeProcesses.delete(processId);
        logger.info(`Killed process ${processId}`);
        return true;
      } catch (error) {
        logger.error(`Failed to kill process ${processId}: ${error.message}`);
        return false;
      }
    }
    return false;
  }

  /**
   * Kill all active processes
   * @returns {number} Number of processes killed
   */
  killAllProcesses() {
    let killed = 0;
    for (const [processId, info] of this.activeProcesses) {
      try {
        info.process.kill();
        killed++;
      } catch (error) {
        logger.error(`Failed to kill process ${processId}: ${error.message}`);
      }
    }
    this.activeProcesses.clear();
    logger.info(`Killed ${killed} processes`);
    return killed;
  }
}

// Export singleton instance
export const shellExecutor = new ShellExecutor();

// Export class for potential multiple instances
export { ShellExecutor };
import express from 'express';
const router = express.Router();
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { io } from '../../../server.js';

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
    new winston.transports.File({ filename: 'logs/transform.log' })
  ]
});

// Transform legacy code to microservices
router.post('/', async (req, res) => {
  try {
    const { planId, jobId, options } = req.body;

    if (!planId || !jobId) {
      return res.status(400).json({ error: 'Plan ID and Job ID are required' });
    }

    const planPath = `./plans/${planId}.json`; // Note: we changed plan storage format in plan route
    const extractDir = `./uploads/${jobId}`;
    const outputDir = `./modernized-output/${jobId}`;

    // Verify plan and source exist
    try {
      await fs.access(planPath);
      await fs.access(extractDir);
    } catch (err) {
      return res.status(404).json({ error: 'Plan or source code not found' });
    }

    logger.info(`Starting transformation for job ${jobId} using plan ${planId}`);

    // Emit job status update
    io.emit('job-status-update', { jobId, status: 'transforming', timestamp: new Date().toISOString() });

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Prepare Bob CLI command
    const bobCommand = 'bob';
    const args = [
      'transform',
      '--plan',
      planPath,
      '--source',
      extractDir,
      '--output',
      outputDir,
      '--job-id',
      jobId
    ];

    // Set environment variables including API key
    const env = {
      ...process.env,
      BOB_API_KEY: process.env.BOB_API_KEY || '',
      NODE_ENV: process.env.NODE_ENV || 'development'
    };

    // Validate API key presence
    if (!env.BOB_API_KEY) {
      logger.warn('BOB_API_KEY not set in environment');
    }

    logger.info(`Spawning Bob transform command: ${bobCommand} ${args.join(' ')}`);

    // Generate transformation ID
    const transformationId = `transform-${uuidv4()}`;

    // Emit terminal log for command start
    io.emit('terminal-log', {
      jobId,
      text: `Starting transformation: bob transform --plan ${planPath} --source ${extractDir} --output ${outputDir}`,
      timestamp: new Date().toISOString()
    });

    // Spawn the Bob process
    const bobProcess = spawn(bobCommand, args, { env });

    let stdout = '';
    let stderr = '';

    // Handle stdout
    bobProcess.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      logger.debug(`Bob transform stdout: ${text}`);
      // Emit terminal log
      io.emit('terminal-log', { jobId, text, timestamp: new Date().toISOString() });
    });

    // Handle stderr
    bobProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logger.warn(`Bob transform stderr: ${text}`);
      // Emit terminal log as error
      io.emit('terminal-log', { jobId, text: `[STDERR] ${text}`, timestamp: new Date().toISOString(), type: 'error' });
    });

    // Handle close
    bobProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Bob transform completed successfully for job ${jobId}`);
        // Emit completion log
        io.emit('terminal-log', { jobId, text: `Transformation completed successfully`, timestamp: new Date().toISOString() });
        // Emit job status update
        io.emit('job-status-update', { jobId, status: 'transformed', timestamp: new Date().toISOString() });

        // Check what was generated
        fs.readdir(outputDir)
          .then((files) => {
            res.status(200).json({
              message: 'Transformation completed successfully',
              transformationId,
              jobId,
              planId,
              outputDir,
              generatedFiles: files,
              nextSteps: [
                `POST /api/v1/test - Run validation tests on generated code`
              ]
            });
          })
          .catch((readErr) => {
            logger.error(`Failed to read output directory: ${readErr.message}`);
            res.status(200).json({
              message: 'Transformation completed but could not read output directory',
              transformationId,
              jobId,
              planId,
              outputDir,
              nextSteps: [
                `POST /api/v1/test - Run validation tests on generated code`
              ]
            });
          });
      } else {
        logger.error(`Bob transform failed with code ${code}: ${stderr}`);
        io.emit('terminal-log', { jobId, text: `Transformation failed with code ${code}: ${stderr}`, timestamp: new Date().toISOString(), type: 'error' });
        io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
        res.status(500).json({
          error: 'Transformation failed',
          details: stderr
        });
      }
    });

    // Handle process errors
    bobProcess.on('error', (err) => {
      logger.error(`Failed to start Bob transform process: ${err}`);
      io.emit('terminal-log', { jobId, text: `Failed to start Bob transform process: ${err}`, timestamp: new Date().toISOString(), type: 'error' });
      io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
      res.status(500).json({ error: 'Internal server error' });
    });

  } catch (error) {
    logger.error(`Transformation error: ${error.message}`);
    io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get transformation status
router.get('/:transformationId/status', async (req, res) => {
  try {
    const { transformationId } = req.params;
    // Note: we are not using transformationId in this implementation; we rely on jobId.
    // For simplicity, we'll check if there is any modernized output for recent jobs.
    // In a real implementation, we would track transformationId to jobId mapping.
    // We'll return a placeholder response indicating the endpoint needs implementation.
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Transformation status tracking not yet implemented',
      note: 'In a real implementation, this would check the status of a specific transformation'
    });
  } catch (error) {
    logger.error(`Get transformation status error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
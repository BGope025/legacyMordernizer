import express from 'express';
const router = express.Router();
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import winston from 'winston';
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
    new winston.transports.File({ filename: 'logs/plan.log' })
  ]
});

// Generate modernization plan
router.post('/', async (req, res) => {
  try {
    const { jobId, sourcePath } = req.body;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const extractDir = sourcePath || `./uploads/${jobId}`;

    // Verify source exists
    try {
      await fs.access(extractDir);
    } catch (err) {
      return res.status(404).json({ error: 'Source code not found' });
    }

    logger.info(`Generating modernization plan for job ${jobId}`);

    // Emit job status update
    io.emit('job-status-update', { jobId, status: 'planning', timestamp: new Date().toISOString() });

    // Generate plan ID
    const planId = `plan-${Date.now()}-${jobId}`;
    const planPath = `./plans/${planId}.json`;

    // Ensure plans directory exists
    await fs.mkdir('./plans', { recursive: true });

    // Prepare Bob CLI command
    const bobCommand = 'bob';
    const args = [
      'plan',
      '--source',
      extractDir,
      '--output',
      planPath,
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
      // We'll still proceed but CLI may fail
    }

    logger.info(`Spawning Bob plan command: ${bobCommand} ${args.join(' ')}`);

    // Emit terminal log for command start
    io.emit('terminal-log', {
      jobId,
      text: `Starting plan generation: bob plan --source ${extractDir} --output ${planPath}`,
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
      logger.debug(`Bob plan stdout: ${text}`);
      // Emit terminal log
      io.emit('terminal-log', { jobId, text, timestamp: new Date().toISOString() });
    });

    // Handle stderr
    bobProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      logger.warn(`Bob plan stderr: ${text}`);
      // Emit terminal log as error
      io.emit('terminal-log', { jobId, text: `[STDERR] ${text}`, timestamp: new Date().toISOString(), type: 'error' });
    });

    // Handle close
    bobProcess.on('close', (code) => {
      if (code === 0) {
        logger.info(`Bob plan completed successfully for job ${jobId}`);
        // Emit completion log
        io.emit('terminal-log', { jobId, text: `Plan generation completed successfully`, timestamp: new Date().toISOString() });
        // Emit job status update
        io.emit('job-status-update', { jobId, status: 'plan-generated', planId, timestamp: new Date().toISOString() });

        // Read the generated plan file to send in response (optional)
        fs.readFile(planPath, 'utf8')
          .then((planData) => {
            let planJson;
            try {
              planJson = JSON.parse(planData);
            } catch (parseErr) {
              logger.warn(`Failed to parse plan file as JSON, sending raw text`);
              planJson = { raw: planData };
            }
            res.status(200).json({
              planId,
              jobId,
              message: 'Modernization plan generated successfully',
              plan: planJson,
              nextSteps: [
                `POST /api/v1/transform - Start transformation with this plan`,
                `GET /api/v1/plan/${planId} - Retrieve plan details`
              ]
            });
          })
          .catch((readErr) => {
            logger.error(`Failed to read plan file: ${readErr.message}`);
            // Fallback to mock response if file read fails
            res.status(200).json({
              planId,
              jobId,
              message: 'Modernization plan generated successfully (file read error)',
              plan: { note: 'Plan generated but could not be read from storage' },
              nextSteps: [
                `POST /api/v1/transform - Start transformation with this plan`,
                `GET /api/v1/plan/${planId} - Retrieve plan details`
              ]
            });
          });
      } else {
        logger.error(`Bob plan failed with code ${code}: ${stderr}`);
        io.emit('terminal-log', { jobId, text: `Plan generation failed with code ${code}: ${stderr}`, timestamp: new Date().toISOString(), type: 'error' });
        io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
        res.status(500).json({
          error: 'Plan generation failed',
          details: stderr
        });
      }
    });

    // Handle process errors
    bobProcess.on('error', (err) => {
      logger.error(`Failed to start Bob plan process: ${err}`);
      io.emit('terminal-log', { jobId, text: `Failed to start Bob plan process: ${err}`, timestamp: new Date().toISOString(), type: 'error' });
      io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
      res.status(500).json({ error: 'Internal server error' });
    });

  } catch (error) {
    logger.error(`Plan generation error: ${error.message}`);
    io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get plan details
router.get('/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    // Look for plan file (we stored as ./plans/${planId}.json)
    const planPath = `./plans/${planId}.json`;
    try {
      await fs.access(planPath);
      const planData = await fs.readFile(planPath, 'utf8');
      let planJson;
      try {
        planJson = JSON.parse(planData);
      } catch (parseErr) {
        // If not JSON, send as text
        planJson = { raw: planData };
      }
      res.json({
        planId,
        message: 'Plan details retrieved',
        plan: planJson
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Plan not found' });
      } else {
        throw err;
      }
    }
  } catch (error) {
    logger.error(`Get plan error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
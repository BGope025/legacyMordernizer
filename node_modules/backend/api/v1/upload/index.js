import express from 'express';
const router = express.Router();
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { io } from '../../../server.js';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = './uploads';
    // Ensure upload directory exists
    fs.mkdir(uploadDir, { recursive: true })
      .then(() => cb(null, uploadDir))
      .catch(cb);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' ||
        file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});

// Logger
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
    new winston.transports.File({ filename: 'logs/upload.log' })
  ]
});

// Handle file upload
router.post('/', upload.single('legacyCode'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const originalName = req.file.originalname;
    const jobId = uuidv4();

    logger.info(`File uploaded: ${originalName} (Job ID: ${jobId})`);

    // Emit job started event
    io.emit('job-status-update', { jobId, status: 'uploading', timestamp: new Date().toISOString() });

    // Extract the ZIP file using adm-zip (cross-platform)
    const extractDir = `./uploads/${jobId}`;
    await fs.mkdir(extractDir, { recursive: true });

    const zip = new AdmZip(filePath);
    zip.extractAllTo(extractDir, true);

    const entryNames = zip.getEntries().map(e => e.entryName);
    logger.info(`File extracted successfully to ${extractDir}`);
    io.emit('terminal-log', { jobId, text: `Extraction completed successfully to ${extractDir}`, timestamp: new Date().toISOString() });
    io.emit('job-status-update', { jobId, status: 'extracted', timestamp: new Date().toISOString() });
    res.status(202).json({
      jobId,
      message: 'File uploaded and extraction completed',
      status: 'extracted',
      nextSteps: [
        `POST /api/v1/plan - Generate modernization plan`,
        `GET /api/v1/upload/${jobId}/status - Check extraction status`
      ]
    });

  } catch (error) {
    logger.error(`Upload error: ${error.message}`);
    io.emit('job-status-update', { jobId, status: 'failed', timestamp: new Date().toISOString() });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get upload status
router.get('/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params;
    const extractDir = `./uploads/${jobId}`;

    try {
      await fs.access(extractDir);
      const files = await fs.readdir(extractDir);

      res.json({
        jobId,
        status: 'extracted',
        fileCount: files.length,
        extractPath: extractDir,
        nextStep: 'POST /api/v1/plan to generate modernization plan'
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Job not found' });
      } else {
        throw err;
      }
    }
  } catch (error) {
    logger.error(`Status check error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
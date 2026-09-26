import express from 'express';
const router = express.Router();
import fs from 'fs/promises';
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
    new winston.transports.File({ filename: 'logs/test.log' })
  ]
});

// Get test report
router.get('/:testRunId/report', async (req, res) => {
  try {
    const { testRunId } = req.params;
    const testReportPath = `./test-reports/${testRunId}.json`;

    try {
      await fs.access(testReportPath);
      const reportData = await fs.readFile(testReportPath, 'utf8');
      let reportJson;
      try {
        reportJson = JSON.parse(reportData);
      } catch (parseErr) {
        // If not JSON, send as text
        reportJson = { raw: reportData };
      }
      res.json({
        testRunId,
        message: 'Test report retrieved',
        report: reportJson
      });
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'Test report not found' });
      } else {
        throw err;
      }
    }
  } catch (error) {
    logger.error(`Get test report error: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
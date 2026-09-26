import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();

// Middleware configuration
app.use(express.json({ limit: '50mb', type: 'application/json' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'IBM Bob 2.0 Modernization Pipeline Backend',
    version: '1.0.0'
  });
});

// API routes
import uploadRouter from './api/v1/upload/index.js';
import planRouter from './api/v1/plan/index.js';
import transformRouter from './api/v1/transform/index.js';
import testRouter from './api/v1/test/index.js';
app.use('/api/v1/upload', uploadRouter);
app.use('/api/v1/plan', planRouter);
app.use('/api/v1/transform', transformRouter);
app.use('/api/v1/test', testRouter);

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global Error Handler:', err);

  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal Server Error' : err.message,
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

export default app;
import { Server } from 'socket.io';
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
    new winston.transports.File({ filename: 'logs/websocket.log' })
  ]
});

class WebSocketServer {
  constructor(httpServer, options = {}) {
    this.io = new Server(httpServer, {
      cors: {
        origin: [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5500',
          'http://localhost:5500',
          'http://localhost:3001' // Additional ports for development
        ],
        methods: ['GET', 'POST'],
        credentials: true
      },
      ...options
    });

    this.connectedClients = new Map(); // socketId => clientInfo
    this.jobRooms = new Map(); // jobId => Set of socketIds
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      const clientId = uuidv4();
      const clientInfo = {
        id: clientId,
        socketId: socket.id,
        connectedAt: new Date(),
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        jobs: new Set() // Jobs this client is subscribed to
      };

      this.connectedClients.set(socket.id, clientInfo);
      logger.info(`Client connected: ${clientId} (${socket.id}) from ${clientInfo.ip}`);

      // Send welcome message
      socket.emit('welcome', {
        message: 'Connected to IBM Bob 2.0 Modernization Pipeline',
        clientId,
        timestamp: new Date().toISOString()
      });

      // Handle client subscriptions
      socket.on('subscribe-job', (data) => {
        const { jobId } = data;
        if (!jobId) {
          socket.emit('error', { message: 'Job ID is required for subscription' });
          return;
        }

        // Join the job room
        socket.join(`job-${jobId}`);

        // Update client info
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
          clientInfo.jobs.add(jobId);
        }

        // Update job rooms tracking
        if (!this.jobRooms.has(jobId)) {
          this.jobRooms.set(jobId, new Set());
        }
        this.jobRooms.get(jobId).add(socket.id);

        logger.info(`Client ${clientId} subscribed to job ${jobId}`);

        socket.emit('job-subscribed', { jobId, timestamp: new Date().toISOString() });
      });

      socket.on('unsubscribe-job', (data) => {
        const { jobId } = data;
        if (!jobId) {
          socket.emit('error', { message: 'Job ID is required' });
          return;
        }

        // Leave the job room
        socket.leave(`job-${jobId}`);

        // Update client info
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
          clientInfo.jobs.delete(jobId);
        }

        // Update job rooms tracking
        if (this.jobRooms.has(jobId)) {
          this.jobRooms.get(jobId).delete(socket.id);
          // Clean up empty sets
          if (this.jobRooms.get(jobId).size === 0) {
            this.jobRooms.delete(jobId);
          }
        }

        logger.info(`Client ${clientId} unsubscribed from job ${jobId}`);

        socket.emit('job-unsubscribed', { jobId, timestamp: new Date().toISOString() });
      });

      // Handle ping/pong for connection health
      socket.on('ping', (data) => {
        socket.emit('pong', {
          timestamp: new Date().toISOString(),
          ...data
        });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        const clientInfo = this.connectedClients.get(socket.id);
        if (clientInfo) {
          logger.info(`Client disconnected: ${clientInfo.id} (${socket.id}) - Reason: ${reason}`);

          // Clean up job subscriptions
          clientInfo.jobs.forEach(jobId => {
            if (this.jobRooms.has(jobId)) {
              this.jobRooms.get(jobId).delete(socket.id);
              if (this.jobRooms.get(jobId).size === 0) {
                this.jobRooms.delete(jobId);
              }
            }
          });

          this.connectedClients.delete(socket.id);
        } else {
          logger.info(`Unknown client disconnected: ${socket.id} - Reason: ${reason}`);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error(`Socket error: ${error}`);
      });
    });

    logger.info('WebSocket server initialized');
  }

  /**
   * Emit event to all clients subscribed to a specific job
   * @param {string} jobId - The job ID
   * @param {string} event - The event name
   * @param {Object} data - The data to emit
   */
  emitToJob(jobId, event, data) {
    const room = `job-${jobId}`;
    const payload = {
      ...data,
      timestamp: new Date().toISOString(),
      jobId
    };

    this.io.to(room).emit(event, payload);
    logger.debug(`Emitted ${event} to job ${jobId} room`);
  }

  /**
   * Emit event to all connected clients
   * @param {string} event - The event name
   * @param {Object} data - The data to emit
   */
  emitToAll(event, data) {
    const payload = {
      ...data,
      timestamp: new Date().toISOString()
    };

    this.io.emit(event, payload);
    logger.debug(`Emitted ${event} to all clients`);
  }

  /**
   * Emit event to a specific client
   * @param {string} socketId - The socket ID
   * @param {string} event - The event name
   * @param {Object} data - The data to emit
   */
  emitToClient(socketId, event, data) {
    const socket = this.io.of('/').sockets.get(socketId);
    if (socket) {
      const payload = {
        ...data,
        timestamp: new Date().toISOString()
      };

      socket.emit(event, payload);
      logger.debug(`Emitted ${event} to client ${socketId}`);
    } else {
      logger.warn(`Attempted to emit to non-existent socket: ${socketId}`);
    }
  }

  /**
   * Get number of connected clients
   * @returns {number} Number of connected clients
   */
  getClientCount() {
    return this.connectedClients.size;
  }

  /**
   * Get number of clients subscribed to a job
   * @param {string} jobId - The job ID
   * @returns {number} Number of subscribed clients
   */
  getJobSubscriberCount(jobId) {
    const room = `job-${jobId}`;
    return this.io.of('/').adapter.rooms.get(room)?.size || 0;
  }

  /**
   * Get list of connected clients
   * @returns {Array} Array of client information
   */
  getConnectedClients() {
    return Array.from(this.connectedClients.entries()).map(([socketId, info]) => ({
      socketId,
      clientId: info.id,
      connectedAt: info.connectedAt,
      ip: info.ip,
      jobs: Array.from(info.jobs),
      userAgent: info.userAgent.substring(0, 100) // Limit length
    }));
  }

  /**
   * Get list of jobs with subscriber counts
   * @returns {Array} Array of job information
   */
  getJobSubscriptions() {
    return Array.from(this.jobRooms.entries()).map(([jobId, sockets]) => ({
      jobId,
      subscriberCount: sockets.size
    }));
  }

  /**
   * Close all connections and shut down
   */
  close() {
    logger.info('Closing WebSocket server');

    // Disconnect all clients
    this.connectedClients.forEach((clientInfo, socketId) => {
      const socket = this.io.of('/').sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    });

    this.connectedClients.clear();
    this.jobRooms.clear();

    // Close the Socket.IO server
    this.io.close();
  }
}

// Export for use in server setup
export const createWebSocketServer = (httpServer, options = {}) => {
  return new WebSocketServer(httpServer, options);
};

// Export class for direct instantiation
export { WebSocketServer };
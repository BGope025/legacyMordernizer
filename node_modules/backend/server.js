import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io with CORS configuration
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5500',
      'http://localhost:5500'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Socket connected: ${socket.id}`);

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Socket disconnected: ${socket.id} - Reason: ${reason}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error: ${error}`);
  });
});

// Start server
const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io initialized with CORS for frontend testing`);
});

// Export for use in other modules
export { app, io, server };
export default server;

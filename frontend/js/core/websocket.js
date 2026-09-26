// Socket.io Manager for Streaming Bob's Terminal Logs
class WebSocketManager {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000; // 3 seconds
        this.eventListeners = new Map();
    }

    connect(url = '') {
        const wsUrl = url || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;

        try {
            this.socket = io(wsUrl, {
                transports: ['websocket'],
                reconnectionAttempts: this.maxReconnectAttempts,
                reconnectionDelay: this.reconnectDelay
            });

            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.handleConnectionError();
        }
    }

    setupEventHandlers() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('WebSocket connected');
            this.emitEvent('connect');
        });

        this.socket.on('disconnect', (reason) => {
            this.isConnected = false;
            console.log(`WebSocket disconnected: ${reason}`);
            this.emitEvent('disconnect', reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket connection error:', error);
            this.emitEvent('connect_error', error);
            this.handleConnectionError();
        });

        // Subagent status events
        this.socket.on('subagent-spawned', (data) => {
            this.emitEvent('subagent-spawned', data);
        });

        this.socket.on('subagent-completed', (data) => {
            this.emitEvent('subagent-completed', data);
        });

        this.socket.on('subagent-failed', (data) => {
            this.emitEvent('subagent-failed', data);
        });

        // Terminal log streaming
        this.socket.on('terminal-log', (data) => {
            this.emitEvent('terminal-log', data);
        });

        // Progress updates
        this.socket.on('progress-update', (data) => {
            this.emitEvent('progress-update', data);
        });

        // Completion events
        this.socket.on('modernization-complete', (data) => {
            this.emitEvent('modernization-complete', data);
        });

        this.socket.on('modernization-failed', (data) => {
            this.emitEvent('modernization-failed', data);
        });
    }

    handleConnectionError() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`Reconnecting... Attempt ${this.reconnectAttempts}`);
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        } else {
            this.emitEvent('max-reconnect-attempts-reached');
        }
    }

    // Event subscription
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.eventListeners.get(event) || [];
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        };
    }

    emitEvent(event, data) {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.isConnected = false;
        }
    }
}

// Export singleton instance
export const wsManager = new WebSocketManager();

// Auto-connect when module is loaded (optional)
// wsManager.connect();

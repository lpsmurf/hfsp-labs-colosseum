/**
 * WebSocket Client for Real-Time Provisioning Updates
 */
export class WebSocketClient {
    constructor(url, token, tenantId) {
        Object.defineProperty(this, "ws", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "url", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "token", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tenantId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "reconnectAttempts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "maxReconnectAttempts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 5
        });
        Object.defineProperty(this, "reconnectDelay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 1000
        });
        Object.defineProperty(this, "eventListeners", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "connectionCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "disconnectionCallbacks", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        Object.defineProperty(this, "messageQueue", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "isConnecting", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "heartbeatInterval", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        this.url = url;
        this.token = token;
        this.tenantId = tenantId;
    }
    /**
     * Connect to the WebSocket server
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }
            if (this.isConnecting) {
                reject(new Error('Connection already in progress'));
                return;
            }
            this.isConnecting = true;
            try {
                const wsUrl = `${this.url}?token=${encodeURIComponent(this.token)}&tenant_id=${this.tenantId}`;
                this.ws = new WebSocket(wsUrl);
                this.ws.onopen = () => {
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.reconnectDelay = 1000;
                    // Flush queued messages
                    while (this.messageQueue.length > 0) {
                        const msg = this.messageQueue.shift();
                        if (msg) {
                            this.ws?.send(msg);
                        }
                    }
                    // Start heartbeat
                    this.startHeartbeat();
                    // Notify connection callbacks
                    this.connectionCallbacks.forEach((cb) => cb());
                    resolve();
                };
                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    }
                    catch (error) {
                        console.error('Failed to parse WebSocket message:', error);
                    }
                };
                this.ws.onerror = (error) => {
                    this.isConnecting = false;
                    console.error('WebSocket error:', error);
                    reject(error);
                };
                this.ws.onclose = () => {
                    this.isConnecting = false;
                    this.stopHeartbeat();
                    this.disconnectionCallbacks.forEach((cb) => cb());
                    // Attempt to reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                        setTimeout(() => {
                            this.connect().catch((error) => console.error('Reconnection failed:', error));
                        }, delay);
                    }
                };
            }
            catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    /**
     * Send a message to the server
     */
    send(message) {
        const data = JSON.stringify(message);
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
        else {
            // Queue message if not connected
            this.messageQueue.push(data);
            // Try to reconnect if disconnected
            if (!this.isConnecting) {
                this.connect().catch((error) => console.error('Auto-reconnect failed:', error));
            }
        }
    }
    /**
     * Listen for a specific message type
     */
    on(eventType, callback) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, new Set());
        }
        this.eventListeners.get(eventType).add(callback);
        // Return unsubscribe function
        return () => {
            this.eventListeners.get(eventType)?.delete(callback);
        };
    }
    /**
     * Listen for connection
     */
    onConnect(callback) {
        this.connectionCallbacks.add(callback);
        return () => this.connectionCallbacks.delete(callback);
    }
    /**
     * Listen for disconnection
     */
    onDisconnect(callback) {
        this.disconnectionCallbacks.add(callback);
        return () => this.disconnectionCallbacks.delete(callback);
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
    /**
     * Handle incoming messages
     */
    handleMessage(message) {
        // Handle ping-pong
        if (message.type === 'ping') {
            this.send({
                type: 'pong',
                timestamp: new Date().toISOString(),
            });
            return;
        }
        // Emit to specific listeners
        const callbacks = this.eventListeners.get(message.type);
        if (callbacks) {
            callbacks.forEach((callback) => {
                try {
                    callback(message.data);
                }
                catch (error) {
                    console.error(`Error in ${message.type} handler:`, error);
                }
            });
        }
        // Also emit to 'message' listeners with full message
        const genericCallbacks = this.eventListeners.get('message');
        if (genericCallbacks) {
            genericCallbacks.forEach((callback) => {
                try {
                    callback(message);
                }
                catch (error) {
                    console.error('Error in message handler:', error);
                }
            });
        }
    }
    /**
     * Start heartbeat to detect disconnections
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN) {
                this.send({
                    type: 'ping',
                    timestamp: new Date().toISOString(),
                });
            }
        }, 30000); // Every 30 seconds
    }
    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
}
export default WebSocketClient;

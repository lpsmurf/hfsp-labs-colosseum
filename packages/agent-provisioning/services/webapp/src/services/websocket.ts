/**
 * WebSocket Client for Real-Time Provisioning Updates
 */

import { WebSocketMessage } from '../types/api';

type EventCallback<T = any> = (data: T) => void;
type ConnectionCallback = () => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private tenantId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private eventListeners: Map<string, Set<EventCallback>> = new Map();
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private disconnectionCallbacks: Set<ConnectionCallback> = new Set();
  private messageQueue: string[] = [];
  private isConnecting = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(url: string, token: string, tenantId: string) {
    this.url = url;
    this.token = token;
    this.tenantId = tenantId;
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void> {
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
            const message = JSON.parse(event.data) as WebSocketMessage;
            this.handleMessage(message);
          } catch (error) {
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
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Send a message to the server
   */
  send(message: WebSocketMessage): void {
    const data = JSON.stringify(message);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
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
  on<T = any>(eventType: string, callback: EventCallback<T>): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    this.eventListeners.get(eventType)!.add(callback as EventCallback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(eventType)?.delete(callback as EventCallback);
    };
  }

  /**
   * Listen for connection
   */
  onConnect(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    return () => this.connectionCallbacks.delete(callback);
  }

  /**
   * Listen for disconnection
   */
  onDisconnect(callback: ConnectionCallback): () => void {
    this.disconnectionCallbacks.add(callback);
    return () => this.disconnectionCallbacks.delete(callback);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: WebSocketMessage): void {
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
        } catch (error) {
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
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      });
    }
  }

  /**
   * Start heartbeat to detect disconnections
   */
  private startHeartbeat(): void {
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
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default WebSocketClient;

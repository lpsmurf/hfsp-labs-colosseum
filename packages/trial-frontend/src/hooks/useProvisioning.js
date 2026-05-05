/**
 * React Hook for Real-Time Provisioning Status
 * Tracks provisioning progress via WebSocket
 */
import { useState, useCallback, useEffect } from 'react';
import { WebSocketClient } from '../services/websocket';
// Global WebSocket instance (shared across components)
let wsClient = null;
let wsSubscribers = new Map();
let wsConnected = false;
export function useProvisioning(token, tenantId) {
    const [provisioning, setProvisioning] = useState({});
    const [isConnected, setIsConnected] = useState(wsConnected);
    const [error, setError] = useState(null);
    // Initialize WebSocket on first mount with token
    useEffect(() => {
        if (!token || !tenantId)
            return;
        if (wsClient) {
            // Already initialized
            return;
        }
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${protocol}//${host}/api/provisioning`;
            wsClient = new WebSocketClient(wsUrl, token, tenantId);
            // Handle provisioning status updates
            wsClient.on('provisioning.status', (data) => {
                setProvisioning((prev) => ({
                    ...prev,
                    [data.agent_id]: data,
                }));
                // Notify subscribers for this agent
                const subscribers = wsSubscribers.get(data.agent_id);
                if (subscribers) {
                    subscribers.forEach((cb) => cb(data));
                }
            });
            wsClient.onConnect(() => {
                setIsConnected(true);
                wsConnected = true;
                setError(null);
            });
            wsClient.onDisconnect(() => {
                setIsConnected(false);
                wsConnected = false;
            });
            wsClient.connect().catch((err) => {
                const message = err instanceof Error ? err.message : 'WebSocket connection failed';
                setError(message);
            });
            return () => {
                // Don't disconnect on unmount - keep connection open for other components
                // Only cleanup if this is the last subscriber
            };
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'WebSocket initialization failed';
            setError(message);
        }
    }, [token, tenantId]);
    const getAgentProvisioning = useCallback((agentId) => {
        return provisioning[agentId];
    }, [provisioning]);
    const subscribe = useCallback((agentId) => {
        if (!wsSubscribers.has(agentId)) {
            wsSubscribers.set(agentId, new Set());
        }
    }, []);
    const unsubscribe = useCallback((agentId) => {
        wsSubscribers.delete(agentId);
    }, []);
    return {
        provisioning,
        getAgentProvisioning,
        subscribe,
        unsubscribe,
        isConnected,
        error,
    };
}
export function disconnectProvisioning() {
    if (wsClient) {
        wsClient.disconnect();
        wsClient = null;
        wsSubscribers.clear();
        wsConnected = false;
    }
}
export default useProvisioning;

import { useState, useCallback } from 'react';
import { agentAPI } from '../services/api';
export const useAgents = () => {
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const fetchAgents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await agentAPI.listAgents();
            setAgents(response.data.agents || []);
        }
        catch (err) {
            setError(err.response?.data?.error || 'Failed to load agents');
        }
        finally {
            setLoading(false);
        }
    }, []);
    const createAgent = useCallback(async (data) => {
        setLoading(true);
        setError(null);
        try {
            const response = await agentAPI.createAgent(data);
            setAgents(prev => [...prev, response.data.agent]);
            return response.data.agent;
        }
        catch (err) {
            const msg = err.response?.data?.error || 'Failed to create agent';
            setError(msg);
            throw err;
        }
        finally {
            setLoading(false);
        }
    }, []);
    return { agents, loading, error, fetchAgents, createAgent };
};

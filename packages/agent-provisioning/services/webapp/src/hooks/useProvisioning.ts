/**
 * Real-time provisioning hook
 * Subscribes to WebSocket events and overlays live status onto React Query cache
 */
import { useEffect } from 'react';
import { useQueryClient } from 'react-query';
import { useWebSocket } from './useWebSocket';
import { Agent, ProvisioningEvent } from '../types/agent';

interface Options {
  wsUrl: string | null;
  token: string | null;
}

export function useProvisioning({ wsUrl, token }: Options) {
  const queryClient = useQueryClient();
  const { connected, error, on } = useWebSocket(wsUrl, token);

  useEffect(() => {
    // Handle provisioning status updates
    const unsub = on('provisioning.status', (raw) => {
      const event = raw as ProvisioningEvent;
      if (!event?.agent_id) return;

      // Patch single-agent cache
      queryClient.setQueryData<Agent>(['agent', event.agent_id], (old) => {
        if (!old) return old;
        return { ...old, provisioning_status: event.status };
      });

      // Patch agent in list cache
      queryClient.setQueriesData<{ agents: Agent[]; total: number }>('agents', (old) => {
        if (!old) return old;
        return {
          ...old,
          agents: old.agents.map((a) =>
            a.id === event.agent_id ? { ...a, provisioning_status: event.status } : a
          ),
        };
      });

      // When fully active, refresh to get complete data
      if (event.status === 'active' || event.status === 'failed') {
        queryClient.invalidateQueries(['agent', event.agent_id]);
        queryClient.invalidateQueries('agents');
      }
    });

    // Handle agent.updated events
    const unsubUpdated = on('agent.updated', (raw) => {
      const agent = raw as Agent;
      if (!agent?.id) return;
      queryClient.setQueryData(['agent', agent.id], agent);
      queryClient.invalidateQueries('agents');
    });

    return () => {
      unsub();
      unsubUpdated();
    };
  }, [on, queryClient]);

  return { connected, error };
}

export default useProvisioning;

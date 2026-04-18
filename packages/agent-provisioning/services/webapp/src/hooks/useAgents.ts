/**
 * React Query hooks for Agent Management
 */

import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '../services/api';
import { AgentSetupPayload } from '../types/agent';

export function useAgents() {
  return useQuery(
    ['agents'],
    () => apiClient.getAgents(),
    { staleTime: 30000, cacheTime: 5 * 60 * 1000 }
  );
}

export function useAgent(id: string | null) {
  return useQuery(
    ['agent', id],
    () => (id ? apiClient.getAgent(id) : null),
    { enabled: !!id, staleTime: 5000 }
  );
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation(
    (payload: AgentSetupPayload) => apiClient.createAgent(payload),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('agents');
      },
    }
  );
}

export function useDeleteAgent(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation(
    () => apiClient.deleteAgent(agentId),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('agents');
        queryClient.removeQueries(['agent', agentId]);
      },
    }
  );
}

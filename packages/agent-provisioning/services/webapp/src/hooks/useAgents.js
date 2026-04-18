/**
 * React Hook for Agent Management
 * Uses React Query for data fetching and caching
 */
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '../services/api';
export function useAgents(page = 1, pageSize = 20) {
    return useQuery(['agents', page, pageSize], () => apiClient.getAgents(page, pageSize), {
        staleTime: 30000, // 30 seconds
        cacheTime: 5 * 60 * 1000, // 5 minutes
    });
}
export function useAgent(id) {
    return useQuery(['agent', id], () => (id ? apiClient.getAgent(id) : null), {
        enabled: !!id,
        staleTime: 30000,
    });
}
export function useCreateAgent() {
    const queryClient = useQueryClient();
    return useMutation((payload) => apiClient.createAgent(payload), {
        onSuccess: (newAgent) => {
            // Invalidate agents list to refetch
            queryClient.invalidateQueries('agents');
            // Add to cache
            queryClient.setQueryData(['agent', newAgent.id], newAgent);
        },
    });
}
export function useUpdateAgent(agentId) {
    const queryClient = useQueryClient();
    return useMutation((payload) => apiClient.updateAgent(agentId, payload), {
        onSuccess: (updatedAgent) => {
            // Invalidate list
            queryClient.invalidateQueries('agents');
            // Update cache
            queryClient.setQueryData(['agent', agentId], updatedAgent);
        },
    });
}
export function useDeleteAgent(agentId) {
    const queryClient = useQueryClient();
    return useMutation(() => apiClient.deleteAgent(agentId), {
        onSuccess: () => {
            // Invalidate list
            queryClient.invalidateQueries('agents');
            // Remove from cache
            queryClient.removeQueries(['agent', agentId]);
        },
    });
}
export function useSearchAgents(filters) {
    return useQuery(['agents-search', filters], () => apiClient.searchAgents(filters), {
        enabled: !!(filters.name || filters.status), // Only run if filters are set
        staleTime: 15000,
    });
}
export function useTenantInfo() {
    return useQuery(['tenant'], () => apiClient.getTenantInfo(), {
        staleTime: 60000, // 1 minute
        cacheTime: 10 * 60 * 1000, // 10 minutes
    });
}

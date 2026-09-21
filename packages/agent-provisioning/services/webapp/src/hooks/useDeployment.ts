import { useMutation, useQuery } from 'react-query';
import axios from 'axios';
import { DeploymentRequest, DeploymentResponse } from '../types/deployment';

const API_BASE = (import.meta as any).env.VITE_API_BASE || 'http://localhost:3000';
const deploymentAPI = axios.create({ baseURL: API_BASE });

export function useDeployment() {
  return useMutation(
    (payload: DeploymentRequest) =>
      deploymentAPI.post<DeploymentResponse>('/api/v1/deploy_agent', payload),
    {
      onSuccess: (response) => {
        console.log('Deployment successful:', response.data);
      },
      onError: (error: any) => {
        console.error('Deployment failed:', error.response?.data || error.message);
      },
    }
  );
}

export function useDeploymentStatus(deploymentId: string | null) {
  return useQuery(
    ['deployment', deploymentId],
    () => deploymentAPI.get(`/api/v1/deployment/${deploymentId}`),
    {
      enabled: !!deploymentId,
      refetchInterval: 2000, // Poll every 2 seconds
      staleTime: 0,
    }
  );
}

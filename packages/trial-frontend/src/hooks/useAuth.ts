/**
 * React Hook for Authentication
 * Manages JWT token and Telegram authentication
 */

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/api';
import { WebAppAuthResponse } from '../types/api';

interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: WebAppAuthResponse['user'] | null;
  authenticate: (initData: string) => Promise<WebAppAuthResponse>;
  logout: () => void;
  refreshToken: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<WebAppAuthResponse['user'] | null>(null);

  // Check if token exists and is valid on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const expiry = localStorage.getItem('authTokenExpiry');

    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
      setIsAuthenticated(true);
      // Try to get user from storage
      const storedUser = localStorage.getItem('authUser');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error('Failed to parse stored user:', e);
        }
      }
    }

    setIsLoading(false);
  }, []);

  const authenticate = useCallback(async (initData: string): Promise<WebAppAuthResponse> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.authenticateWithTelegram(initData);

      setIsAuthenticated(true);
      setUser(response.user);

      // Store user data
      localStorage.setItem('authUser', JSON.stringify(response.user));

      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      setIsAuthenticated(false);
      setUser(null);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authTokenExpiry');
    localStorage.removeItem('authUser');
    setIsAuthenticated(false);
    setUser(null);
    setError(null);
  }, []);

  const refreshToken = useCallback(async () => {
    try {
      // This will be handled automatically by the API client interceptor
      // But we can expose it for manual refresh if needed
      if (apiClient.isTokenExpired()) {
        logout();
        throw new Error('Token expired');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token refresh failed');
      logout();
    }
  }, []);

  return {
    isAuthenticated,
    isLoading,
    error,
    user,
    authenticate,
    logout,
    refreshToken,
  };
}

export default useAuth;

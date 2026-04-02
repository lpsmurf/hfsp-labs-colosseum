import { useState, useCallback, useEffect } from 'react';
import { User } from '../types';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }, [token]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
  }, []);

  const login = useCallback((user: User, token: string) => {
    setUser(user);
    setToken(token);
  }, []);

  return {
    user,
    token,
    loading,
    setLoading,
    login,
    logout,
    isAuthenticated: !!token && !!user,
  };
};

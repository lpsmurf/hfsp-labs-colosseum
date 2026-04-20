import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';
const AuthContext = createContext(null);
function loadStored(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
}
export function AuthProvider({ children }) {
    const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
    const [user, setUser] = useState(() => loadStored(USER_KEY));
    useEffect(() => {
        if (token)
            localStorage.setItem(TOKEN_KEY, token);
        else {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        }
    }, [token]);
    useEffect(() => {
        if (user)
            localStorage.setItem(USER_KEY, JSON.stringify(user));
    }, [user]);
    const login = useCallback((newUser, newToken) => {
        setUser(newUser);
        setToken(newToken);
    }, []);
    const logout = useCallback(() => {
        setUser(null);
        setToken(null);
    }, []);
    return (_jsx(AuthContext.Provider, { value: { user, token, isAuthenticated: !!token && !!user, login, logout }, children: children }));
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Root Application Component
 * Handles routing and app initialization
 */
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from 'react-query';
import useTelegramApp from './hooks/useTelegramApp';
import useAuth from './hooks/useAuth';
import { ToastContainer, useToast } from './components/shared';
// Placeholder pages (to be created in Phase 2+)
const HomePage = () => _jsx("div", { className: "p-4", children: "Home - Dashboard Coming Soon" });
const SetupPage = () => _jsx("div", { className: "p-4", children: "Setup Wizard - Coming Soon" });
const AgentPage = () => _jsx("div", { className: "p-4", children: "Agent Details - Coming Soon" });
const LoadingPage = () => (_jsx("div", { className: "flex items-center justify-center min-h-screen", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" }), _jsx("p", { className: "text-gray-600 dark:text-gray-400", children: "Initializing..." })] }) }));
// Create QueryClient instance
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 30000,
        },
    },
});
function AppContent() {
    const tg = useTelegramApp();
    const auth = useAuth();
    const toast = useToast();
    // Initialize authentication with Telegram
    useEffect(() => {
        if (tg.isReady && tg.initData && !auth.isAuthenticated) {
            auth.authenticate(tg.initData).catch(() => {
                toast.error('Failed to authenticate. Please try again.');
            });
        }
    }, [tg.isReady, tg.initData]);
    // Handle errors
    useEffect(() => {
        if (tg.error) {
            toast.error(`Telegram Error: ${tg.error}`);
        }
    }, [tg.error]);
    // Show loading while initializing
    if (!tg.isReady || auth.isLoading) {
        return _jsx(LoadingPage, {});
    }
    // Show error if Telegram failed to initialize
    if (tg.error) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-white dark:bg-gray-900", children: _jsxs("div", { className: "text-center p-4", children: [_jsx("h1", { className: "text-2xl font-bold text-red-600 dark:text-red-400 mb-2", children: "Error" }), _jsx("p", { className: "text-gray-600 dark:text-gray-400 mb-4", children: tg.error }), _jsx("p", { className: "text-sm text-gray-500 dark:text-gray-500", children: "This app requires Telegram Web App SDK. Open this link in Telegram." })] }) }));
    }
    // Redirect to home if not authenticated
    if (!auth.isAuthenticated && !auth.isLoading) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-white dark:bg-gray-900", children: _jsxs("div", { className: "text-center p-4", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 dark:text-white mb-2", children: "Authentication Required" }), _jsx("p", { className: "text-gray-600 dark:text-gray-400", children: "Please open this link from within Telegram to continue." })] }) }));
    }
    return (_jsx("div", { className: `min-h-screen ${tg.colorScheme === 'dark' ? 'dark' : ''}`, children: _jsxs("div", { className: "bg-white dark:bg-gray-900 text-gray-900 dark:text-white", children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/setup", element: _jsx(SetupPage, {}) }), _jsx(Route, { path: "/agent/:id", element: _jsx(AgentPage, {}) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }), _jsx(ToastContainer, { toasts: toast.toasts, onClose: toast.removeToast })] }) }));
}
function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsx(AppContent, {}) }) }));
}
export default App;

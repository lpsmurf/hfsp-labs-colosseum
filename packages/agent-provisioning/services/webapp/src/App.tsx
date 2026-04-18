import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from 'react-query';
import useTelegramApp from './hooks/useTelegramApp';
import useAuth from './hooks/useAuth';
import { useProvisioning } from './hooks/useProvisioning';
import { ToastContainer, useToast } from './components/shared';
import { HomePage } from './pages/HomePage';
import { SetupPage } from './pages/SetupPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

// Derives WebSocket URL from current host
function getWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws/provisioning`;
}

const LoadingPage = () => (
  <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
    <div className="text-center">
      <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">Initializing…</p>
    </div>
  </div>
);

/** Small dot shown in the header when WS is connected */
function WsIndicator({ connected }: { connected: boolean }) {
  if (!connected) return null;
  return (
    <div className="fixed top-3 right-4 z-50 flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      <span className="text-xs text-green-700 dark:text-green-300 font-medium">Live</span>
    </div>
  );
}

function AppContent() {
  const tg    = useTelegramApp();
  const auth  = useAuth();
  const toast = useToast();

  // Get JWT token from storage for WS auth
  const token = localStorage.getItem('authToken');
  const { connected } = useProvisioning({
    wsUrl: auth.isAuthenticated ? getWsUrl() : null,
    token,
  });

  // Authenticate via Telegram on first load
  useEffect(() => {
    if (tg.isReady && tg.initData && !auth.isAuthenticated) {
      auth.authenticate(tg.initData).catch(() =>
        toast.error('Authentication failed. Please try again.')
      );
    }
  }, [tg.isReady, tg.initData, auth, toast]);

  if (!tg.isReady || auth.isLoading) return <LoadingPage />;

  if (tg.error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 p-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-red-500 mb-2">SDK Error</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{tg.error}</p>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-2">Open this link inside Telegram.</p>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900 p-6">
        <div className="text-center">
          <p className="text-xl font-bold text-gray-900 dark:text-white mb-2">Authentication Required</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Open this link from within Telegram.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={tg.colorScheme === 'dark' ? 'dark' : ''}>
      <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen">
        <WsIndicator connected={connected} />
        <Routes>
          <Route path="/"      element={<HomePage />}  />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="*"      element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

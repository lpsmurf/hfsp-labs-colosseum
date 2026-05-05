import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClientProvider, QueryClient } from 'react-query';
import useTelegramApp from './hooks/useTelegramApp';
import useAuth from './hooks/useAuth';
import { ToastContainer, useToast } from './components/shared';
import { MainLayout } from './layouts/MainLayout';
import { Home } from './pages/Home';
import { Deploy } from './pages/Deploy';
import { Agents } from './pages/Agents';
import { Admin } from './pages/Admin';
import { Try } from './pages/Try';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

const LoadingPage = () => (
  <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-900">
    <div className="text-center">
      <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-500 dark:text-gray-400 text-sm">Initializing…</p>
    </div>
  </div>
);

function TrialAppContent() {
  const toast = useToast();

  return (
    <>
      <Routes>
        <Route path="/try" element={<Try />} />
        <Route path="*" element={<Navigate to="/try" replace />} />
      </Routes>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </>
  );
}

function AuthenticatedAppContent() {
  const tg    = useTelegramApp();
  const auth  = useAuth();
  const toast = useToast();

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
        <MainLayout>
          <Routes>
            <Route path="/"        element={<Home />}   />
            <Route path="/deploy"  element={<Deploy />} />
            <Route path="/agents"  element={<Agents />} />
            <Route path="/admin"   element={<Admin />}  />
            <Route path="/try"     element={<Try />}    />
            <Route path="*"        element={<Navigate to="/" replace />} />
          </Routes>
        </MainLayout>
        <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
      </div>
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  if (location.pathname === '/try') return <TrialAppContent />;
  return <AuthenticatedAppContent />;
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

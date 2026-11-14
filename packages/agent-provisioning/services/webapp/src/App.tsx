import { QueryClientProvider, QueryClient } from 'react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { WizardProvider } from './context/WizardContext';
import { ToastContainer, useToast } from './components/shared';
import { WelcomePage } from './pages/WelcomePage';
import { WalletPage } from './pages/WalletPage';
import { TierPage } from './pages/TierPage';
import { AgentConfigPage } from './pages/AgentConfigPage';
import { PaymentPage } from './pages/PaymentPage';
import { DeployPage } from './pages/DeployPage';
import { PairingPage } from './pages/PairingPage';
import { SuccessPage } from './pages/SuccessPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30000 } },
});

function AppContent() {
  const toast = useToast();
  return (
    <>
      <Routes>
        <Route path="/"         element={<WelcomePage />} />
        <Route path="/connect"  element={<WalletPage />} />
        <Route path="/tier"     element={<TierPage />} />
        <Route path="/configure" element={<AgentConfigPage />} />
        <Route path="/payment"  element={<PaymentPage />} />
        <Route path="/deploy"   element={<DeployPage />} />
        <Route path="/pair"     element={<PairingPage />} />
        <Route path="/success"  element={<SuccessPage />} />
        <Route path="*"         element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WizardProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </WizardProvider>
    </QueryClientProvider>
  );
}

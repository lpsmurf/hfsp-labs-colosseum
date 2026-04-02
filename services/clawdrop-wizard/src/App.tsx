import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import DashboardHome from './pages/DashboardHome';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AccountPage from './pages/AccountPage';
import UpgradePage from './pages/UpgradePage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><DashboardHome /></ProtectedRoute>} />
          <Route path="/agents/create" element={<ProtectedRoute><CreateAgentPage /></ProtectedRoute>} />
          <Route path="/agents/:id" element={<ProtectedRoute><AgentDetailPage /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
          <Route path="/upgrade" element={<ProtectedRoute><UpgradePage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </Router>
  );
}

import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import SignupPage from './pages/SignupPage';
import LoginPage from './pages/LoginPage';
import DashboardHome from './pages/DashboardHome';
import CreateAgentPage from './pages/CreateAgentPage';
import AgentDetailPage from './pages/AgentDetailPage';
import AccountPage from './pages/AccountPage';
import UpgradePage from './pages/UpgradePage';
function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? _jsx(_Fragment, { children: children }) : _jsx(Navigate, { to: "/login", replace: true });
}
function PublicRoute({ children }) {
    const { isAuthenticated } = useAuth();
    return isAuthenticated ? _jsx(Navigate, { to: "/", replace: true }) : _jsx(_Fragment, { children: children });
}
function AppRoutes() {
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/signup", element: _jsx(PublicRoute, { children: _jsx(SignupPage, {}) }) }), _jsx(Route, { path: "/login", element: _jsx(PublicRoute, { children: _jsx(LoginPage, {}) }) }), _jsx(Route, { path: "/", element: _jsx(ProtectedRoute, { children: _jsx(DashboardHome, {}) }) }), _jsx(Route, { path: "/agents/create", element: _jsx(ProtectedRoute, { children: _jsx(CreateAgentPage, {}) }) }), _jsx(Route, { path: "/agents/:id", element: _jsx(ProtectedRoute, { children: _jsx(AgentDetailPage, {}) }) }), _jsx(Route, { path: "/account", element: _jsx(ProtectedRoute, { children: _jsx(AccountPage, {}) }) }), _jsx(Route, { path: "/upgrade", element: _jsx(ProtectedRoute, { children: _jsx(UpgradePage, {}) }) }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }));
}
export default function App() {
    return (_jsx(AuthProvider, { children: _jsx(Router, { children: _jsx("div", { className: "min-h-screen bg-gray-50", children: _jsx(AppRoutes, {}) }) }) }));
}

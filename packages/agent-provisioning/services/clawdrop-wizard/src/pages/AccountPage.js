import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../services/api';
export default function AccountPage() {
    const { logout } = useAuth();
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        userAPI.getProfile()
            .then(res => setProfile(res.data.user))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);
    const handleLogout = () => {
        logout();
        navigate('/login');
    };
    if (loading)
        return _jsx("div", { className: "min-h-screen flex items-center justify-center", children: "Loading..." });
    return (_jsx("div", { className: "min-h-screen bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-md mx-auto", children: [_jsx(Link, { to: "/", className: "text-blue-600 hover:underline mb-4 inline-block", children: "\u2190 Back" }), _jsxs("div", { className: "bg-white rounded-lg shadow p-8", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "Account" }), _jsxs("div", { className: "space-y-4", children: [profile?.email && (_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Email" }), _jsx("p", { className: "font-semibold", children: profile.email })] })), profile?.wallet && (_jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Wallet" }), _jsx("p", { className: "font-semibold font-mono text-sm", children: profile.wallet })] })), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Plan" }), _jsx("p", { className: "font-semibold capitalize", children: profile?.subscription?.replace('_', ' ') })] }), _jsxs("div", { children: [_jsx("p", { className: "text-sm text-gray-600", children: "Agents" }), _jsx("p", { className: "font-semibold", children: profile?.agentCount ?? 0 })] }), profile?.subscription === 'free_trial' && profile?.trialExpiresAt && (_jsxs("div", { className: "bg-yellow-50 border border-yellow-200 rounded-lg p-4", children: [_jsxs("p", { className: "text-yellow-800 text-sm", children: ["Trial expires: ", _jsx("strong", { children: new Date(profile.trialExpiresAt).toLocaleDateString() })] }), _jsx(Link, { to: "/upgrade", className: "text-blue-600 hover:underline text-sm mt-1 inline-block", children: "Upgrade to Pro ($9/mo)" })] })), _jsx("hr", { className: "my-4" }), _jsx("button", { onClick: handleLogout, className: "w-full bg-red-600 text-white py-2 rounded-md hover:bg-red-700", children: "Logout" })] })] })] }) }));
}

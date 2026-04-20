import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import PhantomWalletButton from '../components/PhantomWalletButton';
export default function LoginPage() {
    const [method, setMethod] = useState('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();
    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await authAPI.emailLogin(email, password);
            login(response.data.user, response.data.token);
            navigate('/');
        }
        catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-md w-full bg-white rounded-lg shadow p-8", children: [_jsx("h2", { className: "text-3xl font-bold text-gray-900 mb-6", children: "Welcome Back" }), _jsxs("div", { className: "flex rounded-lg border border-gray-200 p-1 mb-6 gap-1", children: [_jsx("button", { onClick: () => { setMethod('email'); setError(''); }, className: `flex-1 py-2 text-sm rounded-md font-medium transition-colors ${method === 'email' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:text-gray-900'}`, children: "Email" }), _jsx("button", { onClick: () => { setMethod('phantom'); setError(''); }, className: `flex-1 py-2 text-sm rounded-md font-medium transition-colors ${method === 'phantom' ? 'bg-purple-600 text-white' : 'text-gray-600 hover:text-gray-900'}`, children: "Phantom Wallet" })] }), error && (_jsx("div", { className: "bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm", children: error })), method === 'email' && (_jsxs("form", { onSubmit: handleLogin, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Email" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "you@example.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Password" }), _jsx("input", { type: "password", required: true, value: password, onChange: (e) => setPassword(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "Your password" })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50", children: loading ? 'Signing in...' : 'Sign In' })] })), method === 'phantom' && (_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "text-sm text-gray-600", children: "Sign in by verifying ownership of your Phantom wallet \u2014 no password needed." }), _jsx(PhantomWalletButton, { label: "Sign In with Phantom", onError: setError })] })), _jsxs("p", { className: "mt-6 text-center text-sm text-gray-600", children: ["Don't have an account?", ' ', _jsx(Link, { to: "/signup", className: "text-blue-600 hover:underline", children: "Sign up" })] })] }) }));
}

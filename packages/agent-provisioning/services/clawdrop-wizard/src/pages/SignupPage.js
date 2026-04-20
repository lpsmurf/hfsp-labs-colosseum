import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import PhantomWalletButton from '../components/PhantomWalletButton';
export default function SignupPage() {
    const [method, setMethod] = useState('email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [phantomEmail, setPhantomEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { login } = useAuth();
    const handleEmailSignup = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const response = await authAPI.emailSignup(email, password, firstName);
            login(response.data.user, response.data.token);
            navigate('/');
        }
        catch (err) {
            setError(err.response?.data?.error || 'Signup failed');
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-md w-full bg-white rounded-lg shadow p-8", children: [_jsx("h2", { className: "text-3xl font-bold text-gray-900 mb-1", children: "ClawDrop Wizard" }), _jsx("p", { className: "text-gray-500 text-sm mb-6", children: "14-day free trial \u2022 1 agent \u2022 No credit card" }), _jsxs("div", { className: "flex rounded-lg border border-gray-200 p-1 mb-6 gap-1", children: [_jsx("button", { onClick: () => { setMethod('email'); setError(''); }, className: `flex-1 py-2 text-sm rounded-md font-medium transition-colors ${method === 'email'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-600 hover:text-gray-900'}`, children: "Email" }), _jsx("button", { onClick: () => { setMethod('phantom'); setError(''); }, className: `flex-1 py-2 text-sm rounded-md font-medium transition-colors ${method === 'phantom'
                                ? 'bg-purple-600 text-white'
                                : 'text-gray-600 hover:text-gray-900'}`, children: "Phantom Wallet" })] }), error && (_jsx("div", { className: "bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm", children: error })), method === 'email' && (_jsxs("form", { onSubmit: handleEmailSignup, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "First Name" }), _jsx("input", { type: "text", value: firstName, onChange: (e) => setFirstName(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "John" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Email" }), _jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "you@example.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Password" }), _jsx("input", { type: "password", required: true, minLength: 8, value: password, onChange: (e) => setPassword(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "At least 8 characters" })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50", children: loading ? 'Creating account...' : 'Create Account' })] })), method === 'phantom' && (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800", children: [_jsx("p", { className: "font-medium mb-1", children: "How it works:" }), _jsxs("ol", { className: "list-decimal list-inside space-y-1 text-purple-700", children: [_jsx("li", { children: "Click the button below" }), _jsx("li", { children: "Approve the connection in Phantom" }), _jsx("li", { children: "Sign a message to verify ownership" }), _jsx("li", { children: "Your account is created instantly" })] })] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: ["Email ", _jsx("span", { className: "text-gray-400 font-normal", children: "(optional \u2014 links trial to email+wallet)" })] }), _jsx("input", { type: "email", value: phantomEmail, onChange: (e) => setPhantomEmail(e.target.value), className: "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500", placeholder: "you@example.com" })] }), _jsx(PhantomWalletButton, { email: phantomEmail || undefined, onError: setError }), _jsxs("p", { className: "text-center text-xs text-gray-500", children: ["Don't have Phantom?", ' ', _jsx("a", { href: "https://phantom.app", target: "_blank", rel: "noreferrer", className: "text-purple-600 hover:underline", children: "Install it here" })] })] })), _jsxs("p", { className: "mt-6 text-center text-sm text-gray-600", children: ["Already have an account?", ' ', _jsx(Link, { to: "/login", className: "text-blue-600 hover:underline", children: "Sign in" })] })] }) }));
}

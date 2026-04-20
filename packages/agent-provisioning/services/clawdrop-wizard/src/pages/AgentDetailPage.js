import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { agentAPI } from '../services/api';
export default function AgentDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [agent, setAgent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [pairing, setPairing] = useState(false);
    const [pairError, setPairError] = useState('');
    const pollRef = useRef(null);
    const fetchAgent = async () => {
        if (!id)
            return;
        try {
            const res = await agentAPI.getAgent(id);
            setAgent(res.data.agent);
        }
        catch {
            setError('Failed to load agent');
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        fetchAgent();
    }, [id]);
    // Poll while provisioning
    useEffect(() => {
        if (!agent)
            return;
        if (agent.status === 'provisioning') {
            pollRef.current = setInterval(fetchAgent, 5000);
        }
        else {
            if (pollRef.current)
                clearInterval(pollRef.current);
        }
        return () => { if (pollRef.current)
            clearInterval(pollRef.current); };
    }, [agent?.status]);
    const handlePair = async () => {
        if (!id || !pairingCode.trim())
            return;
        setPairing(true);
        setPairError('');
        try {
            await agentAPI.pairAgent(id, pairingCode.trim().toUpperCase());
            await fetchAgent();
            setPairingCode('');
        }
        catch (err) {
            setPairError(err.response?.data?.error ?? 'Pairing failed. Check the code and try again.');
        }
        finally {
            setPairing(false);
        }
    };
    const handleDelete = async () => {
        if (!id || !confirm('Delete this agent? This will stop and remove its container.'))
            return;
        setDeleting(true);
        try {
            await agentAPI.deleteAgent(id);
            navigate('/');
        }
        catch {
            setError('Failed to delete agent');
            setDeleting(false);
        }
    };
    if (loading)
        return _jsx("div", { className: "min-h-screen flex items-center justify-center", children: "Loading..." });
    if (error)
        return _jsx("div", { className: "min-h-screen flex items-center justify-center text-red-600", children: error });
    if (!agent)
        return _jsx("div", { className: "min-h-screen flex items-center justify-center", children: "Agent not found" });
    return (_jsx("div", { className: "min-h-screen bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-2xl mx-auto", children: [_jsx(Link, { to: "/", className: "text-blue-600 hover:underline mb-4 inline-block", children: "\u2190 Back to Dashboard" }), _jsxs("div", { className: "bg-white rounded-lg shadow p-8", children: [_jsxs("div", { className: "flex justify-between items-start mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-3xl font-bold", children: agent.name }), _jsxs("p", { className: "text-gray-500 text-sm mt-1", children: ["ID: ", agent.id] })] }), _jsx("span", { className: `px-3 py-1 rounded-full text-sm font-medium ${agent.status === 'active' ? 'bg-green-100 text-green-800' :
                                        agent.status === 'provisioning' ? 'bg-blue-100 text-blue-800' :
                                            agent.status === 'awaiting_pairing' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'}`, children: agent.status === 'awaiting_pairing' ? 'awaiting pairing' : agent.status })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4 mb-8", children: [_jsxs("div", { className: "bg-gray-50 rounded-lg p-4", children: [_jsx("p", { className: "text-sm text-gray-600", children: "Provider" }), _jsx("p", { className: "font-semibold capitalize", children: agent.provider })] }), _jsxs("div", { className: "bg-gray-50 rounded-lg p-4", children: [_jsx("p", { className: "text-sm text-gray-600", children: "Model" }), _jsx("p", { className: "font-semibold", children: agent.model })] }), _jsxs("div", { className: "bg-gray-50 rounded-lg p-4", children: [_jsx("p", { className: "text-sm text-gray-600", children: "Dashboard Port" }), _jsx("p", { className: "font-semibold", children: agent.dashboardPort })] }), _jsxs("div", { className: "bg-gray-50 rounded-lg p-4", children: [_jsx("p", { className: "text-sm text-gray-600", children: "Created" }), _jsx("p", { className: "font-semibold", children: new Date(agent.createdAt).toLocaleDateString() })] })] }), agent.status === 'provisioning' && (_jsxs("div", { className: "bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6", children: [_jsx("p", { className: "text-blue-800 font-medium mb-1", children: "Provisioning your agent\u2026" }), _jsx("p", { className: "text-blue-700 text-sm", children: "This usually takes 30\u201360 seconds. Checking automatically." })] })), agent.status === 'awaiting_pairing' && (_jsxs("div", { className: "bg-yellow-50 border border-yellow-200 rounded-lg p-5 mb-6", children: [_jsx("h3", { className: "font-semibold text-yellow-900 mb-2", children: "Pair your Telegram bot" }), _jsxs("ol", { className: "text-sm text-yellow-800 space-y-1 mb-4 list-decimal list-inside", children: [_jsxs("li", { children: ["Open your Telegram bot and send ", _jsx("code", { className: "bg-yellow-100 px-1 rounded", children: "/start" })] }), _jsxs("li", { children: ["The bot will reply with a pairing code (e.g. ", _jsx("code", { className: "bg-yellow-100 px-1 rounded", children: "PJDNQ3VU" }), ")"] }), _jsx("li", { children: "Paste that code below" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "text", value: pairingCode, onChange: e => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')), maxLength: 12, placeholder: "e.g. PJDNQ3VU", className: "flex-1 border rounded-md px-3 py-2 font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-yellow-400" }), _jsx("button", { onClick: handlePair, disabled: pairing || pairingCode.length < 6, className: "bg-yellow-500 text-white px-5 py-2 rounded-md hover:bg-yellow-600 disabled:opacity-50 font-medium", children: pairing ? 'Pairing…' : 'Pair' })] }), pairError && _jsx("p", { className: "text-red-600 text-sm mt-2", children: pairError })] })), agent.status === 'active' && (_jsx("div", { className: "bg-green-50 border border-green-200 rounded-lg p-4 mb-6", children: _jsx("p", { className: "text-green-800 font-medium", children: "Agent is active and running." }) })), agent.status === 'failed' && (_jsx("div", { className: "bg-red-50 border border-red-200 rounded-lg p-4 mb-6", children: _jsx("p", { className: "text-red-800", children: "Provisioning failed. Delete this agent and try again." }) })), _jsx("div", { className: "border-t pt-6", children: _jsx("button", { onClick: handleDelete, disabled: deleting, className: "bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50", children: deleting ? 'Deleting...' : 'Delete Agent' }) })] })] }) }));
}

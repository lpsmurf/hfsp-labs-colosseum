import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { agentAPI } from '../services/api';

interface AgentDetail {
  id: string;
  name: string;
  provider: string;
  model: string;
  dashboardPort: number;
  status: string;
  createdAt: string;
}

export default function AgentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAgent = async () => {
    if (!id) return;
    try {
      const res = await agentAPI.getAgent(id);
      setAgent(res.data.agent);
    } catch {
      setError('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgent();
  }, [id]);

  // Poll while provisioning
  useEffect(() => {
    if (!agent) return;
    if (agent.status === 'provisioning') {
      pollRef.current = setInterval(fetchAgent, 5000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [agent?.status]);

  const handlePair = async () => {
    if (!id || !pairingCode.trim()) return;
    setPairing(true);
    setPairError('');
    try {
      await agentAPI.pairAgent(id, pairingCode.trim().toUpperCase());
      await fetchAgent();
      setPairingCode('');
    } catch (err: any) {
      setPairError(err.response?.data?.error ?? 'Pairing failed. Check the code and try again.');
    } finally {
      setPairing(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this agent? This will stop and remove its container.')) return;
    setDeleting(true);
    try {
      await agentAPI.deleteAgent(id);
      navigate('/');
    } catch {
      setError('Failed to delete agent');
      setDeleting(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (error) return <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>;
  if (!agent) return <div className="min-h-screen flex items-center justify-center">Agent not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>

        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl font-bold">{agent.name}</h1>
              <p className="text-gray-500 text-sm mt-1">ID: {agent.id}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              agent.status === 'active' ? 'bg-green-100 text-green-800' :
              agent.status === 'provisioning' ? 'bg-blue-100 text-blue-800' :
              agent.status === 'awaiting_pairing' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {agent.status === 'awaiting_pairing' ? 'awaiting pairing' : agent.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Provider</p>
              <p className="font-semibold capitalize">{agent.provider}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Model</p>
              <p className="font-semibold">{agent.model}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Dashboard Port</p>
              <p className="font-semibold">{agent.dashboardPort}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-600">Created</p>
              <p className="font-semibold">{new Date(agent.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          {agent.status === 'provisioning' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-800 font-medium mb-1">Provisioning your agent…</p>
              <p className="text-blue-700 text-sm">This usually takes 30–60 seconds. Checking automatically.</p>
            </div>
          )}

          {agent.status === 'awaiting_pairing' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5 mb-6">
              <h3 className="font-semibold text-yellow-900 mb-2">Pair your Telegram bot</h3>
              <ol className="text-sm text-yellow-800 space-y-1 mb-4 list-decimal list-inside">
                <li>Open your Telegram bot and send <code className="bg-yellow-100 px-1 rounded">/start</code></li>
                <li>The bot will reply with a pairing code (e.g. <code className="bg-yellow-100 px-1 rounded">PJDNQ3VU</code>)</li>
                <li>Paste that code below</li>
              </ol>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pairingCode}
                  onChange={e => setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  maxLength={12}
                  placeholder="e.g. PJDNQ3VU"
                  className="flex-1 border rounded-md px-3 py-2 font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-yellow-400"
                />
                <button
                  onClick={handlePair}
                  disabled={pairing || pairingCode.length < 6}
                  className="bg-yellow-500 text-white px-5 py-2 rounded-md hover:bg-yellow-600 disabled:opacity-50 font-medium"
                >
                  {pairing ? 'Pairing…' : 'Pair'}
                </button>
              </div>
              {pairError && <p className="text-red-600 text-sm mt-2">{pairError}</p>}
            </div>
          )}

          {agent.status === 'active' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-green-800 font-medium">Agent is active and running.</p>
            </div>
          )}

          {agent.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">Provisioning failed. Delete this agent and try again.</p>
            </div>
          )}

          <div className="border-t pt-6">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Agent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

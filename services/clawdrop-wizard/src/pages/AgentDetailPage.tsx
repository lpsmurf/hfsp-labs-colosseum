import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!id) return;
    agentAPI.getAgent(id)
      .then(res => setAgent(res.data.agent))
      .catch(() => setError('Failed to load agent'))
      .finally(() => setLoading(false));
  }, [id]);

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
              'bg-red-100 text-red-800'
            }`}>
              {agent.status}
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
              <p className="text-blue-800">Your agent is being provisioned. This usually takes 30-60 seconds. Refresh to check status.</p>
            </div>
          )}

          {agent.status === 'failed' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">Provisioning failed. You can delete this agent and try again.</p>
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

import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useAgents } from '../hooks/useAgents';

export default function DashboardHome() {
  const { user, logout } = useAuth();
  const { agents, loading, fetchAgents } = useAgents();
  const navigate = useNavigate();

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">ClawDrop Wizard</h1>
          <div className="flex gap-4 items-center">
            <span className="text-sm text-gray-600">{user?.email || user?.wallet}</span>
            {user?.subscription === 'free_trial' && (
              <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                Trial Active
              </span>
            )}
            {user?.subscription === 'pro' && (
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                Pro
              </span>
            )}
            <Link to="/account" className="text-blue-600 hover:underline">Account</Link>
            <button onClick={handleLogout} className="text-red-600 hover:underline">Logout</button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Your Agents</h3>
            <p className="text-3xl font-bold text-blue-600">{agents.length}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Plan</h3>
            <p className="text-2xl font-bold text-green-600 capitalize">{user?.subscription}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Status</h3>
            <p className="text-green-600 font-semibold">✓ Active</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Your Agents</h2>
            <Link
              to="/agents/create"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              + New Agent
            </Link>
          </div>

          {loading ? (
            <div className="text-center py-8">Loading agents...</div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No agents yet</p>
              <p className="text-sm">Create your first agent to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {agents.map((agent) => (
                <Link
                  key={agent.id}
                  to={`/agents/${agent.id}`}
                  className="block border rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-lg">{agent.name}</h3>
                      <p className="text-sm text-gray-600">Created {new Date(agent.createdAt).toLocaleDateString()}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-sm font-medium ${
                      agent.status === 'active' ? 'bg-green-100 text-green-800' :
                      agent.status === 'provisioning' ? 'bg-blue-100 text-blue-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {agent.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {user?.subscription === 'free_trial' && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 mb-2">Upgrade to Pro</h3>
            <p className="text-blue-800 mb-4">Get unlimited agents and priority support for $9/month</p>
            <Link
              to="/upgrade"
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Upgrade Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useAgents } from '../hooks/useAgents';

export function Home() {
  const navigate = useNavigate();
  const { data } = useAgents();

  const totalAgents = data?.agents?.length ?? 0;
  const activeAgents = data?.agents?.filter((a) => a.status === 'active').length ?? 0;

  const features = [
    { icon: '⚡', title: 'Lightning Fast', desc: 'Deploy in under 2 minutes' },
    { icon: '🤖', title: 'Any AI Model', desc: 'Anthropic, OpenAI, OpenRouter' },
    { icon: '🖥️', title: 'Self-Hosted', desc: 'Your VPS, your data' },
    { icon: '🔒', title: 'Secure', desc: 'Encrypted & isolated' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-800 px-6 pt-10 pb-8 text-white">
        <h1 className="text-4xl font-bold mb-2">🦞 Openclaw</h1>
        <p className="text-blue-100 text-lg">Deploy AI agents to VPS in &lt; 2 minutes</p>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalAgents}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Total Agents</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{activeAgents}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Active</p>
          </div>
        </div>

        {/* Feature grid */}
        <div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3">Why Openclaw?</h2>
          <div className="grid grid-cols-2 gap-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700"
              >
                <span className="text-2xl">{f.icon}</span>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-2">{f.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/deploy')}
          className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-4 rounded-2xl text-base transition-colors shadow-md"
        >
          🚀 Deploy Agent
        </button>
      </div>
    </div>
  );
}

export default Home;

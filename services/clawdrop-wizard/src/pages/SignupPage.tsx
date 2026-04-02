import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
import PhantomWalletButton from '../components/PhantomWalletButton';

type AuthMethod = 'email' | 'phantom';

export default function SignupPage() {
  const [method, setMethod] = useState<AuthMethod>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [phantomEmail, setPhantomEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.emailSignup(email, password, firstName);
      login(response.data.user, response.data.token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-8">

        {/* Header */}
        <h2 className="text-3xl font-bold text-gray-900 mb-1">ClawDrop Wizard</h2>
        <p className="text-gray-500 text-sm mb-6">
          14-day free trial &bull; 1 agent &bull; No credit card
        </p>

        {/* Method toggle */}
        <div className="flex rounded-lg border border-gray-200 p-1 mb-6 gap-1">
          <button
            onClick={() => { setMethod('email'); setError(''); }}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
              method === 'email'
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Email
          </button>
          <button
            onClick={() => { setMethod('phantom'); setError(''); }}
            className={`flex-1 py-2 text-sm rounded-md font-medium transition-colors ${
              method === 'phantom'
                ? 'bg-purple-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Phantom Wallet
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Email signup form */}
        {method === 'email' && (
          <form onSubmit={handleEmailSignup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="At least 8 characters"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* Phantom wallet signup */}
        {method === 'phantom' && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
              <p className="font-medium mb-1">How it works:</p>
              <ol className="list-decimal list-inside space-y-1 text-purple-700">
                <li>Click the button below</li>
                <li>Approve the connection in Phantom</li>
                <li>Sign a message to verify ownership</li>
                <li>Your account is created instantly</li>
              </ol>
            </div>

            {/* Optional email for trial combo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-gray-400 font-normal">(optional — links trial to email+wallet)</span>
              </label>
              <input
                type="email"
                value={phantomEmail}
                onChange={(e) => setPhantomEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="you@example.com"
              />
            </div>

            <PhantomWalletButton
              email={phantomEmail || undefined}
              onError={setError}
            />

            <p className="text-center text-xs text-gray-500">
              Don't have Phantom?{' '}
              <a href="https://phantom.app" target="_blank" rel="noreferrer" className="text-purple-600 hover:underline">
                Install it here
              </a>
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

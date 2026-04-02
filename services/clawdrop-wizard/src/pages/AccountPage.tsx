import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { userAPI } from '../services/api';

interface Profile {
  userId: string;
  email: string;
  wallet: string;
  subscription: string;
  trialExpiresAt: string;
  createdAt: string;
  agentCount: number;
}

export default function AccountPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userAPI.getProfile()
      .then(res => setProfile(res.data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto">
        <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back</Link>

        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold mb-6">Account</h1>

          <div className="space-y-4">
            {profile?.email && (
              <div><p className="text-sm text-gray-600">Email</p><p className="font-semibold">{profile.email}</p></div>
            )}
            {profile?.wallet && (
              <div><p className="text-sm text-gray-600">Wallet</p><p className="font-semibold font-mono text-sm">{profile.wallet}</p></div>
            )}
            <div>
              <p className="text-sm text-gray-600">Plan</p>
              <p className="font-semibold capitalize">{profile?.subscription?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Agents</p>
              <p className="font-semibold">{profile?.agentCount ?? 0}</p>
            </div>

            {profile?.subscription === 'free_trial' && profile?.trialExpiresAt && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">Trial expires: <strong>{new Date(profile.trialExpiresAt).toLocaleDateString()}</strong></p>
                <Link to="/upgrade" className="text-blue-600 hover:underline text-sm mt-1 inline-block">Upgrade to Pro ($9/mo)</Link>
              </div>
            )}

            <hr className="my-4" />
            <button onClick={handleLogout} className="w-full bg-red-600 text-white py-2 rounded-md hover:bg-red-700">Logout</button>
          </div>
        </div>
      </div>
    </div>
  );
}

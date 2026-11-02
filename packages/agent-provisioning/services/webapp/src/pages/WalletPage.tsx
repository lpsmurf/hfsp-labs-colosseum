import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardLayout } from '../components/WizardLayout';
import { useWizard } from '../context/WizardContext';

declare global {
  interface Window {
    phantom?: { solana?: any };
    solana?: any;
  }
}

function getPhantom() {
  return window.phantom?.solana ?? window.solana ?? null;
}

export function WalletPage() {
  const navigate = useNavigate();
  const { set } = useWizard();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const phantom = getPhantom();
  const isInstalled = !!phantom?.isPhantom;

  const connect = async () => {
    if (!phantom) {
      window.open('https://phantom.app/', '_blank');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { publicKey } = await phantom.connect();
      const walletAddress = publicKey.toString();

      // Sign a challenge message for backend auth
      const msgText = `ClawDrop auth: ${walletAddress} @ ${Date.now()}`;
      const message = new TextEncoder().encode(msgText);
      const { signature } = await phantom.signMessage(message, 'utf8');
      
      // Use btoa for browser-compatible base64 encoding
      const signedB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

      // Authenticate with backend — send original message for verification
      const res = await fetch('/api/v1/auth/phantom-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKeyBase58: walletAddress,
          signedMessageBase64: signedB64,
          originalMessage: msgText,
        }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error('Invalid JSON response:', text);
        setError(`Server error: ${res.status} ${res.statusText}`);
        return;
      }
      
      if (res.ok && data.token) {
        localStorage.setItem('authToken', data.token);
        set('wallet', walletAddress);
        navigate('/tier');
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err: any) {
      if (err?.code === 4001) {
        setError('Connection cancelled.');
      } else {
        setError(err?.message || 'Failed to connect wallet.');
      }
    } finally {
      setLoading(false);
    }
  };

  const skipForTesting = async () => {
    setLoading(true);
    setError('');
    try {
      // Auto-login with test account — creates it if it doesn't exist yet
      let res = await fetch('/api/v1/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@test.com', password: 'testpass123' }),
      });
      if (res.status === 401 || res.status === 404) {
        // Account doesn't exist yet, create it
        res = await fetch('/api/v1/auth/email-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'dev@test.com', password: 'testpass123', firstName: 'Dev' }),
        });
      }
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('authToken', data.token);
        set('wallet', data.user?.userId || 'dev@test.com');
        navigate('/tier');
      } else {
        setError(data.error || 'Test login failed');
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <WizardLayout
      currentStep={1}
      title="Connect your wallet"
      subtitle="We use Phantom to identify you — no email or password needed."
    >
      <div className="space-y-6">
        {/* Phantom card */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-4 mb-4">
            <img
              src="https://phantom.app/img/phantom-logo.svg"
              alt="Phantom"
              className="w-10 h-10 rounded-xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div>
              <div className="font-semibold text-white">Phantom Wallet</div>
              <div className="text-xs text-gray-500">
                {isInstalled ? 'Detected in browser' : 'Not installed'}
              </div>
            </div>
            {isInstalled && (
              <span className="ml-auto text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-full px-2 py-0.5">
                Ready
              </span>
            )}
          </div>

          <button
            onClick={connect}
            disabled={loading}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-wait text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {!isInstalled
              ? 'Install Phantom →'
              : loading
              ? 'Connecting...'
              : 'Connect Phantom'}
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-gray-600 space-y-1">
          <p>• Your wallet address is used as your account identifier.</p>
          <p>• We never store your private key.</p>
          <p>• You'll only sign a verification message — no funds move here.</p>
        </div>

        {/* Dev testing button */}
        <button
          onClick={skipForTesting}
          className="w-full py-2 text-gray-500 hover:text-gray-400 text-xs transition-colors border border-gray-800 rounded-lg hover:border-gray-600"
        >
          Skip (testing mode)
        </button>
      </div>
    </WizardLayout>
  );
}

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';

export default function UpgradePage() {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const { token } = useAuth();

  const handleGetPaymentQR = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await authAPI.getSolanaPayQR();
      setQrCode(response.data.qrCode);
      setPaymentId(response.data.paymentId);
    } catch (error) {
      console.error('Failed to get payment QR:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold mb-2">Upgrade to Pro</h1>
        <p className="text-gray-600 mb-6">$9/month • Unlimited agents • Priority support</p>

        {!qrCode ? (
          <button
            onClick={handleGetPaymentQR}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Generating QR...' : 'Pay with Solana'}
          </button>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <img src={qrCode} alt="Solana Pay QR Code" className="w-full" />
            </div>
            <p className="text-center text-sm text-gray-600">Scan with Phantom Wallet to complete payment</p>
            <p className="text-center text-sm text-gray-500">Payment ID: {paymentId}</p>
          </div>
        )}
      </div>
    </div>
  );
}

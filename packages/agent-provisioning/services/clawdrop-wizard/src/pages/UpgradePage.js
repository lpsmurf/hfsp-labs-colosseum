import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { authAPI } from '../services/api';
export default function UpgradePage() {
    const [loading, setLoading] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    const [paymentId, setPaymentId] = useState(null);
    const { token } = useAuth();
    const handleGetPaymentQR = async () => {
        if (!token)
            return;
        setLoading(true);
        try {
            const response = await authAPI.getSolanaPayQR();
            setQrCode(response.data.qrCode);
            setPaymentId(response.data.paymentId);
        }
        catch (error) {
            console.error('Failed to get payment QR:', error);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsx("div", { className: "min-h-screen bg-gray-50 py-12 px-4", children: _jsxs("div", { className: "max-w-md mx-auto bg-white rounded-lg shadow p-8", children: [_jsx("h1", { className: "text-2xl font-bold mb-2", children: "Upgrade to Pro" }), _jsx("p", { className: "text-gray-600 mb-6", children: "$9/month \u2022 Unlimited agents \u2022 Priority support" }), !qrCode ? (_jsx("button", { onClick: handleGetPaymentQR, disabled: loading, className: "w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50", children: loading ? 'Generating QR...' : 'Pay with Solana' })) : (_jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "bg-gray-50 p-4 rounded-lg", children: _jsx("img", { src: qrCode, alt: "Solana Pay QR Code", className: "w-full" }) }), _jsx("p", { className: "text-center text-sm text-gray-600", children: "Scan with Phantom Wallet to complete payment" }), _jsxs("p", { className: "text-center text-sm text-gray-500", children: ["Payment ID: ", paymentId] })] }))] }) }));
}

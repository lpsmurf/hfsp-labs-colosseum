import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../services/api';
// The exact message the backend verifies — must match index.ts
const SIGN_MESSAGE = 'Authorize access to HFSP Agent Provisioning';
export default function PhantomWalletButton({ email, label, onError }) {
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState('idle');
    const navigate = useNavigate();
    const { login } = useAuth();
    const getPhantom = () => {
        if (typeof window === 'undefined')
            return null;
        if (!window.solana?.isPhantom)
            return null;
        return window.solana;
    };
    const handleConnect = async () => {
        const phantom = getPhantom();
        if (!phantom) {
            const msg = 'Phantom wallet not found. Install it at phantom.app';
            onError?.(msg);
            window.open('https://phantom.app', '_blank');
            return;
        }
        setLoading(true);
        setStep('connecting');
        try {
            // Step 1: Connect wallet
            const { publicKey } = await phantom.connect();
            const publicKeyBase58 = publicKey.toBase58();
            // Step 2: Sign message
            setStep('signing');
            const messageBytes = new TextEncoder().encode(SIGN_MESSAGE);
            const { signature } = await phantom.signMessage(messageBytes, 'utf8');
            // Step 3: Encode signature as base64 for API
            const signedMessageBase64 = btoa(String.fromCharCode(...signature));
            // Step 4: Verify with backend
            setStep('verifying');
            const response = await authAPI.phantomVerify(publicKeyBase58, signedMessageBase64, email);
            login(response.data.user, response.data.token);
            navigate('/');
        }
        catch (err) {
            const msg = err?.code === 4001
                ? 'Wallet connection rejected — please approve in Phantom.'
                : err.response?.data?.error || err.message || 'Phantom connection failed';
            onError?.(msg);
        }
        finally {
            setLoading(false);
            setStep('idle');
        }
    };
    const stepLabel = {
        idle: label || 'Connect Phantom Wallet',
        connecting: 'Connecting...',
        signing: 'Sign in Phantom...',
        verifying: 'Verifying...',
    }[step];
    return (_jsxs("button", { onClick: handleConnect, disabled: loading, className: "w-full flex items-center justify-center gap-3 bg-purple-600 text-white py-2 rounded-md font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors", children: [_jsxs("svg", { width: "20", height: "20", viewBox: "0 0 128 128", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: [_jsx("rect", { width: "128", height: "128", rx: "64", fill: "white", fillOpacity: "0.2" }), _jsx("path", { d: "M110.584 64.9142H99.142C99.142 41.8335 80.29 23 57.19 23C34.372 23 15.7 41.4747 15.416 64.2515C15.1153 88.0908 36.842 108 60.7 108H65.262C85.498 108 113.764 93.0662 117.986 72.5264C118.624 69.3947 116.094 64.9142 110.584 64.9142Z", fill: "white" }), _jsx("ellipse", { cx: "49.806", cy: "64.9145", rx: "6.524", ry: "6.508", fill: "#AB9FF2" }), _jsx("ellipse", { cx: "73.958", cy: "64.9145", rx: "6.524", ry: "6.508", fill: "#AB9FF2" })] }), stepLabel] }));
}

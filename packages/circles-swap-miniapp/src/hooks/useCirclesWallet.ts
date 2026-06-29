import { useEffect, useState } from 'react';

// Dynamically import the SDK only if available (graceful standalone fallback)
let sdkLoaded = false;
let _isMiniappMode: () => boolean = () => false;
let _onWalletChange: (fn: (addr: string | null) => void) => void = () => {};

async function loadSdk() {
  if (sdkLoaded) return;
  try {
    const sdk = await import('@aboutcircles/miniapp-sdk');
    _isMiniappMode = sdk.isMiniappMode;
    _onWalletChange = sdk.onWalletChange;
    sdkLoaded = true;
  } catch {
    // running standalone — SDK not available, no-op
  }
}

export function useCirclesWallet() {
  const [gnosisAddress, setGnosisAddress] = useState<string | null>(null);
  const [isMiniapp, setIsMiniapp] = useState(false);

  useEffect(() => {
    loadSdk().then(() => {
      const miniapp = _isMiniappMode();
      setIsMiniapp(miniapp);
      if (miniapp) {
        _onWalletChange(addr => {
          setGnosisAddress(addr);
        });
      }
    });
  }, []);

  return { gnosisAddress, isMiniapp };
}

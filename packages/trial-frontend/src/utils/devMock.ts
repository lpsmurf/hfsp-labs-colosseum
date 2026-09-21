/**
 * Dev-mode Telegram mock — injected only when VITE_DEV_MOCK=true
 * Never included in production builds
 */
export function injectTelegramMock() {
  if (!import.meta.env.DEV) return;

  const mockUser = {
    id: 123456789,
    is_bot: false,
    first_name: 'Dev',
    last_name: 'User',
    username: 'devuser',
    language_code: 'en',
    is_premium: false,
  };

  const mockTheme = {
    bg_color: '#1e1e1e',
    text_color: '#ffffff',
    hint_color: '#aaaaaa',
    link_color: '#6ab2f5',
    button_color: '#0088cc',
    button_text_color: '#ffffff',
    secondary_bg_color: '#292929',
  };

  window.Telegram = {
    WebApp: {
      initData: 'mock_init_data',
      initDataUnsafe: {
        user: mockUser,
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'mock_hash_for_dev',
      },
      version: '6.9',
      platform: 'tdesktop',
      colorScheme: 'dark',
      themeParams: mockTheme,
      isExpanded: true,
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      isClosingConfirmationEnabled: false,
      HeaderColor: '#1e1e1e',
      BackgroundColor: '#1e1e1e',
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      },
      CloudStorage: {
        setItem: (_k: string, _v: string, cb?: (e: null) => void) => cb?.(null),
        getItem: (_k: string, cb?: (v?: string) => void) => cb?.(''),
        removeItem: (_k: string, cb?: (e: null) => void) => cb?.(null),
        getKeys: (cb?: (k?: string[]) => void) => cb?.([]),
      },
      ready: () => { console.log('[TG Mock] ready()'); },
      expand: () => {},
      close: () => {},
      showAlert: (_msg: string, cb?: () => void) => { alert(_msg); cb?.(); },
      showConfirm: (_msg: string, cb?: (ok: boolean) => void) => {
        const ok = window.confirm(_msg);
        cb?.(ok);
      },
      showPopup: () => {},
      showScanQrPopup: () => {},
      closeScanQrPopup: () => {},
      readTextFromClipboard: (_cb?: (text?: string) => void) => _cb?.(''),
      requestWriteAccess: (_cb?: (ok: boolean) => void) => _cb?.(true),
      requestPhoneNumber: (_cb?: (ok: boolean) => void) => _cb?.(true),
      sendData: (data: string) => console.log('[TG Mock] sendData:', data),
      openLink: (url: string) => window.open(url, '_blank'),
      openTelegramLink: (url: string) => window.open(url, '_blank'),
      openInvoice: (_url: string, onClosed?: (status: 'paid' | 'cancelled' | 'failed') => void) => onClosed?.('cancelled'),
      onEvent: (event: string, cb: () => void) => {
        console.log('[TG Mock] onEvent:', event);
        if (event === 'themeChanged') setTimeout(cb, 100);
      },
      offEvent: () => {},
      setHeaderColor: () => {},
      setBackgroundColor: () => {},
    },
  };

  console.log('%c[TG Mock] Telegram Web App mock injected', 'color:#0088cc;font-weight:bold');
}

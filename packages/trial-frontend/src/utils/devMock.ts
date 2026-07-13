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
      headerColor: '#1e1e1e',
      backgroundColor: '#1e1e1e',
      BackButton: { isVisible: false, show: () => {}, hide: () => {}, onClick: () => {} },
      MainButton: {
        text: '', color: '#0088cc', textColor: '#ffffff',
        isVisible: false, isProgressVisible: false, isActive: true,
        show: () => {}, hide: () => {}, enable: () => {}, disable: () => {},
        showProgress: () => {}, hideProgress: () => {},
        onClick: () => {}, offClick: () => {},
        setText: () => {}, setParams: () => {},
      },
      HapticFeedback: {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {},
      },
      CloudStorage: {
        setItem: (_k: string, _v: string, cb?: () => void) => cb?.(),
        getItem: (_k: string, cb?: (value?: string) => void) => cb?.(''),
        getItems: (_k: string[], cb?: (items?: Record<string, string>) => void) => cb?.({}),
        removeItem: (_k: string, cb?: () => void) => cb?.(),
        removeItems: (_k: string[], cb?: () => void) => cb?.(),
        getKeys: (cb?: (keys?: string[]) => void) => cb?.([]),
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
      readTextFromClipboard: (cb?: (text?: string) => void) => cb?.(''),
      requestWriteAccess: (cb?: (ok: boolean) => void) => cb?.(true),
      requestPhoneNumber: (cb?: (ok: boolean) => void) => cb?.(true),
      sendData: (data: string) => console.log('[TG Mock] sendData:', data),
      openLink: (url: string) => window.open(url, '_blank'),
      openTelegramLink: (url: string) => window.open(url, '_blank'),
      onEvent: (event: string, cb: () => void) => {
        console.log('[TG Mock] onEvent:', event);
        cb?.();
      },
      offEvent: (event: string, cb: () => void) => {
        console.log('[TG Mock] offEvent:', event);
      },
      setHeaderColor: (color: string) => { console.log('[TG Mock] setHeaderColor:', color); },
      setBackgroundColor: (color: string) => { console.log('[TG Mock] setBackgroundColor:', color); },
    } as any,
  };
}

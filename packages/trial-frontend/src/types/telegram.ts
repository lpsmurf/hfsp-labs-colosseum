export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      is_premium?: boolean;
    };
    auth_date: number;
    hash: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color?: string;
    text_color?: string;
    hint_color?: string;
    link_color?: string;
    button_color?: string;
    button_text_color?: string;
    secondary_bg_color?: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  isClosingConfirmationEnabled: boolean;
  HeaderColor?: string;
  BackgroundColor?: string;
  BottomBarColor?: string;
  onEvent(type: string, callback: () => void): void;
  offEvent(type: string, callback: () => void): void;
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;
  openLink(url: string, options?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(
    url: string,
    onClosed?: (status: 'paid' | 'cancelled' | 'failed') => void
  ): void;
  showAlert(message: string, onClose?: () => void): void;
  showConfirm(message: string, onResult?: (confirmed: boolean) => void): void;
  showPopup(params: {
    title?: string;
    message: string;
    buttons?: Array<{ id: string; text: string; type?: 'default' | 'destructive' | 'ok' | 'cancel' }>;
  }, callback?: (buttonId?: string) => void): void;
  showScanQrPopup(
    params: { text?: string },
    onClose?: (data?: string) => void
  ): void;
  closeScanQrPopup(): void;
  readTextFromClipboard(callback?: (text?: string) => void): void;
  requestWriteAccess(callback?: (allowed: boolean) => void): void;
  requestPhoneNumber(callback?: (allowed: boolean) => void): void;
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  CloudStorage: {
    getItem(key: string, callback?: (value?: string) => void): void;
    setItem(key: string, value: string, callback?: () => void): void;
    removeItem(key: string, callback?: () => void): void;
    getKeys(callback?: (keys?: string[]) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

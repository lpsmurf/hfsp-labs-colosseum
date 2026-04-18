/**
 * Telegram Web App SDK Wrapper
 * Provides a type-safe interface to the Telegram Mini App API
 */

import { TelegramWebApp } from '../types/telegram';

class TelegramAppService {
  private app: TelegramWebApp | null = null;

  /**
   * Initialize the Telegram Web App
   * Must be called before any other methods
   */
  init(): TelegramWebApp {
    if (!window.Telegram?.WebApp) {
      throw new Error('Telegram Web App SDK not loaded');
    }

    this.app = window.Telegram.WebApp;
    this.app.ready();

    // Enable vertical swipes for navigation
    this.app.expand();

    return this.app;
  }

  /**
   * Get the initialized Telegram app instance
   */
  getApp(): TelegramWebApp {
    if (!this.app) {
      throw new Error('Telegram Web App not initialized. Call init() first.');
    }
    return this.app;
  }

  /**
   * Get the current user info
   */
  getUser() {
    return this.getApp().initDataUnsafe.user;
  }

  /**
   * Get the full initData string (for authentication)
   */
  getInitData(): string {
    const app = this.getApp();
    // Try to get from initData property first (v6.0+)
    if ('initData' in app) {
      return (app as any).initData;
    }
    // Fallback to constructing from initDataUnsafe
    return this.constructInitData();
  }

  /**
   * Construct initData string from initDataUnsafe
   * Used for server-side validation when initData is not available
   */
  private constructInitData(): string {
    const app = this.getApp();
    const unsafe = app.initDataUnsafe;
    
    const parts: string[] = [];

    if (unsafe.user) {
      parts.push(`user=${encodeURIComponent(JSON.stringify(unsafe.user))}`);
    }
    if (unsafe.auth_date) {
      parts.push(`auth_date=${unsafe.auth_date}`);
    }
    if (unsafe.hash) {
      parts.push(`hash=${unsafe.hash}`);
    }

    return parts.join('&');
  }

  /**
   * Get theme colors
   */
  getThemeParams() {
    return this.getApp().themeParams;
  }

  /**
   * Check if the app is expanded
   */
  isExpanded(): boolean {
    return this.getApp().isExpanded;
  }

  /**
   * Expand the app to full height
   */
  expand(): void {
    this.getApp().expand();
  }

  /**
   * Close the app
   */
  close(): void {
    this.getApp().close();
  }

  /**
   * Show an alert dialog
   */
  showAlert(message: string): Promise<void> {
    return new Promise((resolve) => {
      this.getApp().showAlert(message, () => resolve());
    });
  }

  /**
   * Show a confirmation dialog
   */
  showConfirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.getApp().showConfirm(message, (ok) => resolve(ok));
    });
  }

  /**
   * Trigger haptic feedback
   */
  triggerHaptic(
    type: 'impactOccurred' | 'notificationOccurred' | 'selectionChanged',
    style?: string
  ): void {
    const haptic = this.getApp().HapticFeedback;
    if (!haptic) return;

    switch (type) {
      case 'impactOccurred':
        haptic.impactOccurred((style as any) || 'light');
        break;
      case 'notificationOccurred':
        haptic.notificationOccurred((style as any) || 'default');
        break;
      case 'selectionChanged':
        haptic.selectionChanged();
        break;
    }
  }

  /**
   * Open an external link
   */
  openLink(url: string, options?: { try_instant_view?: boolean }): void {
    this.getApp().openLink(url, options);
  }

  /**
   * Open a Telegram link
   */
  openTelegramLink(url: string): void {
    this.getApp().openTelegramLink(url);
  }

  /**
   * Send data back to the bot
   */
  sendData(data: string): void {
    this.getApp().sendData(data);
  }

  /**
   * Set the header color
   */
  setHeaderColor(color: string): void {
    (this.getApp() as any).setHeaderColor?.(color);
  }

  /**
   * Set the background color
   */
  setBackgroundColor(color: string): void {
    (this.getApp() as any).setBackgroundColor?.(color);
  }

  /**
   * Subscribe to theme changes
   */
  onThemeChanged(callback: () => void): void {
    this.getApp().onEvent('themeChanged', callback);
  }

  /**
   * Subscribe to viewport changes
   */
  onViewportChanged(callback: () => void): void {
    this.getApp().onEvent('viewportChanged', callback);
  }

  /**
   * Subscribe to main button clicks
   */
  onMainButtonClicked(callback: () => void): void {
    this.getApp().onEvent('mainButtonClicked', callback);
  }

  /**
   * Get the color scheme (light/dark)
   */
  getColorScheme(): 'light' | 'dark' {
    return this.getApp().colorScheme;
  }

  /**
   * Get platform info
   */
  getPlatform(): string {
    return this.getApp().platform;
  }

  /**
   * Check if running in headless mode
   */
  isHeadless(): boolean {
    return Boolean((this.getApp() as any).isHeadless);
  }
}

// Export singleton instance
export const telegramAppService = new TelegramAppService();
export default TelegramAppService;

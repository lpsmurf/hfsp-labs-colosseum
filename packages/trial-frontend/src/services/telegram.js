/**
 * Telegram Web App SDK Wrapper
 * Provides a type-safe interface to the Telegram Mini App API
 */
class TelegramAppService {
    constructor() {
        Object.defineProperty(this, "app", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
    }
    /**
     * Initialize the Telegram Web App
     * Must be called before any other methods
     */
    init() {
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
    getApp() {
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
    getInitData() {
        const app = this.getApp();
        // Try to get from initData property first (v6.0+)
        if ('initData' in app) {
            return app.initData;
        }
        // Fallback to constructing from initDataUnsafe
        return this.constructInitData();
    }
    /**
     * Construct initData string from initDataUnsafe
     * Used for server-side validation when initData is not available
     */
    constructInitData() {
        const app = this.getApp();
        const unsafe = app.initDataUnsafe;
        const parts = [];
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
    isExpanded() {
        return this.getApp().isExpanded;
    }
    /**
     * Expand the app to full height
     */
    expand() {
        this.getApp().expand();
    }
    /**
     * Close the app
     */
    close() {
        this.getApp().close();
    }
    /**
     * Show an alert dialog
     */
    showAlert(message) {
        return new Promise((resolve) => {
            this.getApp().showAlert(message, () => resolve());
        });
    }
    /**
     * Show a confirmation dialog
     */
    showConfirm(message) {
        return new Promise((resolve) => {
            this.getApp().showConfirm(message, (ok) => resolve(ok));
        });
    }
    /**
     * Trigger haptic feedback
     */
    triggerHaptic(type, style) {
        const haptic = this.getApp().HapticFeedback;
        if (!haptic)
            return;
        switch (type) {
            case 'impactOccurred':
                haptic.impactOccurred(style || 'light');
                break;
            case 'notificationOccurred':
                haptic.notificationOccurred(style || 'default');
                break;
            case 'selectionChanged':
                haptic.selectionChanged();
                break;
        }
    }
    /**
     * Open an external link
     */
    openLink(url, options) {
        this.getApp().openLink(url, options);
    }
    /**
     * Open a Telegram link
     */
    openTelegramLink(url) {
        this.getApp().openTelegramLink(url);
    }
    /**
     * Send data back to the bot
     */
    sendData(data) {
        this.getApp().sendData(data);
    }
    /**
     * Set the header color
     */
    setHeaderColor(color) {
        this.getApp().setHeaderColor?.(color);
    }
    /**
     * Set the background color
     */
    setBackgroundColor(color) {
        this.getApp().setBackgroundColor?.(color);
    }
    /**
     * Subscribe to theme changes
     */
    onThemeChanged(callback) {
        this.getApp().onEvent('themeChanged', callback);
    }
    /**
     * Subscribe to viewport changes
     */
    onViewportChanged(callback) {
        this.getApp().onEvent('viewportChanged', callback);
    }
    /**
     * Subscribe to main button clicks
     */
    onMainButtonClicked(callback) {
        this.getApp().onEvent('mainButtonClicked', callback);
    }
    /**
     * Get the color scheme (light/dark)
     */
    getColorScheme() {
        return this.getApp().colorScheme;
    }
    /**
     * Get platform info
     */
    getPlatform() {
        return this.getApp().platform;
    }
    /**
     * Check if running in headless mode
     */
    isHeadless() {
        return Boolean(this.getApp().isHeadless);
    }
}
// Export singleton instance
export const telegramAppService = new TelegramAppService();
export default TelegramAppService;

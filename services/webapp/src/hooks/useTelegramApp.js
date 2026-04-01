/**
 * React Hook for Telegram Web App Integration
 * Manages Telegram SDK initialization and user data
 */
import { useState, useEffect, useCallback } from 'react';
import { telegramAppService } from '../services/telegram';
export function useTelegramApp() {
    const [app, setApp] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [colorScheme, setColorScheme] = useState('light');
    const [isExpanded, setIsExpanded] = useState(false);
    useEffect(() => {
        try {
            const telegramApp = telegramAppService.init();
            setApp(telegramApp);
            setColorScheme(telegramApp.colorScheme);
            setIsExpanded(telegramApp.isExpanded);
            setIsReady(true);
            // Listen for theme changes
            telegramApp.onEvent('themeChanged', () => {
                setColorScheme(telegramApp.colorScheme);
            });
            // Listen for viewport changes
            telegramApp.onEvent('viewportChanged', ({ isStateStable, height }) => {
                setIsExpanded(isStateStable && height > 100);
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to initialize Telegram Web App';
            setError(message);
            console.error('Telegram App Init Error:', message);
        }
    }, []);
    const expand = useCallback(() => {
        if (app) {
            telegramAppService.expand();
            setIsExpanded(true);
        }
    }, [app]);
    const close = useCallback(() => {
        if (app) {
            telegramAppService.close();
        }
    }, [app]);
    const showAlert = useCallback((message) => {
        if (!app)
            return Promise.reject(new Error('App not initialized'));
        return telegramAppService.showAlert(message);
    }, [app]);
    const showConfirm = useCallback((message) => {
        if (!app)
            return Promise.reject(new Error('App not initialized'));
        return telegramAppService.showConfirm(message);
    }, [app]);
    const haptic = useCallback((type, style) => {
        if (app) {
            telegramAppService.triggerHaptic(type, style);
        }
    }, [app]);
    const openLink = useCallback((url) => {
        if (app) {
            telegramAppService.openLink(url);
        }
    }, [app]);
    const onThemeChanged = useCallback((callback) => {
        if (app) {
            telegramAppService.onThemeChanged(callback);
        }
    }, [app]);
    return {
        app,
        user: app?.initDataUnsafe.user || null,
        initData: app ? telegramAppService.getInitData() : null,
        colorScheme,
        isExpanded,
        isReady,
        error,
        expand,
        close,
        showAlert,
        showConfirm,
        haptic,
        openLink,
        onThemeChanged,
    };
}
export default useTelegramApp;

import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Toast Notification Component
 */
import React, { useEffect } from 'react';
const Toast = ({ id, type, message, duration = 4000, onClose }) => {
    useEffect(() => {
        if (duration > 0) {
            const timer = setTimeout(() => onClose(id), duration);
            return () => clearTimeout(timer);
        }
    }, [id, duration, onClose]);
    const typeClasses = {
        success: 'bg-green-100 border-green-400 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-200',
        error: 'bg-red-100 border-red-400 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-200',
        info: 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200',
        warning: 'bg-yellow-100 border-yellow-400 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200',
    };
    const iconClass = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠',
    };
    return (_jsxs("div", { className: `border-l-4 p-4 mb-3 rounded flex items-start ${typeClasses[type]}`, children: [_jsx("span", { className: "text-xl mr-3 font-bold", children: iconClass[type] }), _jsx("p", { className: "flex-1", children: message }), _jsx("button", { onClick: () => onClose(id), className: "text-current opacity-70 hover:opacity-100 transition-opacity ml-2", children: "\u2715" })] }));
};
export const ToastContainer = ({ toasts, onClose }) => {
    return (_jsx("div", { className: "fixed bottom-4 right-4 z-40 max-w-sm", children: toasts.map((toast) => (_jsx(Toast, { ...toast, onClose: onClose }, toast.id))) }));
};
/**
 * Hook for toast management
 */
export function useToast() {
    const [toasts, setToasts] = React.useState([]);
    const addToast = React.useCallback((type, message, duration) => {
        const id = `toast-${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, type, message, duration }]);
        return id;
    }, []);
    const removeToast = React.useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);
    const success = React.useCallback((message, duration) => addToast('success', message, duration), [addToast]);
    const error = React.useCallback((message, duration) => addToast('error', message, duration), [addToast]);
    const info = React.useCallback((message, duration) => addToast('info', message, duration), [addToast]);
    const warning = React.useCallback((message, duration) => addToast('warning', message, duration), [addToast]);
    return { toasts, addToast, removeToast, success, error, info, warning };
}
export default Toast;

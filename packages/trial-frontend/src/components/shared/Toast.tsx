/**
 * Toast Notification Component
 */

import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface ToastProps extends ToastMessage {
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ id, type, message, duration = 4000, onClose }) => {
  useEffect(() => {
    if (duration && duration > 0) {
      const timer = setTimeout(() => onClose(id), duration);
      return () => clearTimeout(timer);
    }
    return undefined;
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

  return (
    <div className={`border-l-4 p-4 mb-3 rounded flex items-start ${typeClasses[type]}`}>
      <span className="text-xl mr-3 font-bold">{iconClass[type]}</span>
      <p className="flex-1">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="text-current opacity-70 hover:opacity-100 transition-opacity ml-2"
      >
        ✕
      </button>
    </div>
  );
};

/**
 * Toast Container - manages multiple toast notifications
 */
interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  );
};

/**
 * Hook for toast management
 */
export function useToast() {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const addToast = React.useCallback((type: ToastMessage['type'], message: string, duration?: number) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message, duration }]);
    return id;
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = React.useCallback((message: string, duration?: number) => addToast('success', message, duration), [addToast]);
  const error = React.useCallback((message: string, duration?: number) => addToast('error', message, duration), [addToast]);
  const info = React.useCallback((message: string, duration?: number) => addToast('info', message, duration), [addToast]);
  const warning = React.useCallback((message: string, duration?: number) => addToast('warning', message, duration), [addToast]);

  return { toasts, addToast, removeToast, success, error, info, warning };
}

export default Toast;

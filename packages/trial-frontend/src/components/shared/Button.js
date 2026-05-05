import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Reusable Button Component
 */
import React from 'react';
const Button = React.forwardRef(({ variant = 'primary', size = 'md', isLoading = false, fullWidth = false, className = '', ...props }, ref) => {
    const variantClasses = {
        primary: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600',
        secondary: 'bg-gray-200 hover:bg-gray-300 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white',
        danger: 'bg-red-600 hover:bg-red-700 text-white dark:bg-red-500 dark:hover:bg-red-600',
        ghost: 'bg-transparent hover:bg-gray-100 text-gray-900 dark:hover:bg-gray-800 dark:text-white',
    };
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
    };
    return (_jsx("button", { ref: ref, disabled: isLoading || props.disabled, className: `
          inline-flex items-center justify-center rounded-lg font-medium
          transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant]} ${sizeClasses[size]}
          ${fullWidth ? 'w-full' : ''} ${isLoading ? 'opacity-75 cursor-wait' : ''}
          ${className}
        `, ...props, children: isLoading ? (_jsxs(_Fragment, { children: [_jsx("span", { className: "inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" }), "Loading..."] })) : (props.children) }));
});
Button.displayName = 'Button';
export default Button;

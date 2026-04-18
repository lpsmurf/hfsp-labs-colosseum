import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Reusable Input Component
 */
import React from 'react';
const Input = React.forwardRef(({ label, error, helperText, className = '', ...props }, ref) => {
    return (_jsxs("div", { className: "w-full", children: [label && (_jsxs("label", { htmlFor: props.id, className: "block text-sm font-medium text-gray-900 dark:text-white mb-2", children: [label, props.required && _jsx("span", { className: "text-red-600 ml-1", children: "*" })] })), _jsx("input", { ref: ref, className: `
            w-full px-4 py-2 rounded-lg border-2 transition-colors
            bg-white dark:bg-gray-800 text-gray-900 dark:text-white
            placeholder-gray-400 dark:placeholder-gray-500
            border-gray-300 dark:border-gray-600
            focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
            ${error ? 'border-red-500 dark:border-red-400' : ''}
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `, ...props }), error && _jsx("p", { className: "mt-1 text-sm text-red-600 dark:text-red-400", children: error }), helperText && !error && _jsx("p", { className: "mt-1 text-sm text-gray-500 dark:text-gray-400", children: helperText })] }));
});
Input.displayName = 'Input';
export default Input;

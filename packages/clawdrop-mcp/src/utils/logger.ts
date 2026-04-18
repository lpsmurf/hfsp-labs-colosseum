import pino from 'pino';

const logLevel = process.env.LOG_LEVEL || 'info';

// Fields that should NEVER appear in logs — values are redacted automatically
const SENSITIVE_FIELDS = new Set([
  'private_key', 'privatekey', 'secret_key', 'secretkey',
  'wallet_private_key', 'api_key', 'apikey',
  'password', 'seed', 'mnemonic', 'authorization',
]);

function redactValue(val: string): string {
  if (val.length < 12) return '***';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

function sanitize(obj: unknown, seen = new WeakSet()): unknown {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  
  // Check for circular references
  if (seen.has(obj)) {
    return '[Circular]';
  }
  seen.add(obj);
  
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = typeof value === 'string' ? redactValue(value) : '***';
    } else {
      result[key] = sanitize(value, seen);
    }
  }
  return result;
}

const isMCPMode = process.env.CLAWDROP_MODE === 'mcp';

// MCP mode: logs go to stderr so stdout stays clean for MCP JSON protocol
const transport = pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'SYS:standard',
    ignore: 'pid,hostname',
    ...(isMCPMode ? { destination: 2 } : {}),
  },
});

const baseLogger = pino({ level: logLevel }, transport);

// Proxy that sanitizes the first argument before passing to pino
type LogFn = (obj: unknown, msg?: string, ...args: unknown[]) => void;
function wrapMethod(fn: LogFn): LogFn {
  return (obj: unknown, msg?: string, ...args: unknown[]) => {
    fn(sanitize(obj), msg, ...args);
  };
}

export const logger = {
  trace: wrapMethod(baseLogger.trace.bind(baseLogger)),
  debug: wrapMethod(baseLogger.debug.bind(baseLogger)),
  info:  wrapMethod(baseLogger.info.bind(baseLogger)),
  warn:  wrapMethod(baseLogger.warn.bind(baseLogger)),
  error: wrapMethod(baseLogger.error.bind(baseLogger)),
  fatal: wrapMethod(baseLogger.fatal.bind(baseLogger)),
};

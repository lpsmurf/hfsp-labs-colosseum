// Structured logging utility
import pino from "pino";

export function createLogger() {
  const level = process.env.LOG_LEVEL || (process.env.DEBUG === "true" ? "debug" : "info");

  // Simple JSON logging (works in both dev and production)
  return pino({
    level,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

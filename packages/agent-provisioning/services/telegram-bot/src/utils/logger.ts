// [OPENAI] Structured logging utility
import pino from "pino";

export function createLogger() {
  const isDev = process.env.NODE_ENV !== "production";
  const level = process.env.LOG_LEVEL || (process.env.DEBUG === "true" ? "debug" : "info");

  if (isDev) {
    // Use pretty printing in development
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  } else {
    // Use JSON logging in production
    return pino({
      level,
    });
  }
}

export type Logger = ReturnType<typeof createLogger>;

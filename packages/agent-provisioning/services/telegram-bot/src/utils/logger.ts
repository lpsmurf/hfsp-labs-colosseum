// [OPENAI] Structured logging utility
import pino from "pino";

export function createLogger() {
  return pino({
    level: process.env.LOG_LEVEL || process.env.DEBUG === "true" ? "debug" : "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;

/** Minimal structured logger (no external deps). */
type Fields = Record<string, unknown>;
const ts = () => new Date().toISOString();
function emit(level: string, msg: string, f?: Fields) {
  const base = `${ts()} ${level.toUpperCase()} ${msg}`;
  console.log(f && Object.keys(f).length ? `${base} ${JSON.stringify(f)}` : base);
}
export const log = {
  info: (msg: string, f?: Fields) => emit("info", msg, f),
  warn: (msg: string, f?: Fields) => emit("warn", msg, f),
  error: (msg: string, f?: Fields) => emit("error", msg, f),
};

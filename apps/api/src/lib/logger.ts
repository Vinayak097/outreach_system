type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const minLevel: Level = (process.env.LOG_LEVEL as Level) || "info";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < order[minLevel]) return;
  const line = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") process.stderr.write(serialized + "\n");
  else process.stdout.write(serialized + "\n");
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};

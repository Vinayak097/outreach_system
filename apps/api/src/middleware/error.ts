import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "validation_error", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, details: err.details });
  }
  const message = err instanceof Error ? err.message : String(err);
  logger.error("unhandled error", { message, stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({ error: "internal_error" });
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

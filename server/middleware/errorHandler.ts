import type { NextFunction, Request, Response } from "express";
import { logger } from "../logger.js";

interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
}

// Express 5 recognizes this as an error handler by its 4-argument arity —
// keep all four params even though `_next` is unused.
export function errorHandler(
  err: ErrorWithStatus,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  logger.error({ err, path: req.path }, "Unhandled request error");
  const status = err.status ?? err.statusCode ?? 500;
  // 4xx messages come from our own body-parser/Zod validation code and are
  // safe to surface; 5xx messages are uncaught exceptions and may leak
  // implementation details, so those always get a fixed generic string.
  const message = status < 500 ? err.message : "Internal server error";
  res.status(status).json({
    data: null,
    error: message,
    meta: null,
  });
}

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = res.locals.requestId as string | undefined;

  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
      requestId
    }
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId as string | undefined;
  const jobId = res.locals.jobId as string | undefined;
  const contextualLogger = logger.withContext({ requestId, jobId });

  if (err instanceof AppError) {
    contextualLogger.warn(err.message, {
      code: err.code,
      details: err.details
    });

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
        details: err.details
      }
    });
    return;
  }

  contextualLogger.error('Unhandled error', { err });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      requestId
    }
  });
}

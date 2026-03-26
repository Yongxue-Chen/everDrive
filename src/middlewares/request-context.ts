import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') ?? randomUUID();
  const jobId = req.header('x-job-id') ?? undefined;

  res.locals.requestId = requestId;
  res.locals.jobId = jobId;
  res.setHeader('x-request-id', requestId);
  next();
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { pinoHttp } from 'pino-http';
import { rawLogger } from './logger.js';

export const httpLogger = pinoHttp({
  logger: rawLogger,
  genReqId: (req) => req.headers['x-request-id']?.toString() ?? crypto.randomUUID(),
  customProps: (req) => ({
    requestId: req.id,
    jobId: req.headers['x-job-id']?.toString()
  }),
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
    `${req.method} ${req.url} -> ${res.statusCode}`,
  customErrorMessage: (req: IncomingMessage, res: ServerResponse, err: Error) =>
    `${req.method} ${req.url} -> ${res.statusCode}: ${err.message}`
});

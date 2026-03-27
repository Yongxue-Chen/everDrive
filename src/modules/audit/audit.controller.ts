import { OperationType, TargetType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { AuditService } from './audit.service.js';

const QuerySchema = z.object({
  operationType: z.nativeEnum(OperationType).optional(),
  targetType: z.nativeEnum(TargetType).optional(),
  targetId: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export function createAuditRouter(service: AuditService): Router {
  const router = Router();

  router.get(
    '/api/audit/logs',
    asyncHandler(async (req, res) => {
      const query = parseOrBadRequest(QuerySchema, req.query, { message: 'Invalid query payload' });

      const data = await service.query({
        operationType: query.operationType,
        targetType: query.targetType,
        targetId: query.targetId ? BigInt(query.targetId) : undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        limit: query.limit
      });

      res.status(200).json(data);
    })
  );

  return router;
}

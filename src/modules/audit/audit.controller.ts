import { OperationType, TargetType } from '@prisma/client';
import { Router } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
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

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid query payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createAuditRouter(service: AuditService): Router {
  const router = Router();

  router.get(
    '/api/audit/logs',
    asyncHandler(async (req, res) => {
      let query: ReturnType<typeof QuerySchema.parse>;
      try {
        query = QuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

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

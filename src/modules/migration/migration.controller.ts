import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { MigrationService } from './migration.service.js';

const MigrationSchema = z.object({
  sourceRemoteId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  targetRemoteId: z.union([z.string().regex(/^\d+$/), z.number().int().positive()]),
  scopeRelativePath: z.string().optional(),
  targetBasePath: z.string().optional(),
  removeSourceReplica: z.boolean().optional()
});

function toBigInt(value: string | number): bigint {
  return typeof value === 'number' ? BigInt(value) : BigInt(value);
}

export function createMigrationRouter(_service: MigrationService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/migration',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const body = parseOrBadRequest(MigrationSchema, req.body ?? {});

      const sourceRemoteId = toBigInt(body.sourceRemoteId);
      const targetRemoteId = toBigInt(body.targetRemoteId);
      const job = queue.enqueue({
        kind: 'migrate',
        lane: 'long',
        mappingTaskId: taskId,
        remoteIds: [sourceRemoteId, targetRemoteId],
        payload: {
          sourceRemoteId: sourceRemoteId.toString(),
          targetRemoteId: targetRemoteId.toString(),
          scopeRelativePath: body.scopeRelativePath ?? null,
          targetBasePath: body.targetBasePath ?? null,
          removeSourceReplica: Boolean(body.removeSourceReplica)
        }
      });

      res.status(202).json({ job });
    })
  );

  return router;
}

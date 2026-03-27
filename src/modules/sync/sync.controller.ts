import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { SyncOrchestrationService } from './sync-orchestration.service.js';

const SyncOptionsSchema = z.object({
  deleteGraceSeconds: z.number().int().min(0).max(86400).optional(),
  renameHintWindowSeconds: z.number().int().min(1).max(86400).optional()
});

export function createSyncRouter(service: SyncOrchestrationService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/sync/plan',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      const body = parseOrBadRequest(SyncOptionsSchema, req.body ?? {});

      const plan = await service.createPlan(taskId, body);
      res.status(200).json({ plan });
    })
  );

  router.post(
    '/api/mapping-tasks/:taskId/sync/execute',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const body = parseOrBadRequest(SyncOptionsSchema, req.body ?? {});

      const job = queue.enqueue({
        kind: 'sync',
        lane: 'long',
        mappingTaskId: taskId,
        payload: body
      });
      res.status(202).json({ job });
    })
  );

  return router;
}

import { Router } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { SyncOrchestrationService } from './sync-orchestration.service.js';

const SyncOptionsSchema = z.object({
  deleteGraceSeconds: z.number().int().min(0).max(86400).optional(),
  renameHintWindowSeconds: z.number().int().min(1).max(86400).optional()
});

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid request payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createSyncRouter(service: SyncOrchestrationService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/sync/plan',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      let body: ReturnType<typeof SyncOptionsSchema.parse>;
      try {
        body = SyncOptionsSchema.parse(req.body ?? {});
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const plan = await service.createPlan(taskId, body);
      res.status(200).json({ plan });
    })
  );

  router.post(
    '/api/mapping-tasks/:taskId/sync/execute',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      let body: ReturnType<typeof SyncOptionsSchema.parse>;
      try {
        body = SyncOptionsSchema.parse(req.body ?? {});
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

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

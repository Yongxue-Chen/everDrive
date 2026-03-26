import { Router } from 'express';
import { z, ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { RenameDetectService } from './rename-detect.service.js';

const DetectRenameSchema = z.object({
  candidateWindowSeconds: z.number().int().min(1).max(600).optional()
});

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid request payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createRenameDetectRouter(_service: RenameDetectService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/detect-renames',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      let body: ReturnType<typeof DetectRenameSchema.parse>;
      try {
        body = DetectRenameSchema.parse(req.body ?? {});
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const job = queue.enqueue({
        kind: 'rename_detect',
        lane: 'long',
        mappingTaskId: taskId,
        payload: {
          candidateWindowSeconds: body.candidateWindowSeconds ?? 5
        }
      });
      res.status(202).json({ job });
    })
  );

  return router;
}

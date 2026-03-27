import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { RenameDetectService } from './rename-detect.service.js';

const DetectRenameSchema = z.object({
  candidateWindowSeconds: z.number().int().min(1).max(600).optional()
});

export function createRenameDetectRouter(_service: RenameDetectService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/detect-renames',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      const body = parseOrBadRequest(DetectRenameSchema, req.body ?? {});

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

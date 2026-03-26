import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { ScanService } from './scan.service.js';

export function createScanRouter(_service: ScanService, queue: JobQueueService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks/:taskId/scan',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const job = queue.enqueue({
        kind: 'scan',
        lane: 'long',
        mappingTaskId: taskId
      });
      res.status(202).json({ job });
    })
  );

  return router;
}

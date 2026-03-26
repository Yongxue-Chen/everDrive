import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { JobQueueService } from './job-queue.service.js';

export function createJobQueueRouter(queue: JobQueueService): Router {
  const router = Router();

  router.get(
    '/api/jobs/:jobId',
    asyncHandler(async (req, res) => {
      const job = queue.getJobOrThrow(req.params.jobId);
      res.status(200).json({ job });
    })
  );

  router.post(
    '/api/jobs/:jobId/cancel',
    asyncHandler(async (req, res) => {
      const job = queue.cancelQueuedJob(req.params.jobId);
      res.status(200).json({ job });
    })
  );

  return router;
}

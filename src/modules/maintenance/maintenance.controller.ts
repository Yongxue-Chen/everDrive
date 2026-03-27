import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { AuditService } from '../audit/audit.service.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';

export function createMaintenanceRouter(queue: JobQueueService, auditService?: AuditService): Router {
  const router = Router();

  router.post(
    '/api/maintenance/cloud-trash/cleanup',
    asyncHandler(async (_req, res) => {
      const job = queue.enqueueUnique({
        kind: 'cloud_trash_cleanup',
        lane: 'short'
      });

      await auditService?.write({
        operationType: 'update',
        targetType: 'sync_job',
        message: 'Manual cloud trash cleanup enqueued',
        metadataJson: {
          jobId: job.id
        }
      });

      res.status(202).json({ job });
    })
  );

  return router;
}

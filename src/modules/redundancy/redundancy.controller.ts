import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseTaskId } from '../mapping-task/mapping-task.dto.js';
import { RedundancyRecoveryService } from './redundancy-recovery.service.js';
import { RedundancyViewService } from './redundancy-view.service.js';

export function createRedundancyRouter(viewService: RedundancyViewService, recoveryService: RedundancyRecoveryService): Router {
  const router = Router();

  router.get(
    '/api/mapping-tasks/:taskId/redundancy',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const item = await viewService.getTaskOverview(taskId);
      res.status(200).json({ item });
    })
  );

  router.post(
    '/api/mapping-tasks/:taskId/redundancy/retry-failed',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const summary = await recoveryService.retryFailedReplicas(taskId);
      res.status(200).json({ summary });
    })
  );

  return router;
}

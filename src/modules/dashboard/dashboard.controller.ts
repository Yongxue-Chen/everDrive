import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { DashboardService } from './dashboard.service.js';

export function createDashboardRouter(service: DashboardService): Router {
  const router = Router();

  router.get(
    '/api/dashboard/workspaces',
    asyncHandler(async (_req, res) => {
      const data = await service.getWorkspaceView();
      res.status(200).json(data);
    })
  );

  router.get(
    '/api/dashboard/remotes',
    asyncHandler(async (_req, res) => {
      const data = await service.getCloudView();
      res.status(200).json(data);
    })
  );

  return router;
}

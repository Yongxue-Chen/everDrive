import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { MetricsService } from './metrics.service.js';

export function createMetricsRouter(service: MetricsService): Router {
  const router = Router();

  router.get(
    '/api/metrics/overview',
    asyncHandler(async (_req, res) => {
      const metrics = await service.getOverview();
      res.status(200).json({ metrics });
    })
  );

  return router;
}

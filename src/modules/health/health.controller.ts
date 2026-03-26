import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';

type HealthDeps = {
  checkDb: () => Promise<boolean>;
  checkRclone: () => Promise<boolean>;
};

export function createHealthRouter(deps: HealthDeps): Router {
  const router = Router();

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const [db, rclone] = await Promise.all([deps.checkDb(), deps.checkRclone()]);
      const overall = db && rclone ? 'healthy' : 'degraded';

      res.status(200).json({
        status: overall,
        checks: {
          mysql: db,
          rcloneRcd: rclone
        },
        timestamp: new Date().toISOString()
      });
    })
  );

  router.get(
    '/ready',
    asyncHandler(async (_req, res) => {
      const [db, rclone] = await Promise.all([deps.checkDb(), deps.checkRclone()]);
      const ready = db && rclone;

      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks: {
          mysql: db,
          rcloneRcd: rclone
        },
        timestamp: new Date().toISOString()
      });
    })
  );

  return router;
}

import express from 'express';
import type { Router } from 'express';
import { httpLogger } from '../lib/http-logger.js';
import { requestContextMiddleware } from '../middlewares/request-context.js';
import { errorHandler, notFoundHandler } from '../middlewares/error-handler.js';
import { createHealthRouter } from '../modules/health/health.controller.js';

type CreateAppDeps = {
  checkDb: () => Promise<boolean>;
  checkRclone: () => Promise<boolean>;
  remoteRouter?: Router;
  mappingTaskRouter?: Router;
  scanRouter?: Router;
  renameDetectRouter?: Router;
  syncRouter?: Router;
  redundancyRouter?: Router;
  migrationRouter?: Router;
  jobQueueRouter?: Router;
  dashboardRouter?: Router;
  settingsRouter?: Router;
  auditRouter?: Router;
  metricsRouter?: Router;
};

export function createApp(deps: CreateAppDeps) {
  const app = express();

  app.use(express.json());
  app.use(requestContextMiddleware);
  app.use(httpLogger);

  app.get('/', (_req, res) => {
    res.json({
      service: 'everDrive-backend',
      message: 'everDrive backend scaffold is running'
    });
  });

  app.use(createHealthRouter(deps));
  app.use(deps.remoteRouter ?? express.Router());
  app.use(deps.mappingTaskRouter ?? express.Router());
  app.use(deps.scanRouter ?? express.Router());
  app.use(deps.renameDetectRouter ?? express.Router());
  app.use(deps.syncRouter ?? express.Router());
  app.use(deps.redundancyRouter ?? express.Router());
  app.use(deps.migrationRouter ?? express.Router());
  app.use(deps.jobQueueRouter ?? express.Router());
  app.use(deps.dashboardRouter ?? express.Router());
  app.use(deps.settingsRouter ?? express.Router());
  app.use(deps.auditRouter ?? express.Router());
  app.use(deps.metricsRouter ?? express.Router());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

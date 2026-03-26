import { Router } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { AuditService } from '../audit/audit.service.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { CloudInventoryService } from './cloud-inventory.service.js';
import { parseRemoteId, toBigInt, UpdateRemoteActiveSchema, UpdateRemoteCapacitySchema } from './remote.dto.js';

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid request payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createRemoteRouter(service: CloudInventoryService, queue: JobQueueService, auditService?: AuditService): Router {
  const router = Router();

  router.post(
    '/api/remotes/sync',
    asyncHandler(async (_req, res) => {
      const summary = await service.syncRemotes();
      await auditService?.write({
        operationType: 'sync',
        targetType: 'remote',
        message: 'Remote inventory sync completed',
        metadataJson: summary as unknown as any
      });
      res.status(200).json({
        summary
      });
    })
  );

  router.post(
    '/api/remotes/stats/refresh',
    asyncHandler(async (_req, res) => {
      const job = queue.enqueue({
        kind: 'remote_stats_refresh',
        lane: 'short'
      });
      res.status(202).json({ job });
    })
  );

  router.get(
    '/api/remotes',
    asyncHandler(async (_req, res) => {
      const items = await service.listRemoteCards();
      res.status(200).json({
        items
      });
    })
  );

  router.get(
    '/api/remotes/:remoteId',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);
      const item = await service.getRemoteCard(remoteId);
      res.status(200).json({ item });
    })
  );

  router.patch(
    '/api/remotes/:remoteId/capacity',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);

      let body: ReturnType<typeof UpdateRemoteCapacitySchema.parse>;
      try {
        body = UpdateRemoteCapacitySchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const item = await service.updateRemoteCapacity(remoteId, {
        totalCapacity: toBigInt(body.totalCapacity),
        reservedCapacity: toBigInt(body.reservedCapacity),
        warningThresholdPercent: body.warningThresholdPercent
      });

      res.status(200).json({ item });
    })
  );

  router.patch(
    '/api/remotes/:remoteId/active',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);

      let body: ReturnType<typeof UpdateRemoteActiveSchema.parse>;
      try {
        body = UpdateRemoteActiveSchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const item = await service.setRemoteActive(remoteId, body.isActive);
      res.status(200).json({ item });
    })
  );

  return router;
}

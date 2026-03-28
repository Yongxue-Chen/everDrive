import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { AuditService } from '../audit/audit.service.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import { CloudInventoryService } from './cloud-inventory.service.js';
import {
  CreateRemoteSchema,
  parseRemoteId,
  toBigInt,
  UpdateRemoteActiveSchema,
  UpdateRemoteCapacitySchema,
  UpdateRemoteSettingsSchema
} from './remote.dto.js';

export function createRemoteRouter(service: CloudInventoryService, queue: JobQueueService, auditService?: AuditService): Router {
  const router = Router();

  router.post(
    '/api/remotes',
    asyncHandler(async (req, res) => {
      const body = parseOrBadRequest(CreateRemoteSchema, req.body);
      const item = await service.createRemote({
        displayName: body.displayName,
        remoteName: body.remoteName,
        totalCapacity: toBigInt(body.totalCapacity),
        reservedCapacity: toBigInt(body.reservedCapacity),
        warningThresholdPercent: body.warningThresholdPercent,
        cloudTrashEnabled: body.cloudTrashEnabled,
        cloudTrashBasePath: body.cloudTrashBasePath,
        remoteRootPath: body.remoteRootPath
      });
      await auditService?.write({
        operationType: 'create',
        targetType: 'remote',
        message: `Business remote created: ${body.displayName}`,
        metadataJson: { remoteName: body.remoteName } as unknown as any
      });
      res.status(201).json({ item });
    })
  );

  router.get(
    '/api/remotes/rclone-options',
    asyncHandler(async (_req, res) => {
      const items = await service.listRcloneRemoteOptions();
      res.status(200).json({ items });
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
    '/api/remotes/:remoteId',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);

      const body = parseOrBadRequest(UpdateRemoteSettingsSchema, req.body);

      const item = await service.updateRemoteSettings(remoteId, {
        displayName: body.displayName,
        remoteName: body.remoteName,
        totalCapacity: toBigInt(body.totalCapacity),
        reservedCapacity: toBigInt(body.reservedCapacity),
        warningThresholdPercent: body.warningThresholdPercent,
        cloudTrashEnabled: body.cloudTrashEnabled,
        cloudTrashBasePath: body.cloudTrashBasePath,
        remoteRootPath: body.remoteRootPath
      });

      res.status(200).json({ item });
    })
  );

  router.patch(
    '/api/remotes/:remoteId/capacity',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);

      const body = parseOrBadRequest(UpdateRemoteCapacitySchema, req.body);

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

      const body = parseOrBadRequest(UpdateRemoteActiveSchema, req.body);

      const item = await service.setRemoteActive(remoteId, body.isActive);
      res.status(200).json({ item });
    })
  );

  router.delete(
    '/api/remotes/:remoteId',
    asyncHandler(async (req, res) => {
      const remoteId = parseRemoteId(req.params.remoteId);
      await service.deleteRemote(remoteId);
      await auditService?.write({
        operationType: 'delete',
        targetType: 'remote',
        targetId: remoteId,
        message: `Business remote deleted: ${remoteId.toString()}`
      });
      res.status(200).json({ deleted: true });
    })
  );

  return router;
}

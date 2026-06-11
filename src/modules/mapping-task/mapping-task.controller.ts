import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { AuditService } from '../audit/audit.service.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import {
  CreateMappingTaskSchema,
  DeleteTaskQuerySchema,
  MappingTaskListQuerySchema,
  SetTaskActiveSchema,
  UpdateMappingTaskSchema,
  parseTaskId,
  toBigInt
} from './mapping-task.dto.js';
import { MappingTaskService } from './mapping-task.service.js';
import type { RcloneSourceService } from '../source/rclone-source.service.js';

export function createMappingTaskRouter(service: MappingTaskService, queue: JobQueueService, auditService?: AuditService, sourceService?: RcloneSourceService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks',
    asyncHandler(async (req, res) => {
      const body = parseOrBadRequest(CreateMappingTaskSchema, req.body);
      if ((body.sourceType === 'rclone' || body.sourceRemoteName) && body.sourceRemoteName) await sourceService?.test(body.sourceRemoteName, body.sourcePath ?? '');

      const item = await service.createTask({
        name: body.name,
        localPath: body.localPath,
        sourceType: body.sourceType,
        sourceRemoteName: body.sourceRemoteName,
        sourcePath: body.sourcePath,
        syncMode: body.syncMode,
        encryptionEnabled: body.encryptionEnabled,
        redundancyEnabled: body.redundancyEnabled,
        splitEnabled: body.splitEnabled,
        expectedDataSizeBytes: toBigInt(body.expectedDataSizeBytes),
        remoteBindings: body.remoteBindings.map((binding) => ({
          remoteId: toBigInt(binding.remoteId)!,
          priority: binding.priority,
          remoteBasePath: binding.remoteBasePath
        }))
      });

      await auditService?.write({
        operationType: 'create',
        targetType: 'mapping_task',
        targetId: BigInt(item.id),
        message: 'Mapping task created',
        metadataJson: {
          mappingTaskId: item.id,
          name: item.name,
          localPath: item.local_path
        }
      });

      res.status(201).json({ item });
    })
  );

  router.get(
    '/api/mapping-tasks',
    asyncHandler(async (req, res) => {
      const query = parseOrBadRequest(MappingTaskListQuerySchema, req.query, { message: 'Invalid query payload' });

      const items = await service.listTasks({
        status: query.status,
        includeDeleted: query.includeDeleted
      });

      res.status(200).json({ items });
    })
  );

  router.get(
    '/api/mapping-tasks/:taskId',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const includeDeleted = req.query.includeDeleted === 'true';
      const item = await service.getTaskDetail(taskId, { includeDeleted });
      res.status(200).json({ item });
    })
  );

  router.patch(
    '/api/mapping-tasks/:taskId',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      const body = parseOrBadRequest(UpdateMappingTaskSchema, req.body);
      if ((body.sourceType === 'rclone' || body.sourceRemoteName) && body.sourceRemoteName) await sourceService?.test(body.sourceRemoteName, body.sourcePath ?? '');

      const item = await service.updateTask(taskId, {
        name: body.name,
        localPath: body.localPath,
        sourceType: body.sourceType,
        sourceRemoteName: body.sourceRemoteName,
        sourcePath: body.sourcePath,
        syncMode: body.syncMode,
        encryptionEnabled: body.encryptionEnabled,
        redundancyEnabled: body.redundancyEnabled,
        splitEnabled: body.splitEnabled,
        expectedDataSizeBytes: toBigInt(body.expectedDataSizeBytes),
        remoteBindings: body.remoteBindings?.map((binding) => ({
          remoteId: toBigInt(binding.remoteId)!,
          priority: binding.priority,
          remoteBasePath: binding.remoteBasePath
        }))
      });

      await auditService?.write({
        operationType: 'update',
        targetType: 'mapping_task',
        targetId: taskId,
        message: 'Mapping task updated',
        metadataJson: {
          mappingTaskId: taskId.toString()
        }
      });

      res.status(200).json({ item });
    })
  );

  router.patch(
    '/api/mapping-tasks/:taskId/active',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);

      const body = parseOrBadRequest(SetTaskActiveSchema, req.body);

      const item = await service.setTaskActive(taskId, body.isActive);
      await auditService?.write({
        operationType: 'update',
        targetType: 'mapping_task',
        targetId: taskId,
        message: `Mapping task active state changed to ${body.isActive}`,
        metadataJson: {
          mappingTaskId: taskId.toString(),
          isActive: body.isActive
        }
      });
      res.status(200).json({ item });
    })
  );

  router.post(
    '/api/mapping-tasks/:taskId/run-sync',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      await service.getTaskDetail(taskId);

      const jobs = [
        queue.enqueue({ kind: 'scan', lane: 'long', mappingTaskId: taskId }),
        queue.enqueue({ kind: 'rename_detect', lane: 'long', mappingTaskId: taskId, payload: { candidateWindowSeconds: 30 } }),
        queue.enqueue({
          kind: 'sync',
          lane: 'long',
          mappingTaskId: taskId,
          payload: { deleteGraceSeconds: 30, renameHintWindowSeconds: 3600 }
        })
      ];

      await auditService?.write({
        operationType: 'sync',
        targetType: 'mapping_task',
        targetId: taskId,
        message: 'Manual sync sequence enqueued',
        metadataJson: {
          mappingTaskId: taskId.toString(),
          jobs: jobs.map((job) => ({ id: job.id, kind: job.kind }))
        }
      });

      res.status(202).json({ jobs });
    })
  );

  router.delete(
    '/api/mapping-tasks/:taskId',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      const query = parseOrBadRequest(DeleteTaskQuerySchema, req.query, { message: 'Invalid query payload' });

      const item = await service.deleteTask(taskId, { hardDelete: query.hardDelete });
      await auditService?.write({
        operationType: 'delete',
        targetType: 'mapping_task',
        targetId: taskId,
        message: query.hardDelete ? 'Mapping task hard deleted' : 'Mapping task soft deleted',
        metadataJson: {
          mappingTaskId: taskId.toString(),
          hardDelete: Boolean(query.hardDelete)
        }
      });
      res.status(200).json({
        item,
        deleted: true,
        hardDelete: Boolean(query.hardDelete)
      });
    })
  );

  return router;
}

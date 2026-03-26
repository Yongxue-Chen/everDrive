import { Router } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { AuditService } from '../audit/audit.service.js';
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

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid request payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createMappingTaskRouter(service: MappingTaskService, auditService?: AuditService): Router {
  const router = Router();

  router.post(
    '/api/mapping-tasks',
    asyncHandler(async (req, res) => {
      let body: ReturnType<typeof CreateMappingTaskSchema.parse>;
      try {
        body = CreateMappingTaskSchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const item = await service.createTask({
        name: body.name,
        localPath: body.localPath,
        syncMode: body.syncMode,
        encryptionEnabled: body.encryptionEnabled,
        redundancyEnabled: body.redundancyEnabled,
        splitEnabled: body.splitEnabled,
        expectedDataSizeBytes: toBigInt(body.expectedDataSizeBytes),
        remoteBindings: body.remoteBindings.map((binding) => ({
          remoteId: toBigInt(binding.remoteId)!,
          priority: binding.priority
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
      let query: ReturnType<typeof MappingTaskListQuerySchema.parse>;
      try {
        query = MappingTaskListQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

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

      let body: ReturnType<typeof UpdateMappingTaskSchema.parse>;
      try {
        body = UpdateMappingTaskSchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const item = await service.updateTask(taskId, {
        name: body.name,
        localPath: body.localPath,
        syncMode: body.syncMode,
        encryptionEnabled: body.encryptionEnabled,
        redundancyEnabled: body.redundancyEnabled,
        splitEnabled: body.splitEnabled,
        expectedDataSizeBytes: toBigInt(body.expectedDataSizeBytes),
        remoteBindings: body.remoteBindings?.map((binding) => ({
          remoteId: toBigInt(binding.remoteId)!,
          priority: binding.priority
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

      let body: ReturnType<typeof SetTaskActiveSchema.parse>;
      try {
        body = SetTaskActiveSchema.parse(req.body);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

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

  router.delete(
    '/api/mapping-tasks/:taskId',
    asyncHandler(async (req, res) => {
      const taskId = parseTaskId(req.params.taskId);
      let query: ReturnType<typeof DeleteTaskQuerySchema.parse>;
      try {
        query = DeleteTaskQuerySchema.parse(req.query);
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

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

import { Router } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../errors/app-error.js';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { AuditService } from '../audit/audit.service.js';
import { UpdateSettingsSchema } from './settings.dto.js';
import { SettingsService } from './settings.service.js';

function toBadRequest(error: ZodError): AppError {
  return new AppError({
    code: 'BAD_REQUEST',
    message: 'Invalid request payload',
    statusCode: 400,
    details: error.issues
  });
}

export function createSettingsRouter(service: SettingsService, auditService?: AuditService): Router {
  const router = Router();

  router.get(
    '/api/settings',
    asyncHandler(async (_req, res) => {
      const item = service.getCurrent();
      res.status(200).json({ item });
    })
  );

  router.put(
    '/api/settings',
    asyncHandler(async (req, res) => {
      let body: ReturnType<typeof UpdateSettingsSchema.parse>;
      try {
        body = UpdateSettingsSchema.parse(req.body ?? {});
      } catch (error) {
        if (error instanceof ZodError) {
          throw toBadRequest(error);
        }
        throw error;
      }

      const item = await service.update(body);
      await auditService?.write({
        operationType: 'update',
        targetType: 'sync_job',
        message: 'System settings updated',
        metadataJson: {
          updatedKeys: Object.keys(body),
          hotUpdatedKeys: item.hotUpdate.hotUpdatedKeys,
          restartRequiredKeys: item.hotUpdate.restartRequiredKeys
        }
      });
      res.status(200).json({ item });
    })
  );

  return router;
}

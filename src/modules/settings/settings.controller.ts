import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { AuditService } from '../audit/audit.service.js';
import { UpdateSettingsSchema } from './settings.dto.js';
import { SettingsService } from './settings.service.js';

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
      const body = parseOrBadRequest(UpdateSettingsSchema, req.body ?? {});

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

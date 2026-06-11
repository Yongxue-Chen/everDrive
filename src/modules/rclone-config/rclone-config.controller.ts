import { Router } from 'express';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateRcloneRemoteSchema, RcloneConfigFlowSchema, UpdateRcloneRemoteMetadataSchema, UpdateRcloneRemoteSchema, parseRcloneRemoteName } from './rclone-config.dto.js';
import { RcloneConfigService } from './rclone-config.service.js';

export function createRcloneConfigRouter(service: RcloneConfigService, auditService?: AuditService): Router {
  const router = Router();

  router.get('/api/rclone-config/providers', asyncHandler(async (_req, res) => { res.json(await service.listProviders()); }));
  router.get('/api/rclone-config/remotes', asyncHandler(async (_req, res) => { res.json({ items: await service.listRemotes() }); }));
  router.get('/api/rclone-config/remotes/:name', asyncHandler(async (req, res) => { res.json({ item: await service.getRemote(parseRcloneRemoteName(req.params.name)) }); }));
  router.post('/api/rclone-config/remotes', asyncHandler(async (req, res) => {
    const body = parseOrBadRequest(CreateRcloneRemoteSchema, req.body);
    const item = await service.createRemote(body);
    await auditService?.write({ operationType: 'create', targetType: 'remote', message: `rclone remote created: ${body.name}`, metadataJson: { remoteName: body.name, providerType: body.type } });
    res.status(201).json({ item });
  }));
  router.patch('/api/rclone-config/remotes/:name', asyncHandler(async (req, res) => {
    const name = parseRcloneRemoteName(req.params.name);
    const body = parseOrBadRequest(UpdateRcloneRemoteSchema, req.body);
    const item = await service.updateRemote(name, body.parameters);
    await auditService?.write({ operationType: 'update', targetType: 'remote', message: `rclone remote updated: ${name}`, metadataJson: { remoteName: name } });
    res.json({ item });
  }));
  router.delete('/api/rclone-config/remotes/:name', asyncHandler(async (req, res) => {
    const name = parseRcloneRemoteName(req.params.name);
    await service.deleteRemote(name);
    await auditService?.write({ operationType: 'delete', targetType: 'remote', message: `rclone remote deleted: ${name}`, metadataJson: { remoteName: name } });
    res.json({ deleted: true });
  }));
  router.patch('/api/rclone-config/remotes/:name/metadata', asyncHandler(async (req, res) => { const name = parseRcloneRemoteName(req.params.name); const body = parseOrBadRequest(UpdateRcloneRemoteMetadataSchema, req.body); res.json(await service.setWebUrl(name, body.webUrl)); }));
  router.post('/api/rclone-config/flow', asyncHandler(async (req, res) => { const body = parseOrBadRequest(RcloneConfigFlowSchema, req.body); res.json({ item: await service.runConfigFlow(body) }); }));
  router.post('/api/rclone-config/remotes/:name/test', asyncHandler(async (req, res) => { res.json(await service.testRemote(parseRcloneRemoteName(req.params.name))); }));

  return router;
}

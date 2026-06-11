import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middlewares/async-handler.js';
import { parseOrBadRequest } from '../../lib/request-parser.js';
import type { AuditService } from '../audit/audit.service.js';
import { EncryptionRecoveryService } from './encryption-recovery.service.js';

const IdSchema = z.string().regex(/^\d+$/);
const FileQuerySchema = z.object({ query: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(500).optional() });
const DownloadQuerySchema = z.object({ remoteId: IdSchema.optional() });

export function createEncryptionRecoveryRouter(service: EncryptionRecoveryService, audit?: AuditService): Router {
  const router = Router();
  router.get('/api/encryption-recovery/tasks', asyncHandler(async (_req, res) => { res.json({ items: await service.listTasks() }); }));
  router.get('/api/encryption-recovery/tasks/:taskId/files', asyncHandler(async (req, res) => { const taskId = parseOrBadRequest(IdSchema, req.params.taskId); const query = parseOrBadRequest(FileQuerySchema, req.query); res.json({ items: await service.listFiles(BigInt(taskId), query.query, query.limit) }); }));
  router.get('/api/encryption-recovery/files/:fileId/download', asyncHandler(async (req, res) => { const fileId = parseOrBadRequest(IdSchema, req.params.fileId); const query = parseOrBadRequest(DownloadQuerySchema, req.query); const download = await service.prepareDownload(BigInt(fileId), query.remoteId ? BigInt(query.remoteId) : undefined); await audit?.write({ operationType: 'verify', targetType: 'file', targetId: BigInt(fileId), message: 'Encrypted file restored for download', metadataJson: { filename: download.filename } }); res.download(download.path, download.filename, async () => { await download.cleanup(); }); }));
  return router;
}

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FileSyncStatus, type PrismaClient } from '@prisma/client';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { AppError } from '../../errors/app-error.js';
import { buildRemoteFs } from '../remote/remote-fs.js';
import { decryptFile, requireEncryptionKeyOrThrow } from '../security/encryption.js';

export class EncryptionRecoveryService {
  constructor(private readonly prisma: PrismaClient, private readonly rclone: IRcloneClient) {}

  async listTasks() {
    const rows = await this.prisma.mappingTask.findMany({ where: { encryptionEnabled: true, deletedAt: null }, select: { id: true, name: true, _count: { select: { files: true } } }, orderBy: { name: 'asc' } });
    return rows.map((row) => ({ id: row.id.toString(), name: row.name, fileCount: row._count.files }));
  }

  async listFiles(mappingTaskId: bigint, query = '', limit = 200) {
    const rows = await this.prisma.file.findMany({
      where: { mappingTaskId, mappingTask: { encryptionEnabled: true, deletedAt: null }, ...(query.trim() ? { relativePath: { contains: query.trim() } } : {}), fileLocations: { some: { syncStatus: { in: [FileSyncStatus.synced, FileSyncStatus.verifying] } } } },
      select: { id: true, relativePath: true, fileSize: true, modifiedTime: true, fileLocations: { where: { syncStatus: { in: [FileSyncStatus.synced, FileSyncStatus.verifying] } }, select: { remoteId: true, remotePath: true, remote: { select: { displayName: true } } } } },
      orderBy: { relativePath: 'asc' }, take: Math.min(Math.max(limit, 1), 500)
    });
    return rows.map((row) => ({ id: row.id.toString(), relativePath: row.relativePath, fileSize: row.fileSize.toString(), modifiedTime: row.modifiedTime.toISOString(), replicas: row.fileLocations.map((location) => ({ remoteId: location.remoteId.toString(), displayName: location.remote.displayName, remotePath: location.remotePath })) }));
  }

  async prepareDownload(fileId: bigint, remoteId?: bigint) {
    const file = await this.prisma.file.findFirst({ where: { id: fileId, mappingTask: { encryptionEnabled: true, deletedAt: null } }, select: { relativePath: true, fileLocations: { where: { ...(remoteId ? { remoteId } : {}), syncStatus: { in: [FileSyncStatus.synced, FileSyncStatus.verifying] } }, select: { remotePath: true, remote: { select: { remoteName: true } } }, take: 1 } } });
    const location = file?.fileLocations[0];
    if (!file || !location) throw new AppError({ code: 'NOT_FOUND', message: 'encrypted file replica not found', statusCode: 404 });
    const key = requireEncryptionKeyOrThrow(process.env.ENCRYPTION_MASTER_KEY);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'everdrive-restore-'));
    const encryptedPath = path.join(tempDir, 'payload.edc');
    const restoredPath = path.join(tempDir, 'restored-file');
    try {
      await this.rclone.copy({ srcFs: buildRemoteFs(location.remote.remoteName), srcRemote: location.remotePath, dstFs: tempDir, dstRemote: path.basename(encryptedPath), async: false });
      await decryptFile(encryptedPath, restoredPath, key);
      return { path: restoredPath, filename: path.basename(file.relativePath) || 'restored-file', cleanup: () => fs.rm(tempDir, { recursive: true, force: true }) };
    } catch (error) { await fs.rm(tempDir, { recursive: true, force: true }); throw error; }
  }
}

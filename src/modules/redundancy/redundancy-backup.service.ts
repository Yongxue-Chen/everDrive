import path from 'node:path';
import { FileSyncStatus, ScanStatus } from '@prisma/client';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { logger } from '../../lib/logger.js';
import { buildRemoteFs } from '../remote/remote-fs.js';
import { encryptFileToTemp, requireEncryptionKeyOrThrow } from '../security/encryption.js';
import { SyncEngineRepository } from '../sync/sync-engine.repository.js';

export type RedundancyTarget = {
  remoteId: string;
  remoteName: string;
  remoteFs?: string;
  remotePath: string;
};

export type RedundancyUploadResult = {
  remoteId: string;
  remoteName: string;
  remotePath: string;
  status: 'synced' | 'failed';
  attempts: number;
  error?: string;
};

export type RedundancyUploadSummary = {
  fileId: string;
  syncedRemotes: number;
  failedRemotes: number;
  results: RedundancyUploadResult[];
};

export class RedundancyBackupService {
  private readonly log = logger.withContext({ module: 'redundancy-backup-service' });

  constructor(private readonly repository: SyncEngineRepository, private readonly rcloneClient: IRcloneClient) {}

  async uploadFileToTargets(input: {
    fileId: string;
    localPath: string;
    reason: string;
    targets: RedundancyTarget[];
    maxConcurrency?: number;
    maxRetries?: number;
    encryptionEnabled?: boolean;
  }): Promise<RedundancyUploadSummary> {
    const maxConcurrency = Math.max(1, input.maxConcurrency ?? 2);
    const maxRetries = Math.max(0, input.maxRetries ?? 1);
    const uploadSource = await this.prepareUploadSource(input.localPath, Boolean(input.encryptionEnabled));

    try {
      const results = await this.runConcurrent(input.targets, maxConcurrency, async (target) => {
        let attempts = 0;
        let lastError: string | undefined;

        await this.repository.upsertFileLocation({
          fileId: BigInt(input.fileId),
          remoteId: BigInt(target.remoteId),
          remotePath: target.remotePath,
          remoteFileName: path.basename(target.remotePath),
          syncStatus: FileSyncStatus.pending
        });

        while (attempts <= maxRetries) {
          attempts += 1;
          try {
            await this.rcloneClient.copy({
              srcFs: path.dirname(uploadSource.localPath),
              srcRemote: path.basename(uploadSource.localPath),
              dstFs: target.remoteFs ?? buildRemoteFs(target.remoteName),
              dstRemote: target.remotePath,
              async: false
            });

            await this.repository.upsertFileLocation({
              fileId: BigInt(input.fileId),
              remoteId: BigInt(target.remoteId),
              remotePath: target.remotePath,
              remoteFileName: path.basename(target.remotePath),
              syncStatus: FileSyncStatus.synced
            });
            await this.repository.updateFileScanStatus(BigInt(input.fileId), ScanStatus.scanned);
            await this.repository.writeOperationLog({
              operationType: 'sync',
              targetType: 'file',
              targetId: BigInt(input.fileId),
              message: 'Redundant replica uploaded to remote',
              metadata: {
                reason: input.reason,
                remoteId: target.remoteId,
                remoteName: target.remoteName,
                remotePath: target.remotePath,
                attempts,
                encryptionEnabled: Boolean(input.encryptionEnabled)
              }
            });
            return {
              remoteId: target.remoteId,
              remoteName: target.remoteName,
              remotePath: target.remotePath,
              status: 'synced' as const,
              attempts
            };
          } catch (error) {
            lastError = (error as Error).message;
            this.log.warn('replica upload attempt failed', {
              fileId: input.fileId,
              remoteName: target.remoteName,
              remotePath: target.remotePath,
              attempts,
              err: error
            });
          }
        }

        await this.repository.upsertFileLocation({
          fileId: BigInt(input.fileId),
          remoteId: BigInt(target.remoteId),
          remotePath: target.remotePath,
          remoteFileName: path.basename(target.remotePath),
          syncStatus: FileSyncStatus.failed
        });
        await this.repository.writeOperationLog({
          operationType: 'sync',
          targetType: 'file',
          targetId: BigInt(input.fileId),
          message: 'Redundant replica upload failed after retries',
          metadata: {
            reason: input.reason,
            remoteId: target.remoteId,
            remoteName: target.remoteName,
            remotePath: target.remotePath,
            attempts,
            error: lastError,
            encryptionEnabled: Boolean(input.encryptionEnabled)
          }
        });
        return {
          remoteId: target.remoteId,
          remoteName: target.remoteName,
          remotePath: target.remotePath,
          status: 'failed' as const,
          attempts,
          error: lastError
        };
      });

      return {
        fileId: input.fileId,
        syncedRemotes: results.filter((item) => item.status === 'synced').length,
        failedRemotes: results.filter((item) => item.status === 'failed').length,
        results
      };
    } finally {
      await uploadSource.cleanup();
    }
  }

  private async runConcurrent<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }).map(async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) {
          return;
        }
        results[index] = await worker(items[index]!);
      }
    });

    await Promise.all(runners);
    return results;
  }

  private async prepareUploadSource(
    localPath: string,
    encryptionEnabled: boolean
  ): Promise<{ localPath: string; cleanup: () => Promise<void> }> {
    if (!encryptionEnabled) {
      return {
        localPath,
        cleanup: async () => undefined
      };
    }

    const key = requireEncryptionKeyOrThrow(process.env.ENCRYPTION_MASTER_KEY);
    const encrypted = await encryptFileToTemp(localPath, key);
    return {
      localPath: encrypted.encryptedPath,
      cleanup: encrypted.cleanup
    };
  }
}

import path from 'node:path';
import { FileSyncStatus, ScanStatus } from '@prisma/client';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { logger } from '../../lib/logger.js';
import { RedundancyBackupService } from '../redundancy/redundancy-backup.service.js';
import { SyncEngineRepository } from './sync-engine.repository.js';
import type { DeleteAction, RenameAction, SyncPlan, UploadAction } from './sync-planner.service.js';

export type SyncExecutionSummary = {
  jobId: string;
  mappingTaskId: string;
  uploadTotal: number;
  uploadSuccess: number;
  uploadFailed: number;
  renameTotal: number;
  renameSuccess: number;
  renameFailed: number;
  deleteTotal: number;
  deleteSuccess: number;
  deleteFailed: number;
  skipped: number;
  errors: string[];
};

export class SyncExecutor {
  private readonly log = logger.withContext({ module: 'sync-executor' });
  private readonly redundancyBackupService: RedundancyBackupService;
  private readonly now: () => Date;

  constructor(
    private readonly repository: SyncEngineRepository,
    private readonly rcloneClient: IRcloneClient,
    options?: { now?: () => Date }
  ) {
    this.redundancyBackupService = new RedundancyBackupService(repository, rcloneClient);
    this.now = options?.now ?? (() => new Date());
  }

  async executePlan(plan: SyncPlan): Promise<SyncExecutionSummary> {
    const mappingTaskId = BigInt(plan.mappingTaskId);
    const summary: Omit<SyncExecutionSummary, 'jobId' | 'mappingTaskId'> = {
      uploadTotal: plan.uploadActions.length,
      uploadSuccess: 0,
      uploadFailed: 0,
      renameTotal: plan.renameActions.length,
      renameSuccess: 0,
      renameFailed: 0,
      deleteTotal: plan.deleteActions.length,
      deleteSuccess: 0,
      deleteFailed: 0,
      skipped: plan.skipActions.length,
      errors: []
    };

    const jobId = await this.repository.createSyncJob(mappingTaskId, {
      plan
    });

    try {
      for (const action of plan.uploadActions) {
        await this.executeUpload(action, summary);
      }
      for (const action of plan.renameActions) {
        await this.executeRename(action, plan, summary);
      }
      for (const action of plan.deleteActions) {
        await this.executeDelete(action, plan, summary);
      }

      const completed = {
        jobId: jobId.toString(),
        mappingTaskId: plan.mappingTaskId,
        ...summary
      };

      await this.repository.completeSyncJob(jobId, completed);
      this.log.info('sync execution completed', completed);
      return completed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'sync execution failed';
      summary.errors.push(message);
      const failed = {
        jobId: jobId.toString(),
        mappingTaskId: plan.mappingTaskId,
        ...summary
      };
      await this.repository.failSyncJob(jobId, message, failed);
      throw error;
    }
  }

  private async executeUpload(action: UploadAction, summary: Omit<SyncExecutionSummary, 'jobId' | 'mappingTaskId'>): Promise<void> {
    const upload = await this.redundancyBackupService.uploadFileToTargets({
      fileId: action.fileId,
      localPath: action.localPath,
      reason: action.reason,
      targets: action.targets
    });

    summary.uploadSuccess += upload.syncedRemotes;
    summary.uploadFailed += upload.failedRemotes;
    for (const result of upload.results) {
      if (result.status === 'failed') {
        summary.errors.push(
          `upload failed file=${action.fileId} remote=${result.remoteName} path=${result.remotePath}: ${result.error ?? 'unknown'}`
        );
      }
    }
  }

  private async executeRename(
    action: RenameAction,
    plan: SyncPlan,
    summary: Omit<SyncExecutionSummary, 'jobId' | 'mappingTaskId'>
  ): Promise<void> {
    for (const target of action.targets) {
      try {
        await this.rcloneClient.move({
          srcFs: `${target.remoteName}:`,
          srcRemote: target.remotePath,
          dstFs: `${target.remoteName}:`,
          dstRemote: this.toRemotePath(action.toPath, plan.localBasePath),
          async: false
        });

        await this.repository.upsertFileLocation({
          fileId: BigInt(action.fileId),
          remoteId: BigInt(target.remoteId),
          remotePath: this.toRemotePath(action.toPath, plan.localBasePath),
          remoteFileName: path.basename(this.toRemotePath(action.toPath, plan.localBasePath)),
          syncStatus: FileSyncStatus.synced
        });

        await this.repository.updateFileScanStatus(BigInt(action.fileId), ScanStatus.scanned);
        await this.repository.writeOperationLog({
          operationType: 'rename',
          targetType: 'file',
          targetId: BigInt(action.fileId),
          message: 'Remote rename/move executed by sync executor',
          metadata: {
            remoteId: target.remoteId,
            remoteName: target.remoteName,
            fromPath: target.remotePath,
            toPath: this.toRemotePath(action.toPath, plan.localBasePath)
          }
        });
        summary.renameSuccess += 1;
      } catch (error) {
        summary.renameFailed += 1;
        summary.errors.push(
          `rename failed file=${action.fileId} remote=${target.remoteName}: ${(error as Error).message}`
        );
        await this.repository.setFileLocationStatus(BigInt(action.fileId), BigInt(target.remoteId), FileSyncStatus.failed);
      }
    }
  }

  private async executeDelete(
    action: DeleteAction,
    plan: SyncPlan,
    summary: Omit<SyncExecutionSummary, 'jobId' | 'mappingTaskId'>
  ): Promise<void> {
    for (const target of action.targets) {
      try {
        const cloudTrashBasePath = target.cloudTrashBasePath?.trim();
        const shouldMoveToTrash =
          plan.syncMode === 'mirror' &&
          target.cloudTrashEnabled === true &&
          Boolean(cloudTrashBasePath);

        if (shouldMoveToTrash) {
          const trashRemotePath = await this.moveToCloudTrash(
            target.remoteName,
            target.remotePath,
            plan.mappingTaskId,
            cloudTrashBasePath!
          );

          await this.repository.writeOperationLog({
            operationType: 'delete',
            targetType: 'file_location',
            targetId: BigInt(action.fileId),
            message: 'Remote file moved to cloud trash by mirror policy',
            metadata: {
              remoteId: target.remoteId,
              remoteName: target.remoteName,
              remotePath: target.remotePath,
              trashPath: trashRemotePath,
              safeBy: action.safeBy
            }
          });
        } else {
          await this.rcloneClient.deleteFile({
            fs: `${target.remoteName}:`,
            remote: target.remotePath,
            async: false
          });

          await this.repository.writeOperationLog({
            operationType: 'delete',
            targetType: 'file_location',
            targetId: BigInt(action.fileId),
            message: 'Remote file deleted by mirror policy',
            metadata: {
              remoteId: target.remoteId,
              remoteName: target.remoteName,
              remotePath: target.remotePath,
              safeBy: action.safeBy
            }
          });
        }

        await this.repository.setFileLocationStatus(BigInt(action.fileId), BigInt(target.remoteId), FileSyncStatus.deleted);
        summary.deleteSuccess += 1;
      } catch (error) {
        summary.deleteFailed += 1;
        summary.errors.push(`delete failed file=${action.fileId} remote=${target.remoteName}: ${(error as Error).message}`);
        await this.repository.setFileLocationStatus(BigInt(action.fileId), BigInt(target.remoteId), FileSyncStatus.failed);
      }
    }
  }

  private async moveToCloudTrash(remoteName: string, remotePath: string, mappingTaskId: string, basePath: string): Promise<string> {
    const trashRemotePath = this.buildCloudTrashRemotePath(basePath, mappingTaskId, remotePath);

    try {
      await this.rcloneClient.move({
        srcFs: `${remoteName}:`,
        srcRemote: remotePath,
        dstFs: `${remoteName}:`,
        dstRemote: trashRemotePath,
        async: false
      });
      return trashRemotePath;
    } catch (error) {
      if (!this.isPathConflictError(error)) {
        throw error;
      }

      const retryTrashRemotePath = this.buildCloudTrashRemotePath(
        basePath,
        mappingTaskId,
        remotePath,
        this.buildTrashTimestampSuffix()
      );
      await this.rcloneClient.move({
        srcFs: `${remoteName}:`,
        srcRemote: remotePath,
        dstFs: `${remoteName}:`,
        dstRemote: retryTrashRemotePath,
        async: false
      });
      return retryTrashRemotePath;
    }
  }

  private toRemotePath(localPath: string, localBasePath: string): string {
    return path.relative(localBasePath, localPath).replace(/\\/g, '/');
  }

  private buildCloudTrashRemotePath(
    basePath: string,
    mappingTaskId: string,
    originalRemotePath: string,
    timestampSuffix?: string
  ): string {
    const current = this.now();
    const year = String(current.getUTCFullYear());
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    return path.posix.join(basePath, year, month, day, mappingTaskId, this.appendTimestampSuffix(originalRemotePath, timestampSuffix));
  }

  private appendTimestampSuffix(originalRemotePath: string, timestampSuffix?: string): string {
    if (!timestampSuffix) {
      return originalRemotePath;
    }

    const directory = path.posix.dirname(originalRemotePath);
    const parsed = path.posix.parse(originalRemotePath);
    const suffixedFileName = `${parsed.name}${timestampSuffix}${parsed.ext}`;
    return directory === '.' ? suffixedFileName : path.posix.join(directory, suffixedFileName);
  }

  private buildTrashTimestampSuffix(): string {
    const current = this.now();
    const year = String(current.getUTCFullYear());
    const month = String(current.getUTCMonth() + 1).padStart(2, '0');
    const day = String(current.getUTCDate()).padStart(2, '0');
    const hours = String(current.getUTCHours()).padStart(2, '0');
    const minutes = String(current.getUTCMinutes()).padStart(2, '0');
    const seconds = String(current.getUTCSeconds()).padStart(2, '0');
    return `-${year}${month}${day}T${hours}${minutes}${seconds}Z`;
  }

  private isPathConflictError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'PATH_CONFLICT';
  }
}

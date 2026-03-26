import path from 'node:path';
import { FileSyncStatus, ScanStatus } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import { SplitPlanner } from '../split/split-planner.service.js';
import type { RenameHint } from './sync-engine.repository.js';
import { SyncEngineRepository } from './sync-engine.repository.js';

export type RemoteTarget = {
  remoteId: string;
  remoteName: string;
  remotePath: string;
};

export type UploadAction = {
  kind: 'upload';
  fileId: string;
  localPath: string;
  relativePath: string;
  targets: RemoteTarget[];
  reason: 'new_file' | 'changed_file' | 'missing_replica';
};

export type RenameAction = {
  kind: 'rename';
  fileId: string;
  fromPath: string;
  toPath: string;
  targets: RemoteTarget[];
};

export type DeleteAction = {
  kind: 'delete';
  fileId: string;
  localPath: string;
  targets: RemoteTarget[];
  safeBy: string;
};

export type SkipAction = {
  kind: 'skip';
  fileId: string;
  localPath: string;
  reason: string;
};

export type SyncPlan = {
  mappingTaskId: string;
  mappingTaskName: string;
  localBasePath: string;
  syncMode: 'archive' | 'mirror';
  generatedAt: string;
  uploadActions: UploadAction[];
  renameActions: RenameAction[];
  deleteActions: DeleteAction[];
  skipActions: SkipAction[];
};

export class SyncPlanner {
  private readonly log = logger.withContext({ module: 'sync-planner' });
  private readonly splitPlanner = new SplitPlanner();

  constructor(private readonly repository: SyncEngineRepository) {}

  async buildPlan(
    mappingTaskId: bigint,
    options?: { deleteGraceSeconds?: number; renameHintWindowSeconds?: number }
  ): Promise<SyncPlan> {
    const context = await this.repository.findSyncContext(mappingTaskId);
    if (!context) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Active mapping task ${mappingTaskId.toString()} not found`,
        statusCode: 404
      });
    }

    const activeRemotes = context.remotes.filter((link) => link.remote.isActive);
    if (activeRemotes.length === 0) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'No active remote available for this mapping task',
        statusCode: 400
      });
    }

    const deleteGraceSeconds = options?.deleteGraceSeconds ?? 30;
    const renameHintWindowSeconds = options?.renameHintWindowSeconds ?? 3600;
    const now = Date.now();

    const renameHints = await this.repository.listRenameHints(
      context.files.filter((file) => file.scanStatus === ScanStatus.changed).map((file) => file.id),
      renameHintWindowSeconds
    );
    const renameHintMap = new Map<bigint, RenameHint>(renameHints.map((hint) => [hint.fileId, hint]));

    const uploadActions: UploadAction[] = [];
    const renameActions: RenameAction[] = [];
    const deleteActions: DeleteAction[] = [];
    const skipActions: SkipAction[] = [];

    for (const file of context.files) {
      if (file.scanStatus === ScanStatus.error) {
        skipActions.push({
          kind: 'skip',
          fileId: file.id.toString(),
          localPath: file.localPath,
          reason: 'file scan status is error'
        });
        continue;
      }

      const locationByRemoteId = new Map(file.fileLocations.map((location) => [location.remoteId.toString(), location]));

      if (file.scanStatus === ScanStatus.missing) {
        if (context.syncMode === 'archive') {
          skipActions.push({
            kind: 'skip',
            fileId: file.id.toString(),
            localPath: file.localPath,
            reason: 'archive mode keeps cloud copy when local file is deleted'
          });
          continue;
        }

        const ageSeconds = Math.floor((now - file.updatedAt.getTime()) / 1000);
        if (ageSeconds < deleteGraceSeconds) {
          skipActions.push({
            kind: 'skip',
            fileId: file.id.toString(),
            localPath: file.localPath,
            reason: `delete grace window not reached (${ageSeconds}s < ${deleteGraceSeconds}s)`
          });
          continue;
        }

        const targets: RemoteTarget[] = file.fileLocations
          .filter((location) => location.syncStatus === FileSyncStatus.synced || location.syncStatus === FileSyncStatus.verifying)
          .map((location) => {
            const remote = activeRemotes.find((item) => item.remoteId === location.remoteId);
            return remote
              ? {
                  remoteId: remote.remoteId.toString(),
                  remoteName: remote.remote.remoteName,
                  remotePath: location.remotePath
                }
              : null;
          })
          .filter(Boolean) as RemoteTarget[];

        if (targets.length === 0) {
          skipActions.push({
            kind: 'skip',
            fileId: file.id.toString(),
            localPath: file.localPath,
            reason: 'no synced remote location to delete'
          });
          continue;
        }

        deleteActions.push({
          kind: 'delete',
          fileId: file.id.toString(),
          localPath: file.localPath,
          targets,
          safeBy: `grace_${deleteGraceSeconds}s`
        });
        continue;
      }

      const uploadTargets: RemoteTarget[] = [];
      if (context.splitEnabled) {
        const existingSynced = file.fileLocations.find(
          (location) =>
            (location.syncStatus === FileSyncStatus.synced || location.syncStatus === FileSyncStatus.verifying) &&
            activeRemotes.some((remote) => remote.remoteId === location.remoteId)
        );
        if (existingSynced && file.scanStatus === ScanStatus.changed) {
          const remote = activeRemotes.find((item) => item.remoteId === existingSynced.remoteId)!;
          uploadTargets.push({
            remoteId: remote.remoteId.toString(),
            remoteName: remote.remote.remoteName,
            remotePath: file.relativePath
          });
        } else if (!existingSynced) {
          const placement = this.splitPlanner.pickTarget(
            activeRemotes.map((item) => ({
              remoteId: item.remoteId.toString(),
              remoteName: item.remote.remoteName,
              priority: item.priority,
              totalCapacity: item.remote.totalCapacity,
              usedCapacity: item.remote.usedCapacity,
              reservedCapacity: item.remote.reservedCapacity,
              warningThresholdPercent: item.remote.warningThresholdPercent,
              isActive: item.remote.isActive
            })),
            file.fileSize
          );
          uploadTargets.push({
            remoteId: placement.remoteId,
            remoteName: placement.remoteName,
            remotePath: file.relativePath
          });
        }
      } else {
        for (const remoteLink of activeRemotes) {
          const currentLocation = locationByRemoteId.get(remoteLink.remoteId.toString());

          if (!currentLocation) {
            uploadTargets.push({
              remoteId: remoteLink.remoteId.toString(),
              remoteName: remoteLink.remote.remoteName,
              remotePath: file.relativePath
            });
            continue;
          }

          if (file.scanStatus === ScanStatus.changed) {
            uploadTargets.push({
              remoteId: remoteLink.remoteId.toString(),
              remoteName: remoteLink.remote.remoteName,
              remotePath: file.relativePath
            });
          }
        }
      }

      if (file.scanStatus === ScanStatus.changed) {
        const renameHint = renameHintMap.get(file.id);
        if (renameHint && renameHint.toPath === file.localPath) {
          const renameTargets = file.fileLocations
            .filter((location) => {
              const remote = activeRemotes.find((item) => item.remoteId === location.remoteId);
              return Boolean(remote && (location.syncStatus === FileSyncStatus.synced || location.syncStatus === FileSyncStatus.verifying));
            })
            .map((location) => {
              const remote = activeRemotes.find((item) => item.remoteId === location.remoteId)!;
              return {
                remoteId: location.remoteId.toString(),
                remoteName: remote.remote.remoteName,
                remotePath: this.toRemotePath(renameHint.fromPath, context.localPath)
              };
            });

          if (renameTargets.length > 0) {
            renameActions.push({
              kind: 'rename',
              fileId: file.id.toString(),
              fromPath: renameHint.fromPath,
              toPath: renameHint.toPath,
              targets: renameTargets
            });
            continue;
          }
        }
      }

      if (uploadTargets.length > 0) {
        uploadActions.push({
          kind: 'upload',
          fileId: file.id.toString(),
          localPath: file.localPath,
          relativePath: file.relativePath,
          targets: uploadTargets,
          reason:
            file.scanStatus === ScanStatus.changed
              ? 'changed_file'
              : file.fileLocations.length === 0
                ? 'new_file'
                : 'missing_replica'
        });
      } else {
        skipActions.push({
          kind: 'skip',
          fileId: file.id.toString(),
          localPath: file.localPath,
          reason: 'already in-sync on all active remotes'
        });
      }
    }

    const plan: SyncPlan = {
      mappingTaskId: context.id.toString(),
      mappingTaskName: context.name,
      localBasePath: context.localPath,
      syncMode: context.syncMode,
      generatedAt: new Date().toISOString(),
      uploadActions,
      renameActions,
      deleteActions,
      skipActions
    };

    this.log.info('sync plan generated', {
      mappingTaskId: context.id.toString(),
      uploadActions: uploadActions.length,
      renameActions: renameActions.length,
      deleteActions: deleteActions.length,
      skipActions: skipActions.length
    });

    return plan;
  }

  private toRemotePath(localPath: string, basePath: string): string {
    return path.relative(basePath, localPath).replace(/\\/g, '/');
  }
}

import { AppError } from '../../errors/app-error.js';
import { RedundancyRepository } from './redundancy.repository.js';

export type RedundancyRemoteDTO = {
  remoteId: string;
  remoteName: string;
  displayName: string;
  isActive: boolean;
  syncedCount: number;
  pendingCount: number;
  failedCount: number;
  deletedCount: number;
};

export type RedundancyOverviewDTO = {
  mappingTaskId: string;
  name: string;
  localPath: string;
  remotes: RedundancyRemoteDTO[];
  fileCount: number;
  replicaTarget: number;
  replicaAchieved: number;
  protectionLevel: 'ok' | 'degraded' | 'critical';
};

export class RedundancyViewService {
  constructor(private readonly repository: RedundancyRepository) {}

  async getTaskOverview(mappingTaskId: bigint): Promise<RedundancyOverviewDTO> {
    const row = await this.repository.findTaskOverview(mappingTaskId);
    if (!row) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Active mapping task ${mappingTaskId.toString()} not found`,
        statusCode: 404
      });
    }

    const remotes = row.mappingTaskRemotes.map((item) => {
      let syncedCount = 0;
      let pendingCount = 0;
      let failedCount = 0;
      let deletedCount = 0;

      for (const file of row.files) {
        for (const location of file.fileLocations) {
          if (location.remoteId !== item.remoteId) {
            continue;
          }
          if (location.syncStatus === 'synced' || location.syncStatus === 'verifying') {
            syncedCount += 1;
          } else if (location.syncStatus === 'pending') {
            pendingCount += 1;
          } else if (location.syncStatus === 'failed') {
            failedCount += 1;
          } else if (location.syncStatus === 'deleted') {
            deletedCount += 1;
          }
        }
      }

      return {
        remoteId: item.remoteId.toString(),
        remoteName: item.remote.remoteName,
        displayName: item.remote.displayName,
        isActive: item.remote.isActive,
        syncedCount,
        pendingCount,
        failedCount,
        deletedCount
      };
    });

    const fileCount = row.files.length;
    const replicaTarget = row.redundancyEnabled ? row.mappingTaskRemotes.length : 1;
    const replicaAchieved =
      fileCount === 0
        ? replicaTarget
        : Math.min(
            ...row.files.map((file) =>
              file.fileLocations.filter((location) => location.syncStatus === 'synced' || location.syncStatus === 'verifying').length
            )
          );

    const protectionLevel: 'ok' | 'degraded' | 'critical' =
      replicaAchieved >= replicaTarget ? 'ok' : replicaAchieved >= 1 ? 'degraded' : 'critical';

    return {
      mappingTaskId: row.id.toString(),
      name: row.name,
      localPath: row.localPath,
      remotes,
      fileCount,
      replicaTarget,
      replicaAchieved,
      protectionLevel
    };
  }
}

import { SyncEngineRepository } from '../sync/sync-engine.repository.js';
import { RedundancyBackupService } from './redundancy-backup.service.js';
import { RedundancyRepository } from './redundancy.repository.js';

export type RetryReplicaSummary = {
  mappingTaskId: string;
  retriedFiles: number;
  syncedRemotes: number;
  failedRemotes: number;
};

export class RedundancyRecoveryService {
  constructor(
    private readonly repository: RedundancyRepository,
    private readonly redundancyBackupService: RedundancyBackupService,
    private readonly syncRepository: SyncEngineRepository
  ) {}

  async retryFailedReplicas(mappingTaskId: bigint): Promise<RetryReplicaSummary> {
    const failedRows = await this.repository.listFailedReplicas(mappingTaskId);
    const grouped = new Map<string, { localPath: string; targets: Array<{ remoteId: string; remoteName: string; remotePath: string }> }>();

    for (const row of failedRows) {
      const key = row.fileId.toString();
      const current = grouped.get(key) ?? { localPath: row.localPath, targets: [] };
      current.targets.push({
        remoteId: row.remoteId.toString(),
        remoteName: row.remoteName,
        remotePath: row.remotePath || row.relativePath
      });
      grouped.set(key, current);
    }

    let syncedRemotes = 0;
    let failedRemotes = 0;
    for (const [fileId, item] of grouped.entries()) {
      const result = await this.redundancyBackupService.uploadFileToTargets({
        fileId,
        localPath: item.localPath,
        reason: 'retry_failed_replica',
        targets: item.targets
      });
      syncedRemotes += result.syncedRemotes;
      failedRemotes += result.failedRemotes;
    }

    await this.syncRepository.writeOperationLog({
      operationType: 'sync',
      targetType: 'mapping_task',
      targetId: mappingTaskId,
      message: 'Retry failed replica operation executed',
      metadata: {
        retriedFiles: grouped.size,
        syncedRemotes,
        failedRemotes
      }
    });

    return {
      mappingTaskId: mappingTaskId.toString(),
      retriedFiles: grouped.size,
      syncedRemotes,
      failedRemotes
    };
  }
}

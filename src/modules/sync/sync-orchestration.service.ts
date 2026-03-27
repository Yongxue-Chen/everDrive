import { FileSyncStatus } from '@prisma/client';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { buildRemoteFs } from '../remote/remote-fs.js';
import { SyncEngineRepository } from './sync-engine.repository.js';
import { SyncExecutor, type SyncExecutionSummary } from './sync-executor.service.js';
import { SyncPlanner, type SyncPlan } from './sync-planner.service.js';

export class SyncOrchestrationService {
  private readonly repository: SyncEngineRepository;
  private readonly rcloneClient: IRcloneClient;
  private readonly planner: SyncPlanner;
  private readonly executor: SyncExecutor;

  constructor(repository: SyncEngineRepository, rcloneClient: IRcloneClient) {
    this.repository = repository;
    this.rcloneClient = rcloneClient;
    this.planner = new SyncPlanner(repository);
    this.executor = new SyncExecutor(repository, rcloneClient);
  }

  async createPlan(mappingTaskId: bigint, options?: { deleteGraceSeconds?: number; renameHintWindowSeconds?: number }): Promise<SyncPlan> {
    await this.reconcileMissingReplicas(mappingTaskId);
    return this.planner.buildPlan(mappingTaskId, options);
  }

  async execute(mappingTaskId: bigint, options?: { deleteGraceSeconds?: number; renameHintWindowSeconds?: number }): Promise<{
    plan: SyncPlan;
    summary: SyncExecutionSummary;
  }> {
    const plan = await this.createPlan(mappingTaskId, options);
    const summary = await this.executor.executePlan(plan);
    return { plan, summary };
  }

  private async reconcileMissingReplicas(mappingTaskId: bigint): Promise<void> {
    const context = await this.repository.findSyncContext(mappingTaskId);
    if (!context) {
      return;
    }

    const activeRemotes = new Map(
      context.remotes
        .filter((link) => link.remote.isActive)
        .map((link) => [link.remoteId.toString(), buildRemoteFs(link.remote.remoteName, link.remote.remoteRootPath)])
    );

    for (const file of context.files) {
      for (const location of file.fileLocations) {
        if (location.syncStatus !== 'synced' && location.syncStatus !== 'verifying') {
          continue;
        }

        const remoteFs = activeRemotes.get(location.remoteId.toString());
        if (!remoteFs) {
          continue;
        }

        let exists = false;
        try {
          exists = await this.rcloneClient.stat(remoteFs, location.remotePath);
        } catch (error) {
          await this.repository.writeOperationLog({
            operationType: 'verify',
            targetType: 'file_location',
            targetId: file.id,
            message: 'Remote replica verification failed before sync; keeping current status',
            metadata: {
              mappingTaskId: mappingTaskId.toString(),
              remoteId: location.remoteId.toString(),
              remoteFs,
              remotePath: location.remotePath,
              error: error instanceof Error ? error.message : 'unknown error'
            }
          });
          continue;
        }

        if (exists) {
          continue;
        }

        await this.repository.setFileLocationStatus(file.id, location.remoteId, FileSyncStatus.failed);
        await this.repository.writeOperationLog({
          operationType: 'verify',
          targetType: 'file_location',
          targetId: file.id,
          message: 'Remote replica missing during sync preflight; marked for re-upload',
          metadata: {
            mappingTaskId: mappingTaskId.toString(),
            remoteId: location.remoteId.toString(),
            remoteFs,
            remotePath: location.remotePath
          }
        });
      }
    }
  }
}

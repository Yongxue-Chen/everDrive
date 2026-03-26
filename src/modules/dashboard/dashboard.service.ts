import { ScanStatus } from '@prisma/client';
import {
  CAPACITY_WARNING_RULES,
  type CloudViewResponse,
  type SyncStatusColor,
  WORKSPACE_SYNC_STATUS_RULES,
  type WorkspaceViewResponse
} from './dashboard.dto.js';
import { DashboardRepository } from './dashboard.repository.js';

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getWorkspaceView(): Promise<WorkspaceViewResponse> {
    const [tasks, fileAggregates, scanStatusAggregates] = await Promise.all([
      this.repository.listWorkspaceTasks(),
      this.repository.listTaskFileAggregates(),
      this.repository.listTaskScanStatusAggregates()
    ]);

    const latestSyncJobs = await this.repository.listLatestSyncJobsByTask(tasks.map((item) => item.id));

    const fileAggregateMap = new Map(
      fileAggregates.map((item) => [item.mappingTaskId.toString(), { fileCount: item.fileCount, totalSize: item.totalSize }])
    );

    const latestSyncMap = new Map(latestSyncJobs.map((item) => [item.mappingTaskId.toString(), item]));

    const scanStatusMap = new Map<string, { changed: number; missing: number; error: number }>();
    for (const row of scanStatusAggregates) {
      const key = row.mappingTaskId.toString();
      const current = scanStatusMap.get(key) ?? { changed: 0, missing: 0, error: 0 };

      if (row.scanStatus === ScanStatus.changed) {
        current.changed += row.count;
      }
      if (row.scanStatus === ScanStatus.missing) {
        current.missing += row.count;
      }
      if (row.scanStatus === ScanStatus.error) {
        current.error += row.count;
      }

      scanStatusMap.set(key, current);
    }

    return {
      items: tasks.map((task) => {
        const taskId = task.id.toString();
        const aggregate = fileAggregateMap.get(taskId) ?? { fileCount: 0, totalSize: 0n };
        const latestSync = latestSyncMap.get(taskId);
        const statusCounts = scanStatusMap.get(taskId) ?? { changed: 0, missing: 0, error: 0 };

        return {
          mapping_task_id: taskId,
          name: task.name,
          local_path: task.localPath,
          remotes: task.remotes.map((item) => ({
            remote_id: item.remoteId.toString(),
            remote_name: item.remote.remoteName,
            display_name: item.remote.displayName,
            role: item.role,
            priority: item.priority,
            health_status: item.remote.healthStatus,
            is_active: item.remote.isActive
          })),
          sync_status: this.computeSyncStatus(task.remotes, latestSync?.status, statusCounts),
          last_sync_at: task.lastSuccessfulSyncAt?.toISOString() ?? null,
          encryption_enabled: task.encryptionEnabled,
          redundancy_enabled: task.redundancyEnabled,
          replica_count: task.remotes.length,
          file_count: aggregate.fileCount,
          total_size: aggregate.totalSize.toString()
        };
      }),
      rules: {
        sync_status: WORKSPACE_SYNC_STATUS_RULES
      }
    };
  }

  async getCloudView(): Promise<CloudViewResponse> {
    const [remotes, remoteFileCounts] = await Promise.all([
      this.repository.listRemotes(),
      this.repository.listRemoteFileCounts()
    ]);

    const fileCountMap = new Map(remoteFileCounts.map((item) => [item.remoteId.toString(), item.fileCount]));

    return {
      items: remotes.map((remote) => {
        const availableCapacity = remote.totalCapacity - remote.reservedCapacity > 0n ? remote.totalCapacity - remote.reservedCapacity : 0n;
        const remainingCapacity = remote.usedCapacity >= availableCapacity ? 0n : availableCapacity - remote.usedCapacity;
        const usagePercent =
          availableCapacity === 0n
            ? 0
            : Math.min(100, Number((remote.usedCapacity * 10000n) / availableCapacity) / 100);

        const warningFlag = this.computeWarningFlag({
          usagePercent,
          warningThresholdPercent: remote.warningThresholdPercent,
          healthStatus: remote.healthStatus,
          isActive: remote.isActive
        });

        return {
          remote_id: remote.id.toString(),
          remote_name: remote.remoteName,
          total_capacity: remote.totalCapacity.toString(),
          used_capacity: remote.usedCapacity.toString(),
          remaining_capacity: remainingCapacity.toString(),
          usage_percent: usagePercent,
          health_status: remote.healthStatus,
          mapping_tasks: remote.mappingTasks.map((task) => ({
            mapping_task_id: task.id.toString(),
            name: task.name,
            local_path: task.localPath
          })),
          file_count: fileCountMap.get(remote.id.toString()) ?? 0,
          warning_flag: warningFlag
        };
      }),
      rules: {
        capacity_warning: CAPACITY_WARNING_RULES
      }
    };
  }

  private computeSyncStatus(
    remotes: Array<{ remote: { healthStatus: string; isActive: boolean } }>,
    latestSyncStatus: string | undefined,
    scanStatusCounts: { changed: number; missing: number; error: number }
  ): SyncStatusColor {
    const hasUnavailableRemote = remotes.some(
      (item) => !item.remote.isActive || item.remote.healthStatus === 'unavailable' || item.remote.healthStatus === 'full'
    );
    const hasWarningRemote = remotes.some((item) => item.remote.healthStatus === 'warning');
    const hasPendingChanges = scanStatusCounts.changed > 0 || scanStatusCounts.missing > 0 || scanStatusCounts.error > 0;

    if (remotes.length === 0 || hasUnavailableRemote || latestSyncStatus === 'failed') {
      return 'red';
    }

    if (latestSyncStatus !== 'success' || hasWarningRemote || hasPendingChanges) {
      return 'yellow';
    }

    return 'green';
  }

  private computeWarningFlag(input: {
    usagePercent: number;
    warningThresholdPercent: number;
    healthStatus: string;
    isActive: boolean;
  }): boolean {
    if (!input.isActive) {
      return true;
    }

    if (input.healthStatus === 'warning' || input.healthStatus === 'full' || input.healthStatus === 'unavailable') {
      return true;
    }

    return input.usagePercent >= input.warningThresholdPercent;
  }
}

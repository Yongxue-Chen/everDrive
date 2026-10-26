import { describe, expect, it } from 'vitest';
import { DashboardService } from '../src/modules/dashboard/dashboard.service.js';
import type { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';

describe('DashboardService', () => {
  it('builds workspace view with sync_status colors', async () => {
    const repository: Partial<DashboardRepository> = {
      listWorkspaceTasks: async () => [
        {
          id: 1n,
          name: 'Photos',
          localPath: '/data/photos',
          encryptionEnabled: true,
          redundancyEnabled: true,
          remotes: [
            {
              remoteId: 11n,
              role: 'primary',
              priority: 1,
              remoteBasePath: 'photos',
              remote: { remoteName: 'driveA', displayName: 'Drive A', remoteRootPath: 'backup', healthStatus: 'healthy', isActive: true }
            }
          ],
          lastSuccessfulSyncAt: new Date('2026-03-26T20:00:00.000Z')
        },
        {
          id: 2n,
          name: 'Docs',
          localPath: '/data/docs',
          encryptionEnabled: false,
          redundancyEnabled: false,
          remotes: [
            {
              remoteId: 22n,
              role: 'primary',
              priority: 1,
              remote: { remoteName: 'driveB', displayName: 'Drive B', healthStatus: 'healthy', isActive: true }
            }
          ],
          lastSuccessfulSyncAt: null
        },
        {
          id: 3n,
          name: 'Media',
          localPath: '/data/media',
          encryptionEnabled: false,
          redundancyEnabled: false,
          remotes: [
            {
              remoteId: 33n,
              role: 'primary',
              priority: 1,
              remote: { remoteName: 'driveC', displayName: 'Drive C', healthStatus: 'warning', isActive: true }
            }
          ],
          lastSuccessfulSyncAt: null
        }
      ],
      listTaskFileAggregates: async () => [
        { mappingTaskId: 1n, fileCount: 5, totalSize: 500n },
        { mappingTaskId: 2n, fileCount: 3, totalSize: 300n },
        { mappingTaskId: 3n, fileCount: 2, totalSize: 200n }
      ],
      listTaskScanStatusAggregates: async () => [{ mappingTaskId: 3n, scanStatus: 'changed', count: 1 } as any],
      listLatestSyncJobsByTask: async () => [
        { mappingTaskId: 1n, status: 'success', finishedAt: new Date('2026-03-26T20:00:00.000Z') },
        { mappingTaskId: 2n, status: 'failed', finishedAt: new Date('2026-03-26T20:10:00.000Z') }
      ]
    };

    const service = new DashboardService(repository as DashboardRepository);
    const response = await service.getWorkspaceView();

    expect(response.items[0]?.sync_status).toBe('green');
    expect(response.items[1]?.sync_status).toBe('red');
    expect(response.items[2]?.sync_status).toBe('yellow');
    expect(response.items[0]?.replica_count).toBe(1);
    expect(response.items[0]?.remotes[0]?.destination_path).toBe('driveA:/backup/photos');
    expect(response.items[1]?.remotes[0]?.destination_path).toBe('driveB:/');
    expect(response.items[0]?.source_type).toBe('local');
    expect(response.items[0]?.total_size).toBe('500');
    expect(response.items[0]?.latest_sync_status).toBe('success');
    expect(response.items[1]?.latest_sync_status).toBe('failed');
    expect(response.items[1]?.attention_reasons).toContain('上次同步失败');
    expect(response.items[2]?.pending_change_count).toBe(1);
    expect(response.items[2]?.attention_reasons).toContain('Drive C 存在容量或连接提醒');
  });

  it('builds cloud view and warning flags', async () => {
    const repository: Partial<DashboardRepository> = {
      listRemotes: async () => [
        {
          id: 11n,
          remoteName: 'driveA',
          totalCapacity: 1000n,
          usedCapacity: 500n,
          reservedCapacity: 0n,
          warningThresholdPercent: 85,
          healthStatus: 'healthy',
          isActive: true,
          mappingTasks: [{ id: 1n, name: 'Photos', localPath: '/data/photos' }]
        },
        {
          id: 22n,
          remoteName: 'driveB',
          totalCapacity: 1000n,
          usedCapacity: 900n,
          reservedCapacity: 0n,
          warningThresholdPercent: 85,
          healthStatus: 'healthy',
          isActive: true,
          mappingTasks: []
        },
        {
          id: 33n,
          remoteName: 'driveC',
          totalCapacity: 1000n,
          usedCapacity: 700n,
          reservedCapacity: 0n,
          warningThresholdPercent: 85,
          healthStatus: 'full',
          isActive: true,
          mappingTasks: []
        }
      ],
      listRemoteFileCounts: async () => [
        { remoteId: 11n, fileCount: 20 },
        { remoteId: 22n, fileCount: 30 }
      ]
    };

    const service = new DashboardService(repository as DashboardRepository);
    const response = await service.getCloudView();

    expect(response.items[0]?.warning_flag).toBe(false);
    expect(response.items[1]?.warning_flag).toBe(true);
    expect(response.items[2]?.warning_flag).toBe(true);
    expect(response.items[0]?.file_count).toBe(20);
    expect(response.items[0]?.remaining_capacity).toBe('500');
  });
});

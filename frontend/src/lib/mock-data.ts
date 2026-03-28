import type { CloudViewResponse, MappingTaskItem, MappingTaskListResponse, QueueJob, RemotesListResponse, SettingsResponse, WorkspaceViewResponse } from './types.js';

export const mockWorkspaceView: WorkspaceViewResponse = {
  items: [
    {
      mapping_task_id: '1',
      name: 'Workspace / Photos',
      local_path: '/data/photos',
      remotes: [
        {
          remote_id: '11',
          remote_name: 'driveA',
          display_name: 'Drive A',
          role: 'primary',
          priority: 1,
          health_status: 'healthy',
          is_active: true
        },
        {
          remote_id: '22',
          remote_name: 'driveB',
          display_name: 'Drive B',
          role: 'backup',
          priority: 2,
          health_status: 'warning',
          is_active: true
        }
      ],
      sync_status: 'yellow',
      last_sync_at: '2026-03-26T21:00:00.000Z',
      encryption_enabled: true,
      redundancy_enabled: true,
      replica_count: 2,
      file_count: 3210,
      total_size: '8533334321'
    }
  ],
  rules: {
    sync_status: {
      green: 'last sync success and no pending local changes and all bound remotes healthy',
      yellow: 'no successful sync yet or has pending changes or has warning remote',
      red: 'latest sync failed or any bound remote unavailable/full/inactive'
    }
  }
};

export const mockCloudView: CloudViewResponse = {
  items: [
    {
      remote_id: '11',
      remote_name: 'driveA',
      total_capacity: '100000000000',
      used_capacity: '58000000000',
      remaining_capacity: '42000000000',
      usage_percent: 58,
      health_status: 'healthy',
      mapping_tasks: [{ mapping_task_id: '1', name: 'Workspace / Photos', local_path: '/data/photos' }],
      file_count: 1640,
      warning_flag: false
    }
  ],
  rules: {
    capacity_warning: {
      warning_flag_true: 'usage_percent reaches warning threshold OR health_status is warning/full/unavailable OR remote inactive',
      warning_flag_false: 'remote active and below threshold with healthy status'
    }
  }
};

export const mockMappingTasks: MappingTaskListResponse = {
  items: [
    {
      id: '1',
      name: '工作空间 / 照片',
      local_path: '/data/photos',
      remotes: [
        {
          remoteId: '11',
          remoteName: 'driveA',
          displayName: 'Drive A',
          role: 'primary',
          priority: 1,
          remoteBasePath: 'team/photos',
          is_active: true,
          healthStatus: 'healthy',
          availableCapacityBytes: '42000000000'
        }
      ],
      sync_mode: 'archive',
      encryption_enabled: true,
      redundancy_enabled: true,
      split_enabled: false,
      last_sync_at: '2026-03-26T21:00:00.000Z',
      status: 'active',
      created_at: '2026-03-26T12:00:00.000Z',
      updated_at: '2026-03-26T21:00:00.000Z'
    }
  ]
};

export const mockRemotes: RemotesListResponse = {
  items: [
    {
      id: '11',
      remoteName: 'driveA',
      displayName: 'Drive A',
      remoteRootPath: '',
      isActive: true,
      cloudTrashEnabled: false,
      cloudTrashBasePath: '.everdrive-trash',
      healthStatus: 'healthy',
      lastCheckedAt: '2026-03-28T11:00:00.000Z',
      lastAlertAt: null,
      capacity: {
        totalCapacityBytes: '100000000000',
        usedCapacityBytes: '58000000000',
        reservedCapacityBytes: '0',
        remainingCapacityBytes: '42000000000',
        usagePercent: 58,
        warningThresholdPercent: 85,
        alert: false,
        realUsageAvailable: true
      },
      mappedDirectories: [
        {
          mappingTaskId: '1',
          mappingTaskName: 'Workspace / Photos',
          localPath: '/data/photos',
          role: 'primary',
          priority: 1,
          mappingTaskActive: true
        }
      ],
      lastSyncAt: '2026-03-26T21:00:00.000Z',
      updatedAt: '2026-03-26T21:10:00.000Z'
    }
  ]
};

export const mockJob: QueueJob = {
  id: '1001',
  kind: 'sync',
  lane: 'long',
  mappingTaskId: '1',
  remoteIds: ['11'],
  payload: { deleteGraceSeconds: 0 },
  status: 'running',
  createdAt: '2026-03-26T21:12:00.000Z',
  startedAt: '2026-03-26T21:12:01.000Z',
  finishedAt: null,
  errorMessage: null,
  result: null
};

export const mockSettings: SettingsResponse = {
  item: {
    values: {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        passMasked: 'se*****ss',
        hasPassword: true,
        timeoutMs: 5000,
        retryAttempts: 2,
        retryDelayMs: 250
      },
      defaultScanIntervalSeconds: 30,
      defaultConcurrency: {
        sync: 4,
        rclone: 4,
        jobLong: 2,
        jobShort: 1,
        jobRemoteLimit: 1
      },
      defaultCapacityWarningThresholdPercent: 85,
      hashAlgorithm: 'sha1',
      logLevel: 'info',
      syncProfile: {
        transfers: 1,
        checkers: 1,
        bufferSizeMiB: 8,
        tpsLimit: 2,
        bwLimitMiB: 4
      },
      cloudTrash: {
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    },
    hotUpdate: {
      hotUpdatedKeys: [],
      restartRequiredKeys: [],
      notes: []
    }
  }
};

export function cloneMockMappingTasks(): MappingTaskItem[] {
  return mockMappingTasks.items.map((item: MappingTaskItem) => ({
    ...item,
    remotes: item.remotes.map((remote: MappingTaskItem['remotes'][number]) => ({ ...remote }))
  }));
}

import { describe, expect, it, vi } from 'vitest';
import type { IRcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import { RcloneClientError } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import type { SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';
import type { CloudTrashSettings } from '../src/modules/settings/settings.dto.js';
import { SyncExecutor } from '../src/modules/sync/sync-executor.service.js';
import type { SyncPlan } from '../src/modules/sync/sync-planner.service.js';

function repoStub(overrides: Partial<SyncEngineRepository> = {}): SyncEngineRepository {
  return {
    findSyncContext: vi.fn(async () => null),
    listRenameHints: vi.fn(async () => []),
    createSyncJob: vi.fn(async () => 1n),
    completeSyncJob: vi.fn(async () => undefined),
    failSyncJob: vi.fn(async () => undefined),
    upsertFileLocation: vi.fn(async () => undefined),
    setFileLocationStatus: vi.fn(async () => undefined),
    updateFileScanStatus: vi.fn(async () => undefined),
    writeOperationLog: vi.fn(async () => undefined),
    ...overrides
  } as unknown as SyncEngineRepository;
}

function rcloneStub(overrides: Partial<IRcloneClient> = {}): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => []),
    getConfigProviders: vi.fn(async () => ({ providers: [] })),
    copy: vi.fn(async () => ({ async: false as const, result: {} })),
    sync: vi.fn(async () => ({ async: false as const, result: {} })),
    move: vi.fn(async () => ({ async: false as const, result: {} })),
    deleteFile: vi.fn(async () => ({ async: false as const, result: {} })),
    purge: vi.fn(async () => ({ async: false as const, result: {} })),
    mkdir: vi.fn(async () => ({ async: false as const, result: {} })),
    copyRemoteToRemote: vi.fn(async () => ({ async: false as const, result: {} })),
    getJobStatus: vi.fn(async () => ({ finished: true, success: true })),
    ...overrides
  };
}

function cloudTrashSettings(overrides: Partial<CloudTrashSettings> = {}): CloudTrashSettings {
  return {
    enabled: true,
    retentionDays: 30,
    cleanupIntervalHours: 24,
    basePath: '.everdrive-trash',
    maxDeleteBatchPerRun: 1000,
    ...overrides
  };
}

describe('SyncExecutor', () => {
  it('moves deleted files into cloud trash when enabled', async () => {
    const repository = repoStub();
    const rclone = rcloneStub();
    const now = new Date('2026-03-27T12:34:56.000Z');
    const executor = new SyncExecutor(repository, rclone, {
      getCloudTrashSettings: () => cloudTrashSettings(),
      now: () => now
    });
    const plan: SyncPlan = {
      mappingTaskId: '42',
      mappingTaskName: 'photos',
      localBasePath: '/data/photos',
      syncMode: 'mirror',
      encryptionEnabled: false,
      generatedAt: now.toISOString(),
      uploadActions: [],
      renameActions: [],
      deleteActions: [
        {
          kind: 'delete',
          fileId: '101',
          localPath: '/data/photos/2024/vacation/a.jpg',
          targets: [{ remoteId: '11', remoteName: 'driveA', remotePath: '2024/vacation/a.jpg' }],
          safeBy: 'grace_30s'
        }
      ],
      skipActions: []
    };

    const summary = await executor.executePlan(plan);

    expect(rclone.deleteFile).not.toHaveBeenCalled();
    expect(rclone.move).toHaveBeenCalledWith({
      srcFs: 'driveA:',
      srcRemote: '2024/vacation/a.jpg',
      dstFs: 'driveA:',
      dstRemote: '.everdrive-trash/2026/03/27/42/2024/vacation/a.jpg',
      async: false
    });
    expect(summary.deleteSuccess).toBe(1);
    expect(summary.deleteFailed).toBe(0);
  });

  it('retries cloud trash move with a timestamp suffix on path conflict', async () => {
    const repository = repoStub();
    const conflict = new RcloneClientError({
      code: 'PATH_CONFLICT',
      message: 'file already exists',
      method: 'sync/move'
    });
    const move = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ async: false as const, result: {} });
    const rclone = rcloneStub({ move });
    const now = new Date('2026-03-27T12:34:56.000Z');
    const executor = new SyncExecutor(repository, rclone, {
      getCloudTrashSettings: () => cloudTrashSettings(),
      now: () => now
    });
    const plan: SyncPlan = {
      mappingTaskId: '42',
      mappingTaskName: 'photos',
      localBasePath: '/data/photos',
      syncMode: 'mirror',
      encryptionEnabled: false,
      generatedAt: now.toISOString(),
      uploadActions: [],
      renameActions: [],
      deleteActions: [
        {
          kind: 'delete',
          fileId: '101',
          localPath: '/data/photos/2024/vacation/a.jpg',
          targets: [{ remoteId: '11', remoteName: 'driveA', remotePath: '2024/vacation/a.jpg' }],
          safeBy: 'grace_30s'
        }
      ],
      skipActions: []
    };

    const summary = await executor.executePlan(plan);

    expect(move).toHaveBeenCalledTimes(2);
    expect(move).toHaveBeenNthCalledWith(1, {
      srcFs: 'driveA:',
      srcRemote: '2024/vacation/a.jpg',
      dstFs: 'driveA:',
      dstRemote: '.everdrive-trash/2026/03/27/42/2024/vacation/a.jpg',
      async: false
    });
    expect(move).toHaveBeenNthCalledWith(2, {
      srcFs: 'driveA:',
      srcRemote: '2024/vacation/a.jpg',
      dstFs: 'driveA:',
      dstRemote: '.everdrive-trash/2026/03/27/42/2024/vacation/a-20260327T123456Z.jpg',
      async: false
    });
    expect(summary.deleteSuccess).toBe(1);
    expect(summary.deleteFailed).toBe(0);
  });

  it('keeps deleting files directly when cloud trash is disabled', async () => {
    const repository = repoStub();
    const rclone = rcloneStub();
    const executor = new SyncExecutor(repository, rclone, {
      getCloudTrashSettings: () => cloudTrashSettings({ enabled: false })
    });
    const plan: SyncPlan = {
      mappingTaskId: '42',
      mappingTaskName: 'photos',
      localBasePath: '/data/photos',
      syncMode: 'mirror',
      encryptionEnabled: false,
      generatedAt: new Date('2026-03-27T12:34:56.000Z').toISOString(),
      uploadActions: [],
      renameActions: [],
      deleteActions: [
        {
          kind: 'delete',
          fileId: '101',
          localPath: '/data/photos/2024/vacation/a.jpg',
          targets: [{ remoteId: '11', remoteName: 'driveA', remotePath: '2024/vacation/a.jpg' }],
          safeBy: 'grace_30s'
        }
      ],
      skipActions: []
    };

    const summary = await executor.executePlan(plan);

    expect(rclone.move).not.toHaveBeenCalled();
    expect(rclone.deleteFile).toHaveBeenCalledWith({
      fs: 'driveA:',
      remote: '2024/vacation/a.jpg',
      async: false
    });
    expect(summary.deleteSuccess).toBe(1);
  });

  it('continues when one remote upload fails and records partial success', async () => {
    const repository = repoStub();
    const rclone = rcloneStub({
      copy: vi
        .fn()
        .mockResolvedValueOnce({ async: false as const, result: {} })
        .mockRejectedValueOnce(new Error('remote unavailable'))
        .mockRejectedValueOnce(new Error('remote unavailable again'))
    });

    const executor = new SyncExecutor(repository, rclone);
    const plan = {
      mappingTaskId: '1',
      mappingTaskName: 'photos',
      localBasePath: '/data/photos',
      syncMode: 'archive',
      generatedAt: new Date().toISOString(),
      uploadActions: [
        {
          kind: 'upload',
          fileId: '101',
          localPath: '/data/photos/a.jpg',
          relativePath: 'a.jpg',
          reason: 'new_file',
          targets: [
            { remoteId: '11', remoteName: 'driveA', remotePath: 'a.jpg' },
            { remoteId: '22', remoteName: 'driveB', remotePath: 'a.jpg' }
          ]
        }
      ],
      renameActions: [],
      deleteActions: [],
      skipActions: []
    } as unknown as SyncPlan;

    const summary = await executor.executePlan(plan);
    expect(summary.uploadSuccess).toBe(1);
    expect(summary.uploadFailed).toBe(1);
    expect(summary.errors.length).toBeGreaterThan(0);
  });
});

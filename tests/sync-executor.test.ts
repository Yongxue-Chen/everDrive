import { describe, expect, it, vi } from 'vitest';
import type { IRcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import type { SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';
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

describe('SyncExecutor', () => {
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
    const plan: SyncPlan = {
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
    };

    const summary = await executor.executePlan(plan);
    expect(summary.uploadSuccess).toBe(1);
    expect(summary.uploadFailed).toBe(1);
    expect(summary.errors.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { IRcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import { RedundancyBackupService } from '../src/modules/redundancy/redundancy-backup.service.js';
import type { SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';

function repoStub(): SyncEngineRepository {
  return {
    findSyncContext: vi.fn(async () => null),
    listRenameHints: vi.fn(async () => []),
    createSyncJob: vi.fn(async () => 1n),
    completeSyncJob: vi.fn(async () => undefined),
    failSyncJob: vi.fn(async () => undefined),
    upsertFileLocation: vi.fn(async () => undefined),
    setFileLocationStatus: vi.fn(async () => undefined),
    updateFileScanStatus: vi.fn(async () => undefined),
    writeOperationLog: vi.fn(async () => undefined)
  } as unknown as SyncEngineRepository;
}

function rcloneStub(copyImpl?: any): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => []),
    getConfigProviders: vi.fn(async () => ({ providers: [] })),
    copy: copyImpl ?? vi.fn(async () => ({ async: false as const, result: {} })),
    sync: vi.fn(async () => ({ async: false as const, result: {} })),
    move: vi.fn(async () => ({ async: false as const, result: {} })),
    deleteFile: vi.fn(async () => ({ async: false as const, result: {} })),
    purge: vi.fn(async () => ({ async: false as const, result: {} })),
    mkdir: vi.fn(async () => ({ async: false as const, result: {} })),
    copyRemoteToRemote: vi.fn(async () => ({ async: false as const, result: {} })),
    getJobStatus: vi.fn(async () => ({ finished: true, success: true }))
  };
}

describe('RedundancyBackupService', () => {
  it('handles per-remote success/failure independently', async () => {
    const copy = vi
      .fn()
      .mockResolvedValueOnce({ async: false as const, result: {} })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ async: false as const, result: {} });
    const service = new RedundancyBackupService(repoStub(), rcloneStub(copy));

    const result = await service.uploadFileToTargets({
      fileId: '1',
      localPath: '/data/a.jpg',
      reason: 'new_file',
      maxRetries: 1,
      targets: [
        { remoteId: '11', remoteName: 'driveA', remotePath: 'a.jpg' },
        { remoteId: '22', remoteName: 'driveB', remotePath: 'a.jpg' }
      ]
    });

    expect(result.syncedRemotes).toBe(2);
    expect(result.failedRemotes).toBe(0);
  });
});

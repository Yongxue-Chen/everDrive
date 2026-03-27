import { FileSyncStatus, ScanStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { IRcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import { SyncOrchestrationService } from '../src/modules/sync/sync-orchestration.service.js';
import type { SyncContext, SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';

function createContext(status: FileSyncStatus): SyncContext {
  return {
    id: 3n,
    name: 'photos',
    localPath: '/data/photos',
    syncMode: 'archive',
    encryptionEnabled: false,
    splitEnabled: false,
    isActive: true,
    deletedAt: null,
    remotes: [
      {
        remoteId: 2n,
        priority: 1,
        role: 'primary',
        remoteBasePath: 'test',
        remote: {
          id: 2n,
          remoteName: 'myBlomp',
          remoteRootPath: 'container-a',
          isActive: true,
          cloudTrashEnabled: false,
          cloudTrashBasePath: '.everdrive-trash',
          totalCapacity: 1000n,
          usedCapacity: 0n,
          reservedCapacity: 0n,
          warningThresholdPercent: 85
        }
      }
    ],
    files: [
      {
        id: 11n,
        localPath: '/data/photos/a.webp',
        relativePath: 'a.webp',
        fileSize: 25n,
        scanStatus: ScanStatus.scanned,
        updatedAt: new Date('2026-03-27T20:00:00.000Z'),
        fileLocations: [
          {
            id: 21n,
            remoteId: 2n,
            remotePath: 'test/a.webp',
            remoteFileName: 'a.webp',
            syncStatus: status
          }
        ]
      }
    ]
  };
}

function createRepository() {
  let currentStatus: FileSyncStatus = FileSyncStatus.synced;

  const repository = {
    findSyncContext: vi.fn(async () => createContext(currentStatus)),
    listRenameHints: vi.fn(async () => []),
    createSyncJob: vi.fn(async () => 1n),
    completeSyncJob: vi.fn(async () => undefined),
    failSyncJob: vi.fn(async () => undefined),
    upsertFileLocation: vi.fn(async () => undefined),
    setFileLocationStatus: vi.fn(async (_fileId: bigint, _remoteId: bigint, status: FileSyncStatus) => {
      currentStatus = status;
    }),
    updateFileScanStatus: vi.fn(async () => undefined),
    writeOperationLog: vi.fn(async () => undefined)
  } as unknown as SyncEngineRepository;

  return repository;
}

function createRclone(statImpl: () => Promise<boolean>): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => []),
    getAbout: vi.fn(async () => ({ total: null, used: null, free: null })),
    getConfigProviders: vi.fn(async () => ({ providers: [] })),
    copy: vi.fn(async () => ({ async: false as const, result: {} })),
    sync: vi.fn(async () => ({ async: false as const, result: {} })),
    move: vi.fn(async () => ({ async: false as const, result: {} })),
    deleteFile: vi.fn(async () => ({ async: false as const, result: {} })),
    purge: vi.fn(async () => ({ async: false as const, result: {} })),
    mkdir: vi.fn(async () => ({ async: false as const, result: {} })),
    copyRemoteToRemote: vi.fn(async () => ({ async: false as const, result: {} })),
    stat: vi.fn(statImpl),
    getJobStatus: vi.fn(async () => ({ finished: true, success: true }))
  };
}

describe('SyncOrchestrationService', () => {
  it('marks missing remote replicas as failed before planning so they get re-uploaded', async () => {
    const repository = createRepository();
    const rclone = createRclone(async () => false);
    const service = new SyncOrchestrationService(repository, rclone);

    const plan = await service.createPlan(3n);

    expect(rclone.stat).toHaveBeenCalledWith('myBlomp:container-a', 'test/a.webp');
    expect(repository.setFileLocationStatus).toHaveBeenCalledWith(11n, 2n, FileSyncStatus.failed);
    expect(plan.uploadActions).toHaveLength(1);
    expect(plan.skipActions).toHaveLength(0);
  });

  it('keeps healthy replicas as skip actions when the remote object still exists', async () => {
    const repository = createRepository();
    const rclone = createRclone(async () => true);
    const service = new SyncOrchestrationService(repository, rclone);

    const plan = await service.createPlan(3n);

    expect(repository.setFileLocationStatus).not.toHaveBeenCalled();
    expect(plan.uploadActions).toHaveLength(0);
    expect(plan.skipActions).toHaveLength(1);
  });

  it('continues planning when remote replica verification fails transiently', async () => {
    const repository = createRepository();
    const rclone = createRclone(async () => {
      throw new Error('temporary stat failure');
    });
    const service = new SyncOrchestrationService(repository, rclone);

    const plan = await service.createPlan(3n);

    expect(repository.setFileLocationStatus).not.toHaveBeenCalled();
    expect(repository.writeOperationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        operationType: 'verify',
        targetType: 'file_location',
        message: 'Remote replica verification failed before sync; keeping current status'
      })
    );
    expect(plan.uploadActions).toHaveLength(0);
    expect(plan.skipActions).toHaveLength(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  CloudInventoryService,
  type CloudInventoryRepository,
  type RemoteRecord,
  type RemoteUsageAggregate
} from '../src/modules/remote/cloud-inventory.service.js';
import type { IRcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';

function buildRemote(partial: Partial<RemoteRecord>): RemoteRecord {
  return {
    id: 1n,
    remoteName: 'driveA',
    displayName: 'driveA',
    totalCapacity: 1000n,
    usedCapacity: 0n,
    reservedCapacity: 100n,
    warningThresholdPercent: 85,
    healthStatus: 'healthy',
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    mappingTaskRemotes: [],
    ...partial
  };
}

function createRepositoryStub(overrides: Partial<CloudInventoryRepository> = {}): CloudInventoryRepository {
  return {
    listRemotes: vi.fn(async () => [buildRemote({})]),
    findRemoteById: vi.fn(async () => buildRemote({})),
    syncRemotesFromRclone: vi.fn(async () => ({ added: ['driveB'], reactivated: [], disabled: ['oldDrive'] })),
    getUsedCapacityByRemoteIds: vi.fn(async () => [{ remoteId: 1n, usedCapacity: 700n }]),
    updateRemoteUsageSnapshot: vi.fn(async () => undefined),
    updateRemoteCapacitySettings: vi.fn(async () => undefined),
    updateRemoteActiveState: vi.fn(async () => undefined),
    ...overrides
  };
}

function createRcloneStub(overrides: Partial<IRcloneClient> = {}): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => ['driveA', 'driveB']),
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

describe('CloudInventoryService', () => {
  it('syncs remote list from rclone and marks missing remotes inactive', async () => {
    const repository = createRepositoryStub();
    const rclone = createRcloneStub();
    const service = new CloudInventoryService(repository, rclone);

    const summary = await service.syncRemotes();

    expect(rclone.listRemotes).toHaveBeenCalled();
    expect(repository.syncRemotesFromRclone).toHaveBeenCalledWith(['driveA', 'driveB']);
    expect(summary.disabled).toContain('oldDrive');
  });

  it('computes warning status when usage reaches threshold', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ warningThresholdPercent: 80, reservedCapacity: 100n, totalCapacity: 1000n })]),
      getUsedCapacityByRemoteIds: vi.fn(async () => [{ remoteId: 1n, usedCapacity: 730n }])
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    const cards = await service.listRemoteCards();

    expect(cards[0]?.healthStatus).toBe('warning');
    expect(cards[0]?.capacity.usagePercent).toBeGreaterThanOrEqual(80);
  });

  it('computes full status when used capacity exceeds available capacity', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ totalCapacity: 1000n, reservedCapacity: 200n, warningThresholdPercent: 90 })]),
      getUsedCapacityByRemoteIds: vi.fn(async () => [{ remoteId: 1n, usedCapacity: 900n }])
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    const cards = await service.listRemoteCards();

    expect(cards[0]?.healthStatus).toBe('full');
    expect(cards[0]?.capacity.remainingCapacityBytes).toBe('0');
  });

  it('returns unavailable status when remote is inactive', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ isActive: false })])
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    const cards = await service.listRemoteCards();

    expect(cards[0]?.healthStatus).toBe('unavailable');
  });

  it('updates manual total capacity and custom threshold', async () => {
    const repository = createRepositoryStub();
    const service = new CloudInventoryService(repository, createRcloneStub());

    await service.updateRemoteCapacity(1n, {
      totalCapacity: 2_000n,
      warningThresholdPercent: 75
    });

    expect(repository.updateRemoteCapacitySettings).toHaveBeenCalledWith(1n, {
      totalCapacity: 2_000n,
      warningThresholdPercent: 75
    });
  });

  it('builds UI card with mapped local directories', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [
        buildRemote({
          mappingTaskRemotes: [
            {
              id: 11n,
              role: 'primary',
              priority: 10,
              mappingTask: {
                id: 101n,
                name: 'photos-backup',
                localPath: '/data/photos',
                isActive: true
              }
            }
          ]
        })
      ])
    });

    const service = new CloudInventoryService(repository, createRcloneStub());
    const cards = await service.listRemoteCards();

    expect(cards[0]?.mappedDirectories[0]).toMatchObject({
      mappingTaskId: '101',
      localPath: '/data/photos',
      role: 'primary'
    });
  });
});

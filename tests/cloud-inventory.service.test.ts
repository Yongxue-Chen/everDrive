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
    remoteRootPath: '',
    totalCapacity: 1000n,
    usedCapacity: 0n,
    reservedCapacity: 100n,
    warningThresholdPercent: 85,
    healthStatus: 'healthy',
    isActive: true,
    lastCheckedAt: null,
    lastAlertAt: null,
    cloudTrashEnabled: false,
    cloudTrashBasePath: '.everdrive-trash',
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
    createRemote: vi.fn(async (input) => buildRemote({ displayName: input.displayName, remoteName: input.remoteName })),
    getRemoteByDisplayName: vi.fn(async () => null),
    getRemoteByBoundRemoteName: vi.fn(async () => null),
    getUsedCapacityByRemoteIds: vi.fn(async () => [{ remoteId: 1n, usedCapacity: 700n }]),
    updateRemoteUsageSnapshot: vi.fn(async () => undefined),
    updateRemoteCapacitySettings: vi.fn(async () => undefined),
    updateRemoteSettings: vi.fn(async () => undefined),
    updateRemoteBindingStatus: vi.fn(async () => undefined),
    updateRemoteActiveState: vi.fn(async () => undefined),
    writeRemoteAlert: vi.fn(async () => undefined),
    deleteRemote: vi.fn(async () => undefined),
    ...overrides
  };
}

function createRcloneStub(overrides: Partial<IRcloneClient> = {}): IRcloneClient {
  return {
    checkOnline: vi.fn(async () => true),
    listRemotes: vi.fn(async () => ['driveA', 'driveB']),
    getAbout: vi.fn(async () => ({ total: null, used: null, free: null })),
    stat: vi.fn(async () => true),
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
  it('creates a business remote after validating the bound rclone remote exists', async () => {
    const repository = createRepositoryStub({
      findRemoteById: vi.fn(async () => buildRemote({ remoteName: 'driveB', displayName: '相册备份盘' }))
    });
    const rclone = createRcloneStub();
    const service = new CloudInventoryService(repository, rclone);

    const created = await service.createRemote({
      displayName: '相册备份盘',
      remoteName: 'driveB',
      totalCapacity: 2_000n,
      reservedCapacity: 100n,
      warningThresholdPercent: 85
    });

    expect(rclone.listRemotes).toHaveBeenCalled();
    expect(repository.createRemote).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: '相册备份盘',
        remoteName: 'driveB',
        totalCapacity: 2_000n
      })
    );
    expect(created.displayName).toBe('相册备份盘');
  });

  it('returns current rclone remote options', async () => {
    const service = new CloudInventoryService(
      createRepositoryStub({
        listRemotes: vi.fn(async () => [])
      }),
      createRcloneStub()
    );

    const options = await service.listRcloneRemoteOptions();

    expect(options).toEqual([
      { remoteName: 'driveA', available: true },
      { remoteName: 'driveB', available: true }
    ]);
  });

  it('marks already bound rclone remote as unavailable in options', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ id: 2n, remoteName: 'driveA', displayName: '已绑定云盘' })])
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    const options = await service.listRcloneRemoteOptions();

    expect(options).toEqual([
      { remoteName: 'driveA', available: false, boundRemoteId: '2', boundDisplayName: '已绑定云盘' },
      { remoteName: 'driveB', available: true }
    ]);
  });

  it('rejects creation when the rclone remote is already bound by another business remote', async () => {
    const repository = createRepositoryStub({
      getRemoteByBoundRemoteName: vi.fn(async () => buildRemote({ id: 3n, remoteName: 'driveB', displayName: '已有业务盘' }))
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    await expect(
      service.createRemote({
        displayName: '新盘',
        remoteName: 'driveB'
      })
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST'
    });
  });

  it('marks a business remote unavailable and writes an alert when the bound rclone remote disappears', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ id: 8n, remoteName: 'driveZ', displayName: '素材盘' })])
    });
    const service = new CloudInventoryService(repository, createRcloneStub({ listRemotes: vi.fn(async () => ['driveA']) }));

    const summary = await service.checkRemoteBindings();

    expect(repository.updateRemoteBindingStatus).toHaveBeenCalledWith(
      8n,
      expect.objectContaining({
        healthStatus: 'unavailable',
        lastCheckedAt: expect.any(Date)
      })
    );
    expect(repository.writeRemoteAlert).toHaveBeenCalledWith(
      8n,
      expect.objectContaining({
        code: 'bound_remote_missing'
      })
    );
    expect(summary.unavailable).toContain('素材盘');
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

  it('includes remote cloud trash fields in remote cards', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ cloudTrashEnabled: true, cloudTrashBasePath: 'trash-a' })])
    });
    const service = new CloudInventoryService(repository, createRcloneStub());

    const cards = await service.listRemoteCards();

    expect(cards[0]?.cloudTrashEnabled).toBe(true);
    expect(cards[0]?.cloudTrashBasePath).toBe('trash-a');
  });

  it('updates remote cloud trash settings', async () => {
    const repository = createRepositoryStub();
    const service = new CloudInventoryService(repository, createRcloneStub());

    await service.updateRemoteSettings(1n, {
      cloudTrashEnabled: true,
      cloudTrashBasePath: 'trash-a'
    });

    expect(repository.updateRemoteSettings).toHaveBeenCalledWith(1n, {
      cloudTrashEnabled: true,
      cloudTrashBasePath: 'trash-a'
    });
  });

  it('deletes a business remote', async () => {
    const repository = createRepositoryStub();
    const service = new CloudInventoryService(repository, createRcloneStub());

    await service.deleteRemote(1n);

    expect(repository.deleteRemote).toHaveBeenCalledWith(1n);
  });

  it('prefers real remote usage from rclone about when available', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [
        buildRemote({
          remoteName: 'myBlomp',
          remoteRootPath: 'user@example.com',
          totalCapacity: 0n,
          usedCapacity: 0n,
          reservedCapacity: 100n
        })
      ]),
      getUsedCapacityByRemoteIds: vi.fn(async (): Promise<RemoteUsageAggregate[]> => [])
    });
    const rclone = createRcloneStub({
      getAbout: vi.fn(async () => ({ total: '1000', used: '250', free: '750' }))
    });
    const service = new CloudInventoryService(repository, rclone);

    const cards = await service.listRemoteCards();

    expect(cards[0]?.capacity.usedCapacityBytes).toBe('250');
    expect(cards[0]?.capacity.totalCapacityBytes).toBe('1000');
    expect(cards[0]?.capacity.remainingCapacityBytes).toBe('650');
    expect(rclone.getAbout).toHaveBeenCalledWith('myBlomp:user@example.com');
  });

  it('marks remote usage as unavailable when rclone about is forbidden', async () => {
    const repository = createRepositoryStub({
      listRemotes: vi.fn(async () => [buildRemote({ totalCapacity: 40n * 1024n * 1024n * 1024n, usedCapacity: 0n })]),
      getUsedCapacityByRemoteIds: vi.fn(async (): Promise<RemoteUsageAggregate[]> => [])
    });
    const rclone = createRcloneStub({
      getAbout: vi.fn(async () => {
        throw new Error('Operation forbidden');
      })
    });
    const service = new CloudInventoryService(repository, rclone);

    const cards = await service.listRemoteCards();

    expect(cards[0]?.capacity.usedCapacityBytes).toBe('0');
    expect(cards[0]?.capacity.realUsageAvailable).toBe(false);
  });
});

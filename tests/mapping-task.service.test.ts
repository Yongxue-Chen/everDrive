import { describe, expect, it, vi } from 'vitest';
import type { HealthStatus } from '@prisma/client';
import { MappingTaskService, type MappingTaskRepository, type MappingTaskRecord } from '../src/modules/mapping-task/mapping-task.service.js';

type RemoteCapacity = {
  remoteId: bigint;
  remoteName: string;
  displayName: string;
  isActive: boolean;
  healthStatus: HealthStatus;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
};

function buildTaskRecord(partial: Partial<MappingTaskRecord> = {}): MappingTaskRecord {
  return {
    id: 100n,
    name: 'photos',
    localPath: '/data/photos',
    sourceType: 'local',
    sourceRemoteName: null,
    sourcePath: '',
    syncMode: 'archive',
    encryptionEnabled: true,
    redundancyEnabled: false,
    splitEnabled: false,
    isActive: true,
    deletedAt: null,
    createdAt: new Date('2026-03-26T10:00:00.000Z'),
    updatedAt: new Date('2026-03-26T10:00:00.000Z'),
    lastSyncAt: null,
    remotes: [
      {
        id: 1n,
        remoteId: 11n,
        role: 'primary',
        priority: 100,
        remoteBasePath: '',
        remote: {
          id: 11n,
          remoteName: 'driveA',
          displayName: 'Drive A',
          isActive: true,
          healthStatus: 'healthy',
          totalCapacity: 1000n,
          usedCapacity: 100n,
          reservedCapacity: 0n
        }
      }
    ],
    ...partial
  };
}

function buildRemoteCapacity(partial: Partial<RemoteCapacity>): RemoteCapacity {
  return {
    remoteId: 11n,
    remoteName: 'driveA',
    displayName: 'Drive A',
    isActive: true,
    healthStatus: 'healthy',
    totalCapacity: 1000n,
    usedCapacity: 200n,
    reservedCapacity: 0n,
    ...partial
  };
}

function createRepositoryStub(overrides: Partial<MappingTaskRepository> = {}): MappingTaskRepository {
  return {
    createTask: vi.fn(async () => buildTaskRecord()),
    listTasks: vi.fn(async () => [buildTaskRecord()]),
    listActiveTaskIds: vi.fn(async () => [100n]),
    findTaskById: vi.fn(async () => buildTaskRecord()),
    updateTask: vi.fn(async () => buildTaskRecord()),
    setTaskActive: vi.fn(async () => buildTaskRecord()),
    softDeleteTask: vi.fn(async () => buildTaskRecord({ isActive: false, deletedAt: new Date('2026-03-26T12:00:00.000Z') })),
    hardDeleteTask: vi.fn(async () => undefined),
    listRemoteCapacities: vi.fn(async () => [buildRemoteCapacity({ remoteId: 11n })]),
    ...overrides
  };
}

describe('MappingTaskService', () => {
  it('normalizes local path and creates single-primary mapping', async () => {
    const repository = createRepositoryStub();
    const service = new MappingTaskService(repository);

    await service.createTask({
      name: 'photos',
      localPath: '/data//photos/./2026/',
      syncMode: 'archive',
      encryptionEnabled: true,
      redundancyEnabled: false,
      splitEnabled: false,
      remoteBindings: [{ remoteId: 11n }]
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        localPath: '/data/photos/2026',
        remoteBindings: [{ remoteId: 11n, role: 'primary', priority: 100, remoteBasePath: '' }]
      })
    );
  });

  it('rejects empty local path', async () => {
    const service = new MappingTaskService(createRepositoryStub());

    await expect(
      service.createTask({
        name: 'docs',
        localPath: '   ',
        syncMode: 'archive',
        encryptionEnabled: false,
        redundancyEnabled: false,
        splitEnabled: false,
        remoteBindings: [{ remoteId: 11n }]
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('requires at least one remote', async () => {
    const service = new MappingTaskService(createRepositoryStub());

    await expect(
      service.createTask({
        name: 'docs',
        localPath: '/data/docs',
        syncMode: 'archive',
        encryptionEnabled: false,
        redundancyEnabled: false,
        splitEnabled: false,
        remoteBindings: []
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('requires two or more remotes when redundancy is enabled', async () => {
    const service = new MappingTaskService(createRepositoryStub());

    await expect(
      service.createTask({
        name: 'docs',
        localPath: '/data/docs',
        syncMode: 'archive',
        encryptionEnabled: false,
        redundancyEnabled: true,
        splitEnabled: false,
        remoteBindings: [{ remoteId: 11n }]
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('validates split mode remote capacity and estimated total size', async () => {
    const service = new MappingTaskService(
      createRepositoryStub({
        listRemoteCapacities: vi.fn(async () => [
          buildRemoteCapacity({ remoteId: 11n, totalCapacity: 300n, usedCapacity: 250n }),
          buildRemoteCapacity({ remoteId: 22n, totalCapacity: 400n, usedCapacity: 200n })
        ])
      })
    );

    await expect(
      service.createTask({
        name: 'video',
        localPath: '/data/video',
        syncMode: 'mirror',
        encryptionEnabled: false,
        redundancyEnabled: false,
        splitEnabled: true,
        expectedDataSizeBytes: 300n,
        remoteBindings: [{ remoteId: 11n }, { remoteId: 22n }]
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('marks extra remotes as backup when redundancy is enabled', async () => {
    const repository = createRepositoryStub({
      listRemoteCapacities: vi.fn(async () => [buildRemoteCapacity({ remoteId: 11n }), buildRemoteCapacity({ remoteId: 22n })])
    });
    const service = new MappingTaskService(repository);

    await service.createTask({
      name: 'archive-docs',
      localPath: '/data/archive-docs',
      syncMode: 'archive',
      encryptionEnabled: false,
      redundancyEnabled: true,
      splitEnabled: false,
      remoteBindings: [{ remoteId: 11n }, { remoteId: 22n }]
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteBindings: [
          { remoteId: 11n, role: 'primary', priority: 100, remoteBasePath: '' },
          { remoteId: 22n, role: 'backup', priority: 200, remoteBasePath: '' }
        ]
      })
    );
  });

  it('marks remotes as shard in split mode', async () => {
    const repository = createRepositoryStub({
      listRemoteCapacities: vi.fn(async () => [buildRemoteCapacity({ remoteId: 11n }), buildRemoteCapacity({ remoteId: 22n })])
    });
    const service = new MappingTaskService(repository);

    await service.createTask({
      name: 'media-split',
      localPath: '/data/media',
      syncMode: 'mirror',
      encryptionEnabled: false,
      redundancyEnabled: false,
      splitEnabled: true,
      remoteBindings: [{ remoteId: 11n }, { remoteId: 22n }]
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteBindings: [
          { remoteId: 11n, role: 'shard', priority: 100, remoteBasePath: '' },
          { remoteId: 22n, role: 'shard', priority: 200, remoteBasePath: '' }
        ]
      })
    );
  });

  it('normalizes remoteBasePath per binding', async () => {
    const repository = createRepositoryStub();
    const service = new MappingTaskService(repository);

    await service.createTask({
      name: 'docs',
      localPath: '/data/docs',
      syncMode: 'archive',
      encryptionEnabled: false,
      redundancyEnabled: false,
      splitEnabled: false,
      remoteBindings: [{ remoteId: 11n, remoteBasePath: '/team//backup/2026/' }]
    });

    expect(repository.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        remoteBindings: [{ remoteId: 11n, role: 'primary', priority: 100, remoteBasePath: 'team/backup/2026' }]
      })
    );
  });

  it('maps deleted records to deleted status', async () => {
    const service = new MappingTaskService(
      createRepositoryStub({
        findTaskById: vi.fn(async () => buildTaskRecord({ deletedAt: new Date('2026-03-26T12:00:00.000Z'), isActive: false }))
      })
    );

    const detail = await service.getTaskDetail(100n, { includeDeleted: true });

    expect(detail.status).toBe('deleted');
  });

  it('supports soft delete by default', async () => {
    const repository = createRepositoryStub();
    const service = new MappingTaskService(repository);

    const item = await service.deleteTask(100n);

    expect(repository.softDeleteTask).toHaveBeenCalledWith(100n);
    if (!item) {
      throw new Error('soft delete should return task view');
    }
    expect(item.status).toBe('deleted');
  });

  it('supports hard delete when requested', async () => {
    const repository = createRepositoryStub();
    const service = new MappingTaskService(repository);

    await service.deleteTask(100n, { hardDelete: true });

    expect(repository.hardDeleteTask).toHaveBeenCalledWith(100n);
  });

  it('normalizes a readonly rclone source identity', async () => {
    const repository = createRepositoryStub({ createTask: vi.fn(async (input:any) => buildTaskRecord({ sourceType: input.sourceType, sourceRemoteName: input.sourceRemoteName, sourcePath: input.sourcePath, localPath: input.localPath } as any)) });
    const service = new MappingTaskService(repository);
    const item = await service.createTask({ name:'lan photos', sourceType:'rclone', sourceRemoteName:'lan-smb', sourcePath:'/photos//2026/', localPath:'/', syncMode:'mirror', encryptionEnabled:false, redundancyEnabled:false, splitEnabled:false, remoteBindings:[{remoteId:11n}] } as any);
    expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({ sourceType:'rclone', sourceRemoteName:'lan-smb', sourcePath:'photos/2026', localPath:'rclone://lan-smb/photos/2026' }));
    expect((item as any).source_type).toBe('rclone');
  });

  it('rebuilds remote source identity when a partial update changes sourcePath', async () => {
    const current = buildTaskRecord({ sourceType: 'rclone', sourceRemoteName: 'office smb', sourcePath: 'photos', localPath: 'rclone://office smb/photos' });
    const repository = createRepositoryStub({ findTaskById: vi.fn(async () => current), updateTask: vi.fn(async (_id, input:any) => ({ ...current, ...input })) });
    const service = new MappingTaskService(repository);
    await service.updateTask(100n, { sourcePath: 'photos/2026' });
    expect(repository.updateTask).toHaveBeenCalledWith(100n, expect.objectContaining({ sourceType: 'rclone', sourceRemoteName: 'office smb', sourcePath: 'photos/2026', localPath: 'rclone://office smb/photos/2026' }));
  });

  it('requires a local path when switching a remote source back to local', async () => {
    const current = buildTaskRecord({ sourceType: 'rclone', sourceRemoteName: 'office smb', sourcePath: 'photos', localPath: 'rclone://office smb/photos' });
    const service = new MappingTaskService(createRepositoryStub({ findTaskById: vi.fn(async () => current) }));
    await expect(service.updateTask(100n, { sourceType: 'local' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

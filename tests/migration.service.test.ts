import { describe, expect, it, vi } from 'vitest';
import type { RcloneService } from '../src/infrastructure/rclone/rclone.service.js';
import type { MigrationRepository } from '../src/modules/migration/migration.repository.js';
import { MigrationService } from '../src/modules/migration/migration.service.js';

function repoStub(overrides: Partial<MigrationRepository> = {}): MigrationRepository {
  return {
    findTask: vi.fn(async () => ({ id: 1n, name: 'photos', localPath: '/data/photos', isActive: true, deletedAt: null })),
    findRemote: vi.fn(async (id: bigint) => ({
      id,
      remoteName: id === 11n ? 'driveA' : 'driveB',
      remoteRootPath: '',
      isActive: true,
      totalCapacity: 10_000n,
      usedCapacity: 1_000n,
      reservedCapacity: 0n
    })),
    createMigrationJob: vi.fn(async () => 9n),
    completeMigrationJob: vi.fn(async () => undefined),
    failMigrationJob: vi.fn(async () => undefined),
    estimateMigrationSizeBytes: vi.fn(async () => 500n),
    applyMigrationMapping: vi.fn(async () => ({ affectedFileLocations: 7 })),
    writeMigrationLog: vi.fn(async () => undefined),
    ...overrides
  } as unknown as MigrationRepository;
}

function rcloneStub(overrides: Partial<RcloneService> = {}): RcloneService {
  return {
    ensureOnline: vi.fn(async () => undefined),
    listRemotes: vi.fn(async () => []),
    listConfigProviders: vi.fn(async () => ({ providers: [] })),
    remoteToRemoteCopy: vi.fn(async () => ({ async: false as const, result: {} })),
    waitForJob: vi.fn(async () => ({ finished: true, success: true })),
    ...overrides
  } as unknown as RcloneService;
}

describe('MigrationService', () => {
  it('runs remote-to-remote migration then updates mapping', async () => {
    const repo = repoStub();
    const rclone = rcloneStub();
    const service = new MigrationService(repo, rclone);

    const summary = await service.runMigration({
      mappingTaskId: 1n,
      sourceRemoteId: 11n,
      targetRemoteId: 22n,
      scopeRelativePath: '2026',
      removeSourceReplica: true
    });

    expect(summary.affectedFileLocations).toBe(7);
    expect(rclone.remoteToRemoteCopy).toHaveBeenCalled();
    expect(repo.applyMigrationMapping).toHaveBeenCalled();
  });

  it('rejects when target capacity is insufficient', async () => {
    const repo = repoStub({
      findRemote: vi.fn(async (id: bigint) => ({
        id,
        remoteName: id === 11n ? 'driveA' : 'driveB',
        remoteRootPath: '',
        isActive: true,
        totalCapacity: 1000n,
        usedCapacity: 990n,
        reservedCapacity: 0n
      })),
      estimateMigrationSizeBytes: vi.fn(async () => 100n)
    });

    const service = new MigrationService(repo, rcloneStub());
    await expect(
      service.runMigration({
        mappingTaskId: 1n,
        sourceRemoteId: 11n,
        targetRemoteId: 22n
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('marks migration job failed when copy throws', async () => {
    const repo = repoStub();
    const rclone = rcloneStub({
      remoteToRemoteCopy: vi.fn(async () => {
        throw new Error('copy failed');
      })
    });
    const service = new MigrationService(repo, rclone);

    await expect(
      service.runMigration({
        mappingTaskId: 1n,
        sourceRemoteId: 11n,
        targetRemoteId: 22n
      })
    ).rejects.toThrow('copy failed');

    expect(repo.failMigrationJob).toHaveBeenCalled();
    expect(repo.applyMigrationMapping).not.toHaveBeenCalled();
  });
});

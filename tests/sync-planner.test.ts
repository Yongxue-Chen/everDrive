import { FileSyncStatus, ScanStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { SyncContext, SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';
import { SyncPlanner } from '../src/modules/sync/sync-planner.service.js';

function context(syncMode: 'archive' | 'mirror', splitEnabled = false): SyncContext {
  return {
    id: 1n,
    name: 'photos',
    localPath: '/data/photos',
    syncMode,
    splitEnabled,
    isActive: true,
    deletedAt: null,
    remotes: [
      {
        remoteId: 11n,
        priority: 100,
        role: 'primary',
        remote: {
          id: 11n,
          remoteName: 'driveA',
          isActive: true,
          totalCapacity: 500n,
          usedCapacity: 100n,
          reservedCapacity: 0n,
          warningThresholdPercent: 90
        }
      },
      {
        remoteId: 22n,
        priority: 200,
        role: 'backup',
        remote: {
          id: 22n,
          remoteName: 'driveB',
          isActive: true,
          totalCapacity: 300n,
          usedCapacity: 260n,
          reservedCapacity: 0n,
          warningThresholdPercent: 90
        }
      }
    ],
    files: [
      {
        id: 101n,
        localPath: '/data/photos/new.jpg',
        relativePath: 'new.jpg',
        fileSize: 30n,
        scanStatus: ScanStatus.scanned,
        updatedAt: new Date('2026-03-26T10:00:00.000Z'),
        fileLocations: []
      },
      {
        id: 102n,
        localPath: '/data/photos/old.jpg',
        relativePath: 'old.jpg',
        fileSize: 20n,
        scanStatus: ScanStatus.missing,
        updatedAt: new Date('2026-03-26T09:00:00.000Z'),
        fileLocations: [
          {
            id: 1n,
            remoteId: 11n,
            remotePath: 'old.jpg',
            remoteFileName: 'old.jpg',
            syncStatus: FileSyncStatus.synced
          }
        ]
      }
    ]
  };
}

function repoStub(ctx: SyncContext): SyncEngineRepository {
  return {
    findSyncContext: vi.fn(async () => ctx),
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

describe('SyncPlanner', () => {
  it('keeps delete as skip in archive mode', async () => {
    const planner = new SyncPlanner(repoStub(context('archive')));
    const plan = await planner.buildPlan(1n, { deleteGraceSeconds: 0 });

    expect(plan.uploadActions.length).toBeGreaterThan(0);
    expect(plan.deleteActions).toHaveLength(0);
    expect(plan.skipActions.some((item) => item.reason.includes('archive mode'))).toBe(true);
  });

  it('generates delete action in mirror mode', async () => {
    const planner = new SyncPlanner(repoStub(context('mirror')));
    const plan = await planner.buildPlan(1n, { deleteGraceSeconds: 0 });

    expect(plan.deleteActions).toHaveLength(1);
    expect(plan.deleteActions[0]?.targets[0]?.remoteName).toBe('driveA');
  });

  it('generates multi-remote upload actions for redundancy', async () => {
    const planner = new SyncPlanner(repoStub(context('archive')));
    const plan = await planner.buildPlan(1n);

    const upload = plan.uploadActions.find((item) => item.fileId === '101');
    expect(upload?.targets.map((item) => item.remoteName)).toEqual(['driveA', 'driveB']);
  });

  it('uses split mode to place one file on a single best-fit remote', async () => {
    const planner = new SyncPlanner(repoStub(context('archive', true)));
    const plan = await planner.buildPlan(1n);

    const upload = plan.uploadActions.find((item) => item.fileId === '101');
    expect(upload?.targets).toHaveLength(1);
    expect(upload?.targets[0]?.remoteName).toBe('driveA');
  });

  it('plans rename action when rename hint matches changed file', async () => {
    const ctx = context('archive');
    ctx.files = [
      {
        id: 201n,
        localPath: '/data/photos/new-name.jpg',
        relativePath: 'new-name.jpg',
        fileSize: 50n,
        scanStatus: ScanStatus.changed,
        updatedAt: new Date('2026-03-26T10:00:00.000Z'),
        fileLocations: [
          {
            id: 1n,
            remoteId: 11n,
            remotePath: 'old-name.jpg',
            remoteFileName: 'old-name.jpg',
            syncStatus: FileSyncStatus.synced
          }
        ]
      }
    ] as any;

    const repository = repoStub(ctx);
    repository.listRenameHints = vi.fn(async () => [
      {
        fileId: 201n,
        fromPath: '/data/photos/old-name.jpg',
        toPath: '/data/photos/new-name.jpg',
        detectedAt: new Date('2026-03-26T10:00:00.000Z')
      }
    ]);

    const planner = new SyncPlanner(repository);
    const plan = await planner.buildPlan(1n, { renameHintWindowSeconds: 60 });

    expect(plan.renameActions).toHaveLength(1);
    expect(plan.renameActions[0]?.fromPath).toContain('old-name.jpg');
    expect(plan.uploadActions).toHaveLength(0);
  });
});

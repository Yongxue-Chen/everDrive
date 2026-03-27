import { describe, expect, it, vi } from 'vitest';
import { SyncEngineRepository } from '../src/modules/sync/sync-engine.repository.js';

describe('SyncEngineRepository', () => {
  it('maps prisma mappingTaskRemotes into sync context remotes', async () => {
    const prisma = {
      mappingTask: {
        findFirst: vi.fn(async () => ({
          id: 2n,
          name: 'Photos',
          localPath: '/data/photos',
          syncMode: 'mirror',
          encryptionEnabled: false,
          splitEnabled: false,
          isActive: true,
          deletedAt: null,
          mappingTaskRemotes: [
            {
              remoteId: 11n,
              priority: 1,
              role: 'primary',
              remoteBasePath: 'team/photos',
              remote: {
                id: 11n,
                remoteName: 'driveA',
                remoteRootPath: '',
                isActive: true,
                cloudTrashEnabled: false,
                cloudTrashBasePath: '.everdrive-trash',
                totalCapacity: 1000n,
                usedCapacity: 200n,
                reservedCapacity: 0n,
                warningThresholdPercent: 85
              }
            }
          ],
          files: []
        }))
      }
    } as any;

    const repository = new SyncEngineRepository(prisma);
    const context = await repository.findSyncContext(2n);

    expect(context?.remotes).toHaveLength(1);
    expect(context?.remotes[0]?.remote.remoteName).toBe('driveA');
    expect(context?.remotes[0]?.remoteBasePath).toBe('team/photos');
  });
});

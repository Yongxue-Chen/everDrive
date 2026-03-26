import { describe, expect, it, vi } from 'vitest';
import type { RedundancyOverviewRow, RedundancyRepository } from '../src/modules/redundancy/redundancy.repository.js';
import { RedundancyViewService } from '../src/modules/redundancy/redundancy-view.service.js';

function row(): RedundancyOverviewRow {
  return {
    id: 1n,
    name: 'photos',
    localPath: '/data/photos',
    redundancyEnabled: true,
    mappingTaskRemotes: [
      { remoteId: 11n, priority: 100, remote: { id: 11n, remoteName: 'driveA', displayName: 'Drive A', isActive: true } },
      { remoteId: 22n, priority: 200, remote: { id: 22n, remoteName: 'driveB', displayName: 'Drive B', isActive: true } }
    ],
    files: [
      {
        id: 101n,
        fileLocations: [
          { remoteId: 11n, syncStatus: 'synced' },
          { remoteId: 22n, syncStatus: 'synced' }
        ]
      },
      {
        id: 102n,
        fileLocations: [{ remoteId: 11n, syncStatus: 'failed' }]
      }
    ]
  };
}

describe('RedundancyViewService', () => {
  it('builds frontend redundancy dto with protection level', async () => {
    const repository: Partial<RedundancyRepository> = {
      findTaskOverview: vi.fn(async () => row())
    };
    const service = new RedundancyViewService(repository as RedundancyRepository);

    const dto = await service.getTaskOverview(1n);

    expect(dto.replicaTarget).toBe(2);
    expect(dto.replicaAchieved).toBe(0);
    expect(dto.protectionLevel).toBe('critical');
    expect(dto.remotes).toHaveLength(2);
  });
});

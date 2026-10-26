import { ScanStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { DashboardRepository } from '../src/modules/dashboard/dashboard.repository.js';

describe('DashboardRepository', () => {
  it('returns actionable scan-status counts from the database query', async () => {
    const queryRaw = vi.fn(async () => [
      { mappingTaskId: 5n, scanStatus: ScanStatus.changed, count: 2n },
      { mappingTaskId: 6n, scanStatus: ScanStatus.missing, count: 1n }
    ]);
    const repository = new DashboardRepository({ $queryRaw: queryRaw } as never);

    await expect(repository.listTaskScanStatusAggregates()).resolves.toEqual([
      { mappingTaskId: 5n, scanStatus: ScanStatus.changed, count: 2 },
      { mappingTaskId: 6n, scanStatus: ScanStatus.missing, count: 1 }
    ]);
    expect(queryRaw).toHaveBeenCalledOnce();
  });
});

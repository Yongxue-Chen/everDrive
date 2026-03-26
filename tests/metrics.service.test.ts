import { JobStatus, JobType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { MetricsService } from '../src/modules/observability/metrics.service.js';

describe('MetricsService', () => {
  it('returns queue and success metrics', async () => {
    const prisma = {
      syncJob: {
        count: async ({ where }: any) => {
          if (where.status === JobStatus.queued) return 3;
          if (where.status === JobStatus.running) return 2;
          if (where.status === JobStatus.failed) return 4;
          return 0;
        },
        findMany: async ({ where }: any) => {
          if (where?.jobType === JobType.sync) {
            return [{ status: JobStatus.success }, { status: JobStatus.failed }, { status: JobStatus.success }];
          }
          return [
            {
              id: 1n,
              jobType: JobType.sync,
              mappingTaskId: 11n,
              errorMessage: 'failed',
              createdAt: new Date('2026-03-26T10:00:00.000Z')
            }
          ];
        }
      },
      cloudRemote: {
        findMany: async () => [
          {
            totalCapacity: 1000n,
            usedCapacity: 900n,
            reservedCapacity: 0n,
            warningThresholdPercent: 85,
            healthStatus: 'healthy'
          },
          {
            totalCapacity: 1000n,
            usedCapacity: 100n,
            reservedCapacity: 0n,
            warningThresholdPercent: 85,
            healthStatus: 'healthy'
          }
        ]
      }
    } as any;

    const service = new MetricsService(prisma);
    const data = await service.getOverview();

    expect(data.queueLength).toBe(3);
    expect(data.runningTasks).toBe(2);
    expect(data.failedTasks24h).toBe(4);
    expect(data.remoteCapacityNearLimitCount).toBe(1);
    expect(data.recentSyncSuccessRate).toBeCloseTo(66.67, 1);
    expect(data.recentFailedJobs[0]?.jobId).toBe('1');
  });
});

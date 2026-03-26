import { JobStatus, JobType, PrismaClient } from '@prisma/client';

export class MetricsService {
  constructor(private readonly prisma: PrismaClient) {}

  async getOverview(): Promise<{
    queueLength: number;
    runningTasks: number;
    failedTasks24h: number;
    remoteCapacityNearLimitCount: number;
    recentSyncSuccessRate: number;
    recentFailedJobs: Array<{
      jobId: string;
      jobType: string;
      mappingTaskId: string;
      errorMessage: string | null;
      createdAt: string;
    }>;
  }> {
    const now = Date.now();
    const from24h = new Date(now - 24 * 60 * 60 * 1000);

    const [queueLength, runningTasks, failedTasks24h, remotes, recentSyncJobs, recentFailedJobs] = await Promise.all([
      this.prisma.syncJob.count({ where: { status: JobStatus.queued } }),
      this.prisma.syncJob.count({ where: { status: JobStatus.running } }),
      this.prisma.syncJob.count({
        where: {
          status: JobStatus.failed,
          createdAt: { gte: from24h }
        }
      }),
      this.prisma.cloudRemote.findMany({
        where: { isActive: true },
        select: {
          totalCapacity: true,
          usedCapacity: true,
          reservedCapacity: true,
          warningThresholdPercent: true,
          healthStatus: true
        }
      }),
      this.prisma.syncJob.findMany({
        where: {
          jobType: JobType.sync
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { status: true }
      }),
      this.prisma.syncJob.findMany({
        where: { status: JobStatus.failed },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          jobType: true,
          mappingTaskId: true,
          errorMessage: true,
          createdAt: true
        }
      })
    ]);

    const remoteCapacityNearLimitCount = remotes.filter((remote) => {
      const available = remote.totalCapacity - remote.reservedCapacity > 0n ? remote.totalCapacity - remote.reservedCapacity : 0n;
      if (available === 0n) {
        return true;
      }
      const usagePercent = Number((remote.usedCapacity * 10000n) / available) / 100;
      return usagePercent >= remote.warningThresholdPercent || remote.healthStatus === 'warning' || remote.healthStatus === 'full';
    }).length;

    const syncFinished = recentSyncJobs.filter((item) => item.status === JobStatus.success || item.status === JobStatus.failed);
    const successCount = syncFinished.filter((item) => item.status === JobStatus.success).length;
    const recentSyncSuccessRate = syncFinished.length === 0 ? 0 : Number(((successCount / syncFinished.length) * 100).toFixed(2));

    return {
      queueLength,
      runningTasks,
      failedTasks24h,
      remoteCapacityNearLimitCount,
      recentSyncSuccessRate,
      recentFailedJobs: recentFailedJobs.map((job) => ({
        jobId: job.id.toString(),
        jobType: job.jobType,
        mappingTaskId: job.mappingTaskId.toString(),
        errorMessage: job.errorMessage ?? null,
        createdAt: job.createdAt.toISOString()
      }))
    };
  }
}

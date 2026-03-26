import { JobType, Prisma, PrismaClient, ScanStatus } from '@prisma/client';

export type WorkspaceTaskRow = {
  id: bigint;
  name: string;
  localPath: string;
  encryptionEnabled: boolean;
  redundancyEnabled: boolean;
  remotes: Array<{
    remoteId: bigint;
    role: string;
    priority: number;
    remote: {
      remoteName: string;
      displayName: string;
      healthStatus: string;
      isActive: boolean;
    };
  }>;
  lastSuccessfulSyncAt: Date | null;
};

export type TaskFileAggregateRow = {
  mappingTaskId: bigint;
  fileCount: number;
  totalSize: bigint;
};

export type TaskScanStatusAggregateRow = {
  mappingTaskId: bigint;
  scanStatus: ScanStatus;
  count: number;
};

export type LatestSyncJobRow = {
  mappingTaskId: bigint;
  status: string;
  finishedAt: Date | null;
};

export type RemoteRow = {
  id: bigint;
  remoteName: string;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
  warningThresholdPercent: number;
  healthStatus: string;
  isActive: boolean;
  mappingTasks: Array<{
    id: bigint;
    name: string;
    localPath: string;
  }>;
};

export type RemoteFileCountRow = {
  remoteId: bigint;
  fileCount: number;
};

export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listWorkspaceTasks(): Promise<WorkspaceTaskRow[]> {
    const rows = await this.prisma.mappingTask.findMany({
      where: {
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        localPath: true,
        encryptionEnabled: true,
        redundancyEnabled: true,
        mappingTaskRemotes: {
          select: {
            remoteId: true,
            role: true,
            priority: true,
            remote: {
              select: {
                remoteName: true,
                displayName: true,
                healthStatus: true,
                isActive: true
              }
            }
          },
          orderBy: {
            priority: 'asc'
          }
        },
        syncJobs: {
          where: {
            jobType: JobType.sync,
            status: 'success',
            finishedAt: {
              not: null
            }
          },
          orderBy: {
            finishedAt: 'desc'
          },
          take: 1,
          select: {
            finishedAt: true
          }
        }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      localPath: row.localPath,
      encryptionEnabled: row.encryptionEnabled,
      redundancyEnabled: row.redundancyEnabled,
      remotes: row.mappingTaskRemotes.map((item) => ({
        remoteId: item.remoteId,
        role: item.role,
        priority: item.priority,
        remote: {
          remoteName: item.remote.remoteName,
          displayName: item.remote.displayName,
          healthStatus: item.remote.healthStatus,
          isActive: item.remote.isActive
        }
      })),
      lastSuccessfulSyncAt: row.syncJobs[0]?.finishedAt ?? null
    }));
  }

  async listTaskFileAggregates(): Promise<TaskFileAggregateRow[]> {
    const rows = await this.prisma.file.groupBy({
      by: ['mappingTaskId'],
      where: {
        mappingTask: {
          deletedAt: null
        }
      },
      _count: {
        _all: true
      },
      _sum: {
        fileSize: true
      }
    });

    return rows.map((row) => ({
      mappingTaskId: row.mappingTaskId,
      fileCount: row._count._all,
      totalSize: row._sum.fileSize ?? 0n
    }));
  }

  async listTaskScanStatusAggregates(): Promise<TaskScanStatusAggregateRow[]> {
    const rows = await this.prisma.file.groupBy({
      by: ['mappingTaskId', 'scanStatus'],
      where: {
        mappingTask: {
          deletedAt: null
        }
      },
      _count: {
        _all: true
      }
    });

    return rows.map((row) => ({
      mappingTaskId: row.mappingTaskId,
      scanStatus: row.scanStatus,
      count: row._count._all
    }));
  }

  async listLatestSyncJobsByTask(taskIds: bigint[]): Promise<LatestSyncJobRow[]> {
    if (taskIds.length === 0) {
      return [];
    }

    const rows = await this.prisma.$queryRaw<Array<{ mappingTaskId: bigint; status: string; finishedAt: Date | null }>>(Prisma.sql`
      SELECT ranked.mappingTaskId, ranked.status, ranked.finishedAt
      FROM (
        SELECT
          sj.mapping_task_id AS mappingTaskId,
          sj.status AS status,
          sj.finished_at AS finishedAt,
          ROW_NUMBER() OVER (
            PARTITION BY sj.mapping_task_id
            ORDER BY sj.created_at DESC, sj.id DESC
          ) AS rn
        FROM sync_jobs sj
        WHERE sj.job_type = 'sync'
          AND sj.mapping_task_id IN (${Prisma.join(taskIds)})
      ) AS ranked
      WHERE ranked.rn = 1
    `);

    return rows;
  }

  async listRemotes(): Promise<RemoteRow[]> {
    const rows = await this.prisma.cloudRemote.findMany({
      select: {
        id: true,
        remoteName: true,
        totalCapacity: true,
        usedCapacity: true,
        reservedCapacity: true,
        warningThresholdPercent: true,
        healthStatus: true,
        isActive: true,
        mappingTaskRemotes: {
          where: {
            mappingTask: {
              deletedAt: null
            }
          },
          select: {
            mappingTask: {
              select: {
                id: true,
                name: true,
                localPath: true
              }
            }
          },
          orderBy: {
            priority: 'asc'
          }
        }
      },
      orderBy: {
        id: 'asc'
      }
    });

    return rows.map((row) => ({
      id: row.id,
      remoteName: row.remoteName,
      totalCapacity: row.totalCapacity,
      usedCapacity: row.usedCapacity,
      reservedCapacity: row.reservedCapacity,
      warningThresholdPercent: row.warningThresholdPercent,
      healthStatus: row.healthStatus,
      isActive: row.isActive,
      mappingTasks: row.mappingTaskRemotes.map((link) => ({
        id: link.mappingTask.id,
        name: link.mappingTask.name,
        localPath: link.mappingTask.localPath
      }))
    }));
  }

  async listRemoteFileCounts(): Promise<RemoteFileCountRow[]> {
    const rows = await this.prisma.fileLocation.groupBy({
      by: ['remoteId'],
      where: {
        syncStatus: {
          not: 'deleted'
        }
      },
      _count: {
        _all: true
      }
    });

    return rows.map((row) => ({
      remoteId: row.remoteId,
      fileCount: row._count._all
    }));
  }
}

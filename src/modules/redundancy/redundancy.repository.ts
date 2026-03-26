import { FileSyncStatus, type PrismaClient } from '@prisma/client';

export type RedundancyOverviewRow = {
  id: bigint;
  name: string;
  localPath: string;
  redundancyEnabled: boolean;
  mappingTaskRemotes: Array<{
    remoteId: bigint;
    priority: number;
    remote: {
      id: bigint;
      remoteName: string;
      displayName: string;
      isActive: boolean;
    };
  }>;
  files: Array<{
    id: bigint;
    fileLocations: Array<{
      remoteId: bigint;
      syncStatus: FileSyncStatus;
    }>;
  }>;
};

export class RedundancyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findTaskOverview(mappingTaskId: bigint): Promise<RedundancyOverviewRow | null> {
    return this.prisma.mappingTask.findFirst({
      where: {
        id: mappingTaskId,
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        localPath: true,
        redundancyEnabled: true,
        mappingTaskRemotes: {
          select: {
            remoteId: true,
            priority: true,
            remote: {
              select: {
                id: true,
                remoteName: true,
                displayName: true,
                isActive: true
              }
            }
          },
          orderBy: { priority: 'asc' }
        },
        files: {
          select: {
            id: true,
            fileLocations: {
              select: {
                remoteId: true,
                syncStatus: true
              }
            }
          }
        }
      }
    }) as unknown as RedundancyOverviewRow | null;
  }

  async listFailedReplicas(mappingTaskId: bigint): Promise<
    Array<{
      fileId: bigint;
      localPath: string;
      relativePath: string;
      remoteId: bigint;
      remoteName: string;
      remotePath: string;
    }>
  > {
    const rows = await this.prisma.fileLocation.findMany({
      where: {
        syncStatus: { in: [FileSyncStatus.failed, FileSyncStatus.pending] },
        file: {
          mappingTaskId
        }
      },
      select: {
        fileId: true,
        remoteId: true,
        remotePath: true,
        file: {
          select: {
            localPath: true,
            relativePath: true
          }
        },
        remote: {
          select: {
            remoteName: true
          }
        }
      }
    });

    return rows.map((row) => ({
      fileId: row.fileId,
      localPath: row.file.localPath,
      relativePath: row.file.relativePath,
      remoteId: row.remoteId,
      remoteName: row.remote.remoteName,
      remotePath: row.remotePath
    }));
  }
}

import { FileSyncStatus, JobStatus, JobType, Prisma, type PrismaClient } from '@prisma/client';

export type MigrationTaskContext = {
  id: bigint;
  name: string;
  localPath: string;
  isActive: boolean;
  deletedAt: Date | null;
};

export type MigrationRemoteContext = {
  id: bigint;
  remoteName: string;
  remoteRootPath: string;
  isActive: boolean;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
};

export class MigrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findTask(taskId: bigint): Promise<MigrationTaskContext | null> {
    return this.prisma.mappingTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        name: true,
        localPath: true,
        isActive: true,
        deletedAt: true
      }
    });
  }

  async findRemote(remoteId: bigint): Promise<MigrationRemoteContext | null> {
    return this.prisma.cloudRemote.findUnique({
      where: { id: remoteId },
      select: {
        id: true,
        remoteName: true,
        remoteRootPath: true,
        isActive: true,
        totalCapacity: true,
        usedCapacity: true,
        reservedCapacity: true
      }
    });
  }

  async createMigrationJob(mappingTaskId: bigint, payload: Record<string, unknown>): Promise<bigint> {
    const row = await this.prisma.syncJob.create({
      data: {
        mappingTaskId,
        jobType: JobType.migrate,
        status: JobStatus.running,
        payloadJson: payload as any,
        startedAt: new Date()
      },
      select: { id: true }
    });
    return row.id;
  }

  async completeMigrationJob(jobId: bigint, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.success,
        payloadJson: payload as any,
        finishedAt: new Date()
      }
    });
  }

  async failMigrationJob(jobId: bigint, message: string, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.failed,
        errorMessage: message,
        payloadJson: payload as any,
        finishedAt: new Date()
      }
    });
  }

  async estimateMigrationSizeBytes(input: {
    mappingTaskId: bigint;
    sourceRemoteId: bigint;
    scopeRelativePath?: string;
  }): Promise<bigint> {
    const whereScope = input.scopeRelativePath
      ? {
          OR: [
            { file: { relativePath: input.scopeRelativePath } },
            { file: { relativePath: { startsWith: `${input.scopeRelativePath}/` } } }
          ]
        }
      : {};

    const rows = await this.prisma.fileLocation.findMany({
      where: {
        remoteId: input.sourceRemoteId,
        syncStatus: { in: [FileSyncStatus.synced, FileSyncStatus.verifying] },
        file: {
          mappingTaskId: input.mappingTaskId
        },
        ...whereScope
      },
      select: {
        file: {
          select: {
            fileSize: true
          }
        }
      }
    });

    return rows.reduce((sum, row) => sum + row.file.fileSize, 0n);
  }

  async applyMigrationMapping(input: {
    mappingTaskId: bigint;
    sourceRemoteId: bigint;
    targetRemoteId: bigint;
    scopeRelativePath?: string;
    removeSourceReplica: boolean;
  }): Promise<{ affectedFileLocations: number }> {
    const whereScope: Prisma.FileLocationWhereInput = input.scopeRelativePath
      ? {
          OR: [
            { file: { relativePath: input.scopeRelativePath } },
            { file: { relativePath: { startsWith: `${input.scopeRelativePath}/` } } }
          ]
        }
      : {};

    const affectedFileLocations = await this.prisma.$transaction(async (tx) => {
      const sourceLocations = await tx.fileLocation.findMany({
        where: {
          remoteId: input.sourceRemoteId,
          file: {
            mappingTaskId: input.mappingTaskId
          },
          ...whereScope
        }
      });

      for (const location of sourceLocations) {
        await tx.fileLocation.upsert({
          where: {
            fileId_remoteId: {
              fileId: location.fileId,
              remoteId: input.targetRemoteId
            }
          },
          create: {
            fileId: location.fileId,
            remoteId: input.targetRemoteId,
            remotePath: location.remotePath,
            remoteFileName: location.remoteFileName,
            syncStatus: FileSyncStatus.synced
          },
          update: {
            remotePath: location.remotePath,
            remoteFileName: location.remoteFileName,
            syncStatus: FileSyncStatus.synced
          }
        });

        if (input.removeSourceReplica) {
          await tx.fileLocation.update({
            where: { id: location.id },
            data: { syncStatus: FileSyncStatus.deleted }
          });
        }
      }

      const existingTargetBinding = await tx.mappingTaskRemote.findUnique({
        where: {
          mappingTaskId_remoteId: {
            mappingTaskId: input.mappingTaskId,
            remoteId: input.targetRemoteId
          }
        }
      });
      if (!existingTargetBinding) {
        const sourceBinding = await tx.mappingTaskRemote.findUnique({
          where: {
            mappingTaskId_remoteId: {
              mappingTaskId: input.mappingTaskId,
              remoteId: input.sourceRemoteId
            }
          }
        });

        await tx.mappingTaskRemote.create({
          data: {
            mappingTaskId: input.mappingTaskId,
            remoteId: input.targetRemoteId,
            role: sourceBinding?.role ?? 'primary',
            priority: sourceBinding?.priority ?? 100,
            remoteBasePath: sourceBinding?.remoteBasePath ?? ''
          }
        });
      }
      return sourceLocations.length;
    });

    return {
      affectedFileLocations
    };
  }

  async writeMigrationLog(input: {
    mappingTaskId: bigint;
    message: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.operationLog.create({
      data: {
        operationType: 'migrate',
        targetType: 'mapping_task',
        targetId: input.mappingTaskId,
        message: input.message,
        metadataJson: input.metadata as any
      }
    });
  }
}

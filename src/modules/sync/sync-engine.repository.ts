import { FileSyncStatus, JobStatus, JobType, OperationType, ScanStatus, TargetType, type PrismaClient } from '@prisma/client';

export type SyncContext = {
  id: bigint;
  name: string;
  localPath: string;
  syncMode: 'archive' | 'mirror';
  encryptionEnabled: boolean;
  splitEnabled: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  remotes: Array<{
    remoteId: bigint;
    priority: number;
    role: 'primary' | 'backup' | 'shard';
    remoteBasePath: string;
    remote: {
      id: bigint;
      remoteName: string;
      remoteRootPath: string;
      isActive: boolean;
      cloudTrashEnabled: boolean;
      cloudTrashBasePath: string;
      totalCapacity: bigint;
      usedCapacity: bigint;
      reservedCapacity: bigint;
      warningThresholdPercent: number;
    };
  }>;
  files: Array<{
    id: bigint;
    localPath: string;
    relativePath: string;
    fileSize: bigint;
    scanStatus: ScanStatus;
    updatedAt: Date;
    fileLocations: Array<{
      id: bigint;
      remoteId: bigint;
      remotePath: string;
      remoteFileName: string;
      syncStatus: FileSyncStatus;
    }>;
  }>;
};

export type RenameHint = {
  fileId: bigint;
  fromPath: string;
  toPath: string;
};

export class SyncEngineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSyncContext(mappingTaskId: bigint): Promise<SyncContext | null> {
    const task = (await this.prisma.mappingTask.findFirst({
      where: {
        id: mappingTaskId,
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        localPath: true,
        syncMode: true,
        encryptionEnabled: true,
        splitEnabled: true,
        isActive: true,
        deletedAt: true,
        mappingTaskRemotes: {
          orderBy: { priority: 'asc' },
          select: {
            remoteId: true,
            priority: true,
            role: true,
            remoteBasePath: true,
            remote: {
              select: {
                id: true,
                remoteName: true,
                remoteRootPath: true,
                isActive: true,
                cloudTrashEnabled: true,
                cloudTrashBasePath: true,
                totalCapacity: true,
                usedCapacity: true,
                reservedCapacity: true,
                warningThresholdPercent: true
              }
            }
          }
        },
        files: {
          where: {
            scanStatus: { in: [ScanStatus.scanned, ScanStatus.changed, ScanStatus.missing, ScanStatus.error] }
          },
          select: {
            id: true,
            localPath: true,
            relativePath: true,
            fileSize: true,
            scanStatus: true,
            updatedAt: true,
            fileLocations: {
              select: {
                id: true,
                remoteId: true,
                remotePath: true,
                remoteFileName: true,
                syncStatus: true
              }
            }
          }
        }
      }
    })) as any;

    if (!task) {
      return null;
    }

    return {
      id: task.id,
      name: task.name,
      localPath: task.localPath,
      syncMode: task.syncMode,
      encryptionEnabled: task.encryptionEnabled,
      splitEnabled: task.splitEnabled,
      isActive: task.isActive,
      deletedAt: task.deletedAt,
      remotes: task.mappingTaskRemotes.map((item: any) => ({
        remoteId: item.remoteId,
        priority: item.priority,
        role: item.role,
        remoteBasePath: item.remoteBasePath,
        remote: {
          id: item.remote.id,
          remoteName: item.remote.remoteName,
          remoteRootPath: item.remote.remoteRootPath,
          isActive: item.remote.isActive,
          cloudTrashEnabled: item.remote.cloudTrashEnabled,
          cloudTrashBasePath: item.remote.cloudTrashBasePath,
          totalCapacity: item.remote.totalCapacity,
          usedCapacity: item.remote.usedCapacity,
          reservedCapacity: item.remote.reservedCapacity,
          warningThresholdPercent: item.remote.warningThresholdPercent
        }
      })),
      files: task.files
    } satisfies SyncContext;
  }

  async listRenameHints(fileIds: bigint[], recentSeconds: number): Promise<RenameHint[]> {
    if (fileIds.length === 0) {
      return [];
    }

    const fromTime = new Date(Date.now() - recentSeconds * 1000);
    const rows = await this.prisma.operationLog.findMany({
      where: {
        operationType: OperationType.rename,
        targetType: TargetType.file,
        targetId: { in: fileIds },
        createdAt: { gte: fromTime }
      },
      orderBy: { createdAt: 'desc' }
    });

    const hints: RenameHint[] = [];
    for (const row of rows) {
      const metadata = row.metadataJson as any;
      if (!row.targetId || !metadata?.fromPath || !metadata?.toPath) {
        continue;
      }
      hints.push({
        fileId: row.targetId,
        fromPath: String(metadata.fromPath),
        toPath: String(metadata.toPath)
      });
    }
    return hints;
  }

  async createSyncJob(mappingTaskId: bigint, payload?: Record<string, unknown>): Promise<bigint> {
    const job = await this.prisma.syncJob.create({
      data: {
        mappingTaskId,
        jobType: JobType.sync,
        status: JobStatus.running,
        payloadJson: payload as any,
        startedAt: new Date()
      },
      select: { id: true }
    });
    return job.id;
  }

  async completeSyncJob(jobId: bigint, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.success,
        payloadJson: payload as any,
        finishedAt: new Date()
      }
    });
  }

  async failSyncJob(jobId: bigint, message: string, payload: Record<string, unknown>): Promise<void> {
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

  async upsertFileLocation(input: {
    fileId: bigint;
    remoteId: bigint;
    remotePath: string;
    remoteFileName: string;
    syncStatus: FileSyncStatus;
  }): Promise<void> {
    await this.prisma.fileLocation.upsert({
      where: {
        fileId_remoteId: {
          fileId: input.fileId,
          remoteId: input.remoteId
        }
      },
      create: {
        fileId: input.fileId,
        remoteId: input.remoteId,
        remotePath: input.remotePath,
        remoteFileName: input.remoteFileName,
        syncStatus: input.syncStatus
      },
      update: {
        remotePath: input.remotePath,
        remoteFileName: input.remoteFileName,
        syncStatus: input.syncStatus
      }
    });
  }

  async setFileLocationStatus(fileId: bigint, remoteId: bigint, syncStatus: FileSyncStatus): Promise<void> {
    await this.prisma.fileLocation.updateMany({
      where: { fileId, remoteId },
      data: { syncStatus }
    });
  }

  async updateFileScanStatus(fileId: bigint, scanStatus: ScanStatus): Promise<void> {
    await this.prisma.file.update({
      where: { id: fileId },
      data: { scanStatus }
    });
  }

  async writeOperationLog(input: {
    operationType: OperationType;
    targetType: TargetType;
    targetId?: bigint;
    message: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.operationLog.create({
      data: {
        operationType: input.operationType,
        targetType: input.targetType,
        targetId: input.targetId,
        message: input.message,
        metadataJson: (input.metadata ?? {}) as any
      }
    });
  }
}

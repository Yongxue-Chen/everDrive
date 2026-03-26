import { JobStatus, JobType, ScanStatus, type PrismaClient } from '@prisma/client';

export type RenameCandidate = {
  id: bigint;
  localPath: string;
  relativePath: string;
  md5Hash: string | null;
  sha1Hash: string | null;
  fileSize: bigint;
  modifiedTime: Date;
  updatedAt: Date;
  fileLocationsCount: number;
};

export type RenamePair = {
  sourceFileId: bigint;
  sourceLocalPath: string;
  sourceRelativePath: string;
  targetFileId: bigint;
  targetLocalPath: string;
  targetRelativePath: string;
  md5Hash: string;
  sha1Hash: string;
  fileSize: bigint;
  modifiedTime: Date;
};

export type MappingTaskRenameInfo = {
  id: bigint;
  isActive: boolean;
  deletedAt: Date | null;
};

export class RenameDetectRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findTask(taskId: bigint): Promise<MappingTaskRenameInfo | null> {
    return this.prisma.mappingTask.findUnique({
      where: { id: taskId },
      select: { id: true, isActive: true, deletedAt: true }
    });
  }

  async createRenameJob(mappingTaskId: bigint): Promise<bigint> {
    const job = await this.prisma.syncJob.create({
      data: {
        mappingTaskId,
        jobType: JobType.rename_detect,
        status: JobStatus.running,
        startedAt: new Date()
      },
      select: { id: true }
    });
    return job.id;
  }

  async completeRenameJob(jobId: bigint, payload: Record<string, unknown>): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.success,
        payloadJson: payload as any,
        finishedAt: new Date()
      }
    });
  }

  async failRenameJob(jobId: bigint, message: string, payload: Record<string, unknown>): Promise<void> {
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

  async listMissingCandidates(mappingTaskId: bigint, thresholdTime: Date): Promise<RenameCandidate[]> {
    const rows = await this.prisma.file.findMany({
      where: {
        mappingTaskId,
        scanStatus: ScanStatus.missing,
        updatedAt: { gte: thresholdTime },
        md5Hash: { not: null },
        sha1Hash: { not: null }
      },
      select: {
        id: true,
        localPath: true,
        relativePath: true,
        md5Hash: true,
        sha1Hash: true,
        fileSize: true,
        modifiedTime: true,
        updatedAt: true,
        _count: {
          select: {
            fileLocations: true
          }
        }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      localPath: row.localPath,
      relativePath: row.relativePath,
      md5Hash: row.md5Hash,
      sha1Hash: row.sha1Hash,
      fileSize: row.fileSize,
      modifiedTime: row.modifiedTime,
      updatedAt: row.updatedAt,
      fileLocationsCount: row._count.fileLocations
    }));
  }

  async listPresentCandidates(mappingTaskId: bigint, thresholdTime: Date): Promise<RenameCandidate[]> {
    const rows = await this.prisma.file.findMany({
      where: {
        mappingTaskId,
        scanStatus: { in: [ScanStatus.scanned, ScanStatus.changed] },
        updatedAt: { gte: thresholdTime },
        md5Hash: { not: null },
        sha1Hash: { not: null }
      },
      select: {
        id: true,
        localPath: true,
        relativePath: true,
        md5Hash: true,
        sha1Hash: true,
        fileSize: true,
        modifiedTime: true,
        updatedAt: true,
        _count: {
          select: {
            fileLocations: true
          }
        }
      }
    });

    return rows.map((row) => ({
      id: row.id,
      localPath: row.localPath,
      relativePath: row.relativePath,
      md5Hash: row.md5Hash,
      sha1Hash: row.sha1Hash,
      fileSize: row.fileSize,
      modifiedTime: row.modifiedTime,
      updatedAt: row.updatedAt,
      fileLocationsCount: row._count.fileLocations
    }));
  }

  async applyRenamePairs(mappingTaskId: bigint, pairs: RenamePair[]): Promise<number> {
    let applied = 0;

    for (const pair of pairs) {
      if (pair.sourceFileId === pair.targetFileId) {
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.file.delete({
          where: { id: pair.targetFileId }
        });

        const updated = await tx.file.updateMany({
          where: {
            id: pair.sourceFileId,
            mappingTaskId
          },
          data: {
            localPath: pair.targetLocalPath,
            relativePath: pair.targetRelativePath,
            modifiedTime: pair.modifiedTime,
            scanStatus: ScanStatus.changed
          }
        });

        if (updated.count === 0) {
          return;
        }

        await tx.operationLog.create({
          data: {
            operationType: 'rename',
            targetType: 'file',
            targetId: pair.sourceFileId,
            message: 'Rename/move detected by fingerprint matching; cloud action should use move instead of re-upload.',
            metadataJson: {
              mappingTaskId: mappingTaskId.toString(),
              sourceFileId: pair.sourceFileId.toString(),
              targetFileId: pair.targetFileId.toString(),
              fromPath: pair.sourceLocalPath,
              toPath: pair.targetLocalPath,
              md5Hash: pair.md5Hash,
              sha1Hash: pair.sha1Hash,
              fileSize: pair.fileSize.toString(),
              cloudAction: 'move'
            }
          }
        });

        applied += 1;
      });
    }

    return applied;
  }
}

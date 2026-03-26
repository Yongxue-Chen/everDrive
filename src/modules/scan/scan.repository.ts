import { HashType, JobStatus, JobType, ScanStatus, type Prisma, type PrismaClient } from '@prisma/client';

export type MappingTaskForScan = {
  id: bigint;
  localPath: string;
  isActive: boolean;
  deletedAt: Date | null;
};

export type ExistingFileRecord = {
  id: bigint;
  localPath: string;
  md5Hash: string | null;
  sha1Hash: string | null;
  fileHash: string;
  fileSize: bigint;
  modifiedTime: Date;
};

export type UpsertScannedFileInput = {
  mappingTaskId: bigint;
  localPath: string;
  relativePath: string;
  fileSize: bigint;
  modifiedTime: Date;
  md5Hash: string;
  sha1Hash: string;
  scanStatus: ScanStatus;
};

export class ScanRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findScannableTask(taskId: bigint): Promise<MappingTaskForScan | null> {
    return this.prisma.mappingTask.findFirst({
      where: {
        id: taskId,
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        localPath: true,
        isActive: true,
        deletedAt: true
      }
    });
  }

  async createScanJob(mappingTaskId: bigint): Promise<bigint> {
    const job = await this.prisma.syncJob.create({
      data: {
        mappingTaskId,
        jobType: JobType.scan,
        status: JobStatus.running,
        startedAt: new Date()
      },
      select: { id: true }
    });

    return job.id;
  }

  async completeScanJob(jobId: bigint, summary: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.success,
        payloadJson: summary,
        finishedAt: new Date()
      }
    });
  }

  async failScanJob(jobId: bigint, errorMessage: string, summary?: Prisma.InputJsonValue): Promise<void> {
    await this.prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: JobStatus.failed,
        errorMessage,
        payloadJson: summary,
        finishedAt: new Date()
      }
    });
  }

  async listExistingFiles(mappingTaskId: bigint): Promise<ExistingFileRecord[]> {
    const items = await this.prisma.file.findMany({
      where: { mappingTaskId },
      select: {
        id: true,
        localPath: true,
        md5Hash: true,
        sha1Hash: true,
        fileHash: true,
        fileSize: true,
        modifiedTime: true
      } as any
    });
    return items as unknown as ExistingFileRecord[];
  }

  async upsertScannedFile(input: UpsertScannedFileInput): Promise<void> {
    await this.prisma.file.upsert({
      where: {
        mappingTaskId_localPath: {
          mappingTaskId: input.mappingTaskId,
          localPath: input.localPath
        }
      },
      create: {
        mappingTaskId: input.mappingTaskId,
        localPath: input.localPath,
        relativePath: input.relativePath,
        fileSize: input.fileSize,
        modifiedTime: input.modifiedTime,
        fileHash: input.md5Hash,
        md5Hash: input.md5Hash,
        sha1Hash: input.sha1Hash,
        hashType: HashType.md5,
        scanStatus: input.scanStatus
      } as any,
      update: {
        relativePath: input.relativePath,
        fileSize: input.fileSize,
        modifiedTime: input.modifiedTime,
        fileHash: input.md5Hash,
        md5Hash: input.md5Hash,
        sha1Hash: input.sha1Hash,
        hashType: HashType.md5,
        scanStatus: input.scanStatus
      } as any
    });
  }

  async markMissingFiles(mappingTaskId: bigint, existingLocalPaths: string[], seenLocalPaths: string[]): Promise<number> {
    const seen = new Set(seenLocalPaths);
    const missingPaths = existingLocalPaths.filter((localPath) => !seen.has(localPath));

    if (missingPaths.length === 0) {
      return 0;
    }

    const result = await this.prisma.file.updateMany({
      where: {
        mappingTaskId,
        localPath: { in: missingPaths },
        scanStatus: { not: ScanStatus.missing }
      },
      data: {
        scanStatus: ScanStatus.missing
      }
    });

    return result.count;
  }
}

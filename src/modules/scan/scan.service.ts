import fs from 'node:fs/promises';
import path from 'node:path';
import { ScanStatus } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import { FileHasher } from './file-hasher.js';
import { LocalFileScanner } from './local-file-scanner.js';
import { ScanRepository } from './scan.repository.js';

export type ScanSummary = {
  jobId: string;
  mappingTaskId: string;
  scannedCount: number;
  createdCount: number;
  changedCount: number;
  unchangedCount: number;
  missingCount: number;
  errorCount: number;
  errorSamples: string[];
};

export class ScanService {
  private readonly log = logger.withContext({ module: 'scan-service' });

  constructor(
    private readonly repository: ScanRepository,
    private readonly scanner = new LocalFileScanner(),
    private readonly hasher = new FileHasher()
  ) {}

  async runTaskScan(mappingTaskId: bigint): Promise<ScanSummary> {
    const task = await this.repository.findScannableTask(mappingTaskId);
    if (!task) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Active mapping task ${mappingTaskId.toString()} not found`,
        statusCode: 404
      });
    }

    await this.ensureDirectoryExists(task.localPath);

    const jobId = await this.repository.createScanJob(mappingTaskId);
    const summary: Omit<ScanSummary, 'jobId' | 'mappingTaskId'> = {
      scannedCount: 0,
      createdCount: 0,
      changedCount: 0,
      unchangedCount: 0,
      missingCount: 0,
      errorCount: 0,
      errorSamples: []
    };

    try {
      const existing = await this.repository.listExistingFiles(mappingTaskId);
      const existingMap = new Map(existing.map((item) => [item.localPath, item]));
      const discoveredFiles = await this.scanner.scan(task.localPath);
      const seenLocalPaths: string[] = [];

      for (const file of discoveredFiles) {
        const absolutePath = path.resolve(file.absolutePath);
        const existingRecord = existingMap.get(absolutePath);

        try {
          const fingerprint = await this.hasher.hash(absolutePath);
          const isChanged =
            !existingRecord ||
            existingRecord.md5Hash !== fingerprint.md5 ||
            existingRecord.sha1Hash !== fingerprint.sha1 ||
            existingRecord.fileSize !== file.sizeBytes ||
            existingRecord.modifiedTime.getTime() !== file.modifiedTime.getTime();

          await this.repository.upsertScannedFile({
            mappingTaskId,
            localPath: absolutePath,
            relativePath: file.relativePath,
            fileSize: file.sizeBytes,
            modifiedTime: file.modifiedTime,
            md5Hash: fingerprint.md5,
            sha1Hash: fingerprint.sha1,
            scanStatus: isChanged ? ScanStatus.changed : ScanStatus.scanned
          });

          seenLocalPaths.push(absolutePath);
          summary.scannedCount += 1;

          if (!existingRecord) {
            summary.createdCount += 1;
          } else if (isChanged) {
            summary.changedCount += 1;
          } else {
            summary.unchangedCount += 1;
          }
        } catch (error) {
          summary.errorCount += 1;
          if (summary.errorSamples.length < 20) {
            summary.errorSamples.push(`${absolutePath}: ${(error as Error).message}`);
          }
          this.log.warn('scan hash failed for file', { localPath: absolutePath, err: error });
        }
      }

      summary.missingCount = await this.repository.markMissingFiles(
        mappingTaskId,
        existing.map((item) => item.localPath),
        seenLocalPaths
      );

      await this.repository.completeScanJob(jobId, summary);
      this.log.info('mapping task scan completed', { mappingTaskId: mappingTaskId.toString(), ...summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'scan failed';
      await this.repository.failScanJob(jobId, message, summary);
      throw error;
    }

    return {
      jobId: jobId.toString(),
      mappingTaskId: mappingTaskId.toString(),
      ...summary
    };
  }

  private async ensureDirectoryExists(localPath: string): Promise<void> {
    try {
      const stat = await fs.stat(localPath);
      if (!stat.isDirectory()) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: `mapping localPath is not a directory: ${localPath}`,
          statusCode: 400
        });
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        code: 'BAD_REQUEST',
        message: `mapping localPath does not exist: ${localPath}`,
        statusCode: 400
      });
    }
  }
}

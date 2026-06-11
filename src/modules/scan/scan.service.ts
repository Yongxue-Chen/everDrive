import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ScanStatus } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import type { RcloneSourceService, RemoteSourceFile } from '../source/rclone-source.service.js';
import { FileHasher } from './file-hasher.js';
import { LocalFileScanner } from './local-file-scanner.js';
import { ScanRepository, type MappingTaskForScan } from './scan.repository.js';

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
  deletionBlocked: boolean;
};

type DiscoveredSourceFile = {
  identityPath: string;
  relativePath: string;
  sizeBytes: bigint;
  modifiedTime: Date;
  fingerprint?: { md5: string; sha1: string };
};

export class ScanService {
  private readonly log = logger.withContext({ module: 'scan-service' });

  constructor(
    private readonly repository: ScanRepository,
    private readonly scanner = new LocalFileScanner(),
    private readonly hasher = new FileHasher(),
    private readonly rcloneSource?: RcloneSourceService
  ) {}

  async runTaskScan(mappingTaskId: bigint): Promise<ScanSummary> {
    const task = await this.repository.findScannableTask(mappingTaskId);
    if (!task) throw new AppError({ code: 'NOT_FOUND', message: `Active mapping task ${mappingTaskId.toString()} not found`, statusCode: 404 });

    if ((task.sourceType ?? 'local') === 'local') {
      await this.ensureDirectoryExists(task.localPath);
    } else if (!task.sourceRemoteName || !this.rcloneSource) {
      throw new AppError({ code: 'BAD_REQUEST', message: 'rclone source is not configured', statusCode: 400 });
    }

    const jobId = await this.repository.createScanJob(mappingTaskId);
    const summary = { scannedCount: 0, createdCount: 0, changedCount: 0, unchangedCount: 0, missingCount: 0, errorCount: 0, errorSamples: [] as string[], deletionBlocked: false };

    try {
      const existing = await this.repository.listExistingFiles(mappingTaskId);
      const existingMap = new Map(existing.map((item) => [item.localPath, item]));
      const discovered = await this.discover(task);
      const seen: string[] = [];

      for (const file of discovered) {
        const existingRecord = existingMap.get(file.identityPath);
        try {
          const fingerprint = file.fingerprint ?? (await this.hasher.hash(file.identityPath));
          const changed = !existingRecord || existingRecord.md5Hash !== fingerprint.md5 || existingRecord.sha1Hash !== fingerprint.sha1 || existingRecord.fileSize !== file.sizeBytes || existingRecord.modifiedTime.getTime() !== file.modifiedTime.getTime();
          await this.repository.upsertScannedFile({ mappingTaskId, localPath: file.identityPath, relativePath: file.relativePath, fileSize: file.sizeBytes, modifiedTime: file.modifiedTime, md5Hash: fingerprint.md5, sha1Hash: fingerprint.sha1, scanStatus: changed ? ScanStatus.changed : ScanStatus.scanned });
          seen.push(file.identityPath);
          summary.scannedCount += 1;
          if (!existingRecord) summary.createdCount += 1;
          else if (changed) summary.changedCount += 1;
          else summary.unchangedCount += 1;
        } catch (error) {
          summary.errorCount += 1;
          if (summary.errorSamples.length < 20) summary.errorSamples.push(`${file.identityPath}: ${(error as Error).message}`);
        }
      }

      summary.deletionBlocked = (task.sourceType ?? 'local') === 'rclone' && existing.length >= 20 && seen.length < existing.length / 2;
      if (!summary.deletionBlocked) summary.missingCount = await this.repository.markMissingFiles(mappingTaskId, existing.map((item) => item.localPath), seen);
      await this.repository.completeScanJob(jobId, summary);
      this.log.info('mapping task scan completed', { mappingTaskId: mappingTaskId.toString(), ...summary });
      return { jobId: jobId.toString(), mappingTaskId: mappingTaskId.toString(), ...summary };
    } catch (error) {
      await this.repository.failScanJob(jobId, error instanceof Error ? error.message : 'scan failed', summary);
      throw error;
    }
  }

  private async discover(task: MappingTaskForScan): Promise<DiscoveredSourceFile[]> {
    if ((task.sourceType ?? 'local') === 'local') {
      return (await this.scanner.scan(task.localPath)).map((item) => ({ identityPath: path.resolve(item.absolutePath), relativePath: item.relativePath, sizeBytes: item.sizeBytes, modifiedTime: item.modifiedTime }));
    }
    const files = await this.rcloneSource!.scan(task.sourceRemoteName!, task.sourcePath ?? '');
    return files.map((item) => ({ identityPath: this.remoteIdentity(task.sourceRemoteName!, task.sourcePath ?? '', item.relativePath), relativePath: item.relativePath, sizeBytes: item.sizeBytes, modifiedTime: item.modifiedTime, fingerprint: this.remoteFingerprint(item) }));
  }

  private remoteIdentity(name: string, root: string, relative: string): string {
    return `rclone://${name}/${path.posix.join(root, relative)}`.replace(/\/$/, '');
  }

  private remoteFingerprint(file: RemoteSourceFile): { md5: string; sha1: string } {
    const fallback = `${file.relativePath}\0${file.sizeBytes}\0${file.modifiedTime.toISOString()}`;
    return { md5: file.md5 ?? createHash('md5').update(fallback).digest('hex'), sha1: file.sha1 ?? createHash('sha1').update(fallback).digest('hex') };
  }

  private async ensureDirectoryExists(localPath: string): Promise<void> {
    try {
      const stat = await fs.stat(localPath);
      if (!stat.isDirectory()) throw new AppError({ code: 'BAD_REQUEST', message: `mapping localPath is not a directory: ${localPath}`, statusCode: 400 });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError({ code: 'BAD_REQUEST', message: `mapping localPath does not exist: ${localPath}`, statusCode: 400 });
    }
  }
}

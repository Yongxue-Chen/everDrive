import path from 'node:path';
import { AppError } from '../../errors/app-error.js';
import { RcloneService } from '../../infrastructure/rclone/rclone.service.js';
import { logger } from '../../lib/logger.js';
import { MigrationRepository } from './migration.repository.js';

export type MigrationInput = {
  mappingTaskId: bigint;
  sourceRemoteId: bigint;
  targetRemoteId: bigint;
  scopeRelativePath?: string;
  targetBasePath?: string;
  removeSourceReplica?: boolean;
};

export type MigrationSummary = {
  jobId: string;
  mappingTaskId: string;
  sourceRemoteId: string;
  targetRemoteId: string;
  scopeRelativePath: string | null;
  targetPath: string;
  estimatedSizeBytes: string;
  affectedFileLocations: number;
  removeSourceReplica: boolean;
};

export class MigrationService {
  private readonly log = logger.withContext({ module: 'migration-service' });

  constructor(private readonly repository: MigrationRepository, private readonly rcloneService: RcloneService) {}

  async runMigration(input: MigrationInput): Promise<MigrationSummary> {
    const task = await this.repository.findTask(input.mappingTaskId);
    if (!task || !task.isActive || task.deletedAt) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Active mapping task ${input.mappingTaskId.toString()} not found`,
        statusCode: 404
      });
    }

    const sourceRemote = await this.repository.findRemote(input.sourceRemoteId);
    const targetRemote = await this.repository.findRemote(input.targetRemoteId);
    if (!sourceRemote || !targetRemote || !sourceRemote.isActive || !targetRemote.isActive) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'sourceRemote or targetRemote not available',
        statusCode: 400
      });
    }

    const estimatedSizeBytes = await this.repository.estimateMigrationSizeBytes({
      mappingTaskId: input.mappingTaskId,
      sourceRemoteId: input.sourceRemoteId,
      scopeRelativePath: input.scopeRelativePath
    });

    this.ensureTargetCapacity(targetRemote, estimatedSizeBytes);

    const scopePath = input.scopeRelativePath?.trim() || '';
    const targetPath = this.resolveTargetPath(scopePath, input.targetBasePath);
    const payload = {
      sourceRemoteId: input.sourceRemoteId.toString(),
      targetRemoteId: input.targetRemoteId.toString(),
      scopeRelativePath: scopePath || null,
      targetPath,
      estimatedSizeBytes: estimatedSizeBytes.toString(),
      removeSourceReplica: Boolean(input.removeSourceReplica)
    };

    const jobId = await this.repository.createMigrationJob(input.mappingTaskId, payload);

    try {
      const copyResult = await this.rcloneService.remoteToRemoteCopy({
        sourceRemote: `${sourceRemote.remoteName}:`,
        sourcePath: scopePath,
        targetRemote: `${targetRemote.remoteName}:`,
        targetPath,
        async: false
      });

      if (copyResult.async) {
        throw new AppError({
          code: 'INTERNAL_ERROR',
          message: 'Unexpected async migration copy result',
          statusCode: 500
        });
      }

      const mapping = await this.repository.applyMigrationMapping({
        mappingTaskId: input.mappingTaskId,
        sourceRemoteId: input.sourceRemoteId,
        targetRemoteId: input.targetRemoteId,
        scopeRelativePath: scopePath || undefined,
        removeSourceReplica: Boolean(input.removeSourceReplica)
      });

      const summary: MigrationSummary = {
        jobId: jobId.toString(),
        mappingTaskId: input.mappingTaskId.toString(),
        sourceRemoteId: input.sourceRemoteId.toString(),
        targetRemoteId: input.targetRemoteId.toString(),
        scopeRelativePath: scopePath || null,
        targetPath,
        estimatedSizeBytes: estimatedSizeBytes.toString(),
        affectedFileLocations: mapping.affectedFileLocations,
        removeSourceReplica: Boolean(input.removeSourceReplica)
      };

      await this.repository.completeMigrationJob(jobId, summary as unknown as Record<string, unknown>);
      await this.repository.writeMigrationLog({
        mappingTaskId: input.mappingTaskId,
        message: 'Migration completed by remote-to-remote copy',
        metadata: summary as unknown as Record<string, unknown>
      });

      this.log.info('migration completed', summary);
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'migration failed';
      await this.repository.failMigrationJob(jobId, message, payload);
      throw error;
    }
  }

  private ensureTargetCapacity(
    target: { totalCapacity: bigint; usedCapacity: bigint; reservedCapacity: bigint; remoteName: string },
    estimatedSizeBytes: bigint
  ): void {
    if (target.totalCapacity <= 0n) {
      return;
    }

    const available = target.totalCapacity - target.reservedCapacity - target.usedCapacity;
    if (available < estimatedSizeBytes) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `Target remote ${target.remoteName} capacity insufficient`,
        statusCode: 400,
        details: {
          availableBytes: available.toString(),
          requiredBytes: estimatedSizeBytes.toString()
        }
      });
    }
  }

  private resolveTargetPath(scopeRelativePath: string, targetBasePath?: string): string {
    const base = targetBasePath?.trim() || '';
    if (!base) {
      return scopeRelativePath;
    }
    if (!scopeRelativePath) {
      return base;
    }
    return path.posix.join(base, scopeRelativePath);
  }
}

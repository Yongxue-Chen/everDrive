import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import type { RenameCandidate, RenamePair } from './rename-detect.repository.js';
import { RenameDetectRepository } from './rename-detect.repository.js';

export type DetectRenameSummary = {
  jobId: string;
  mappingTaskId: string;
  candidateWindowSeconds: number;
  missingCandidates: number;
  presentCandidates: number;
  matchedPairs: number;
  appliedPairs: number;
  skippedPairs: number;
  plannedCloudMoves: number;
};

export class RenameDetectService {
  private readonly log = logger.withContext({ module: 'rename-detect-service' });

  constructor(private readonly repository: RenameDetectRepository) {}

  async detectAndApply(mappingTaskId: bigint, candidateWindowSeconds = 5): Promise<DetectRenameSummary> {
    if (!Number.isInteger(candidateWindowSeconds) || candidateWindowSeconds < 1 || candidateWindowSeconds > 600) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'candidateWindowSeconds must be an integer between 1 and 600',
        statusCode: 400
      });
    }

    const task = await this.repository.findTask(mappingTaskId);
    if (!task || !task.isActive || task.deletedAt) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Active mapping task ${mappingTaskId.toString()} not found`,
        statusCode: 404
      });
    }

    const jobId = await this.repository.createRenameJob(mappingTaskId);
    const thresholdTime = new Date(Date.now() - candidateWindowSeconds * 1000);

    const baseSummary: Omit<DetectRenameSummary, 'jobId' | 'mappingTaskId'> = {
      candidateWindowSeconds,
      missingCandidates: 0,
      presentCandidates: 0,
      matchedPairs: 0,
      appliedPairs: 0,
      skippedPairs: 0,
      plannedCloudMoves: 0
    };

    try {
      const missing = await this.repository.listMissingCandidates(mappingTaskId, thresholdTime);
      const present = await this.repository.listPresentCandidates(mappingTaskId, thresholdTime);
      baseSummary.missingCandidates = missing.length;
      baseSummary.presentCandidates = present.length;

      const pairs = this.matchRenamePairs(missing, present);
      baseSummary.matchedPairs = pairs.length;
      baseSummary.skippedPairs = pairs.filter((pair) => pair.sourceFileId === pair.targetFileId).length;

      const applierPairs = pairs.filter((pair) => pair.sourceFileId !== pair.targetFileId);
      baseSummary.plannedCloudMoves = applierPairs.length;
      baseSummary.appliedPairs = await this.repository.applyRenamePairs(mappingTaskId, applierPairs);

      await this.repository.completeRenameJob(jobId, baseSummary);
      this.log.info('rename detection completed', {
        mappingTaskId: mappingTaskId.toString(),
        ...baseSummary
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'rename detection failed';
      await this.repository.failRenameJob(jobId, message, baseSummary);
      throw error;
    }

    return {
      jobId: jobId.toString(),
      mappingTaskId: mappingTaskId.toString(),
      ...baseSummary
    };
  }

  private matchRenamePairs(missing: RenameCandidate[], present: RenameCandidate[]): RenamePair[] {
    const presentBuckets = new Map<string, RenameCandidate[]>();
    for (const item of present) {
      if (!item.md5Hash || !item.sha1Hash) {
        continue;
      }
      const key = this.fingerprintKey(item.md5Hash, item.sha1Hash, item.fileSize);
      const bucket = presentBuckets.get(key) ?? [];
      bucket.push(item);
      presentBuckets.set(key, bucket);
    }

    const pairs: RenamePair[] = [];
    for (const missingItem of missing) {
      if (!missingItem.md5Hash || !missingItem.sha1Hash) {
        continue;
      }
      const key = this.fingerprintKey(missingItem.md5Hash, missingItem.sha1Hash, missingItem.fileSize);
      const bucket = presentBuckets.get(key);
      if (!bucket || bucket.length === 0) {
        continue;
      }

      const target = bucket.shift()!;
      const source = this.pickIdentitySource(missingItem, target);
      const alias = source.id === missingItem.id ? target : missingItem;

      pairs.push({
        sourceFileId: source.id,
        sourceLocalPath: source.localPath,
        sourceRelativePath: source.relativePath,
        targetFileId: alias.id,
        targetLocalPath: alias.localPath,
        targetRelativePath: alias.relativePath,
        md5Hash: missingItem.md5Hash,
        sha1Hash: missingItem.sha1Hash,
        fileSize: missingItem.fileSize,
        modifiedTime: alias.modifiedTime
      });
    }

    return pairs;
  }

  private pickIdentitySource(missing: RenameCandidate, present: RenameCandidate): RenameCandidate {
    if (missing.fileLocationsCount >= present.fileLocationsCount) {
      return missing;
    }
    return present;
  }

  private fingerprintKey(md5Hash: string, sha1Hash: string, fileSize: bigint): string {
    return `${md5Hash}:${sha1Hash}:${fileSize.toString()}`;
  }
}

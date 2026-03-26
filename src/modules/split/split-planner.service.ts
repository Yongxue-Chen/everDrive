import { AppError } from '../../errors/app-error.js';
import { RemoteCapacityEvaluator, type RemoteCapacityInput } from './remote-capacity-evaluator.js';

export type SplitPlacement = {
  remoteId: string;
  remoteName: string;
  reason: 'best_fit_warning_safe' | 'best_fit_threshold_relaxed';
  projectedUsagePercent: number;
  availableBytes: string;
};

export class SplitPlanner {
  private readonly evaluator = new RemoteCapacityEvaluator();

  pickTarget(remotes: RemoteCapacityInput[], fileSizeBytes: bigint): SplitPlacement {
    const evaluations = remotes.map((remote) => this.evaluator.evaluate(remote, fileSizeBytes)).filter((item) => item.fits);

    if (evaluations.length === 0) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `No shard remote has enough capacity for file size ${fileSizeBytes.toString()} bytes`,
        statusCode: 400
      });
    }

    const warningSafe = evaluations.filter((item) => item.warningProtected);
    const chosen = this.pickBestFit(warningSafe.length > 0 ? warningSafe : evaluations);

    return {
      remoteId: chosen.remoteId,
      remoteName: chosen.remoteName,
      reason: warningSafe.length > 0 ? 'best_fit_warning_safe' : 'best_fit_threshold_relaxed',
      projectedUsagePercent: chosen.projectedUsagePercent,
      availableBytes: chosen.availableBytes.toString()
    };
  }

  private pickBestFit(candidates: ReturnType<RemoteCapacityEvaluator['evaluate']>[]) {
    return candidates
      .slice()
      .sort((a, b) => {
        const aWaste = a.availableBytes;
        const bWaste = b.availableBytes;
        if (aWaste !== bWaste) {
          return aWaste < bWaste ? -1 : 1;
        }
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.remoteId.localeCompare(b.remoteId);
      })[0]!;
  }
}

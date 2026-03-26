import { describe, expect, it } from 'vitest';
import { SplitPlanner } from '../src/modules/split/split-planner.service.js';

describe('SplitPlanner', () => {
  it('picks best-fit remote with warning-threshold protection', () => {
    const planner = new SplitPlanner();
    const placement = planner.pickTarget(
      [
        {
          remoteId: '1',
          remoteName: 'driveA',
          priority: 100,
          totalCapacity: 1000n,
          usedCapacity: 850n,
          reservedCapacity: 0n,
          warningThresholdPercent: 90,
          isActive: true
        },
        {
          remoteId: '2',
          remoteName: 'driveB',
          priority: 200,
          totalCapacity: 1000n,
          usedCapacity: 700n,
          reservedCapacity: 0n,
          warningThresholdPercent: 90,
          isActive: true
        }
      ],
      50n
    );

    expect(placement.remoteName).toBe('driveA');
    expect(placement.reason).toBe('best_fit_warning_safe');
  });

  it('relaxes threshold when no warning-safe candidate exists', () => {
    const planner = new SplitPlanner();
    const placement = planner.pickTarget(
      [
        {
          remoteId: '1',
          remoteName: 'driveA',
          priority: 100,
          totalCapacity: 100n,
          usedCapacity: 85n,
          reservedCapacity: 0n,
          warningThresholdPercent: 85,
          isActive: true
        },
        {
          remoteId: '2',
          remoteName: 'driveB',
          priority: 200,
          totalCapacity: 100n,
          usedCapacity: 80n,
          reservedCapacity: 0n,
          warningThresholdPercent: 80,
          isActive: true
        }
      ],
      10n
    );

    expect(placement.reason).toBe('best_fit_threshold_relaxed');
  });
});

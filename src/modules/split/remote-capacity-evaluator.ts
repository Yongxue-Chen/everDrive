export type RemoteCapacityInput = {
  remoteId: string;
  remoteName: string;
  priority: number;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
  warningThresholdPercent: number;
  isActive: boolean;
};

export type CapacityEvaluationResult = {
  remoteId: string;
  remoteName: string;
  priority: number;
  fits: boolean;
  availableBytes: bigint;
  projectedUsagePercent: number;
  warningProtected: boolean;
};

export class RemoteCapacityEvaluator {
  evaluate(remote: RemoteCapacityInput, fileSizeBytes: bigint): CapacityEvaluationResult {
    if (!remote.isActive) {
      return {
        remoteId: remote.remoteId,
        remoteName: remote.remoteName,
        priority: remote.priority,
        fits: false,
        availableBytes: 0n,
        projectedUsagePercent: 100,
        warningProtected: false
      };
    }

    const capacityBase = remote.totalCapacity - remote.reservedCapacity;
    const capacity = capacityBase > 0n ? capacityBase : 0n;
    const available = capacity > remote.usedCapacity ? capacity - remote.usedCapacity : 0n;

    if (capacity === 0n) {
      return {
        remoteId: remote.remoteId,
        remoteName: remote.remoteName,
        priority: remote.priority,
        fits: false,
        availableBytes: available,
        projectedUsagePercent: 100,
        warningProtected: false
      };
    }

    const projectedUsed = remote.usedCapacity + fileSizeBytes;
    const usagePercent = Number((projectedUsed * 10000n) / capacity) / 100;
    const warningProtected = usagePercent <= remote.warningThresholdPercent;

    return {
      remoteId: remote.remoteId,
      remoteName: remote.remoteName,
      priority: remote.priority,
      fits: available >= fileSizeBytes,
      availableBytes: available,
      projectedUsagePercent: usagePercent,
      warningProtected
    };
  }
}

import { HealthStatus } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';

export type RemoteUsageAggregate = {
  remoteId: bigint;
  usedCapacity: bigint;
};

export type RemoteRecord = {
  id: bigint;
  remoteName: string;
  displayName: string;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
  warningThresholdPercent: number;
  healthStatus: HealthStatus;
  isActive: boolean;
  lastSyncAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  mappingTaskRemotes: Array<{
    id: bigint;
    role: string;
    priority: number;
    mappingTask: {
      id: bigint;
      name: string;
      localPath: string;
      isActive: boolean;
    };
  }>;
};

export type SyncRemotesSummary = {
  added: string[];
  reactivated: string[];
  disabled: string[];
};

export interface CloudInventoryRepository {
  listRemotes(remoteIds?: bigint[]): Promise<RemoteRecord[]>;
  findRemoteById(remoteId: bigint): Promise<RemoteRecord | null>;
  syncRemotesFromRclone(remoteNames: string[]): Promise<SyncRemotesSummary>;
  getUsedCapacityByRemoteIds(remoteIds?: bigint[]): Promise<RemoteUsageAggregate[]>;
  updateRemoteUsageSnapshot(remoteId: bigint, usedCapacity: bigint, healthStatus: HealthStatus): Promise<void>;
  updateRemoteCapacitySettings(
    remoteId: bigint,
    input: { totalCapacity?: bigint; reservedCapacity?: bigint; warningThresholdPercent?: number }
  ): Promise<void>;
  updateRemoteSettings(
    remoteId: bigint,
    input: {
      totalCapacity?: bigint;
      reservedCapacity?: bigint;
      warningThresholdPercent?: number;
      cloudTrashEnabled?: boolean;
      cloudTrashBasePath?: string;
    }
  ): Promise<void>;
  updateRemoteActiveState(remoteId: bigint, isActive: boolean): Promise<void>;
}

export type RemoteCard = {
  id: string;
  remoteName: string;
  displayName: string;
  isActive: boolean;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
  healthStatus: HealthStatus;
  capacity: {
    totalCapacityBytes: string;
    usedCapacityBytes: string;
    reservedCapacityBytes: string;
    remainingCapacityBytes: string;
    usagePercent: number;
    warningThresholdPercent: number;
    alert: boolean;
  };
  mappedDirectories: Array<{
    mappingTaskId: string;
    mappingTaskName: string;
    localPath: string;
    role: string;
    priority: number;
    mappingTaskActive: boolean;
  }>;
  lastSyncAt: string | null;
  updatedAt: string;
};

export type CapacityUpdateInput = {
  totalCapacity?: bigint;
  reservedCapacity?: bigint;
  warningThresholdPercent?: number;
};

export type RemoteSettingsUpdateInput = CapacityUpdateInput & {
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
};

export class CloudInventoryService {
  private readonly log = logger.withContext({ module: 'cloud-inventory-service' });

  constructor(private readonly repository: CloudInventoryRepository, private readonly rcloneClient: IRcloneClient) {}

  async syncRemotes(): Promise<SyncRemotesSummary> {
    const remoteNames = await this.rcloneClient.listRemotes();
    const summary = await this.repository.syncRemotesFromRclone(remoteNames);
    await this.refreshUsageSnapshots();

    this.log.info('remote sync completed', summary);
    return summary;
  }

  async listRemoteCards(): Promise<RemoteCard[]> {
    const snapshots = await this.refreshUsageSnapshots();
    const remotes = await this.repository.listRemotes();
    return remotes.map((remote) => this.toRemoteCard(remote, snapshots.get(remote.id)));
  }

  async getRemoteCard(remoteId: bigint): Promise<RemoteCard> {
    const snapshots = await this.refreshUsageSnapshots([remoteId]);
    const remote = await this.repository.findRemoteById(remoteId);

    if (!remote) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Remote ${remoteId.toString()} not found`,
        statusCode: 404
      });
    }

    return this.toRemoteCard(remote, snapshots.get(remote.id));
  }

  async updateRemoteCapacity(remoteId: bigint, input: CapacityUpdateInput): Promise<RemoteCard> {
    if (input.warningThresholdPercent !== undefined && (input.warningThresholdPercent < 1 || input.warningThresholdPercent > 100)) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'warningThresholdPercent must be between 1 and 100',
        statusCode: 400
      });
    }

    await this.ensureRemoteExists(remoteId);
    await this.repository.updateRemoteCapacitySettings(remoteId, input);
    return this.getRemoteCard(remoteId);
  }

  async updateRemoteSettings(remoteId: bigint, input: RemoteSettingsUpdateInput): Promise<RemoteCard> {
    if (input.warningThresholdPercent !== undefined && (input.warningThresholdPercent < 1 || input.warningThresholdPercent > 100)) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'warningThresholdPercent must be between 1 and 100',
        statusCode: 400
      });
    }

    if (input.cloudTrashBasePath !== undefined && !input.cloudTrashBasePath.trim()) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'cloudTrashBasePath cannot be empty',
        statusCode: 400
      });
    }

    await this.ensureRemoteExists(remoteId);
    await this.repository.updateRemoteSettings(remoteId, input);
    return this.getRemoteCard(remoteId);
  }

  async setRemoteActive(remoteId: bigint, isActive: boolean): Promise<RemoteCard> {
    await this.ensureRemoteExists(remoteId);
    await this.repository.updateRemoteActiveState(remoteId, isActive);
    return this.getRemoteCard(remoteId);
  }

  async refreshRemoteStats(): Promise<{ refreshedRemotes: number }> {
    const snapshots = await this.refreshUsageSnapshots();
    return {
      refreshedRemotes: snapshots.size
    };
  }

  private async ensureRemoteExists(remoteId: bigint): Promise<void> {
    const remote = await this.repository.findRemoteById(remoteId);
    if (!remote) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Remote ${remoteId.toString()} not found`,
        statusCode: 404
      });
    }
  }

  private async refreshUsageSnapshots(
    remoteIds?: bigint[]
  ): Promise<Map<bigint, { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus }>> {
    const remotes = await this.repository.listRemotes(remoteIds);
    const snapshots = new Map<bigint, { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus }>();
    if (remotes.length === 0) {
      return snapshots;
    }

    const usageRows = await this.repository.getUsedCapacityByRemoteIds(remotes.map((remote) => remote.id));
    const usageMap = new Map<bigint, bigint>(usageRows.map((row) => [row.remoteId, row.usedCapacity]));

    for (const remote of remotes) {
      const fallbackUsedCapacity = usageMap.get(remote.id) ?? 0n;
      const runtimeAbout = remote.isActive ? await this.loadRemoteAbout(remote.remoteName) : null;
      const usedCapacity = runtimeAbout?.usedCapacity ?? fallbackUsedCapacity;
      const totalCapacity = runtimeAbout?.totalCapacity ?? remote.totalCapacity;
      const status = this.computeHealthStatus({
        totalCapacity,
        reservedCapacity: remote.reservedCapacity,
        usedCapacity,
        warningThresholdPercent: remote.warningThresholdPercent,
        isActive: remote.isActive
      });

      await this.repository.updateRemoteUsageSnapshot(remote.id, usedCapacity, status);
      snapshots.set(remote.id, { totalCapacity, usedCapacity, healthStatus: status });
    }

    return snapshots;
  }

  private toRemoteCard(
    remote: RemoteRecord,
    runtimeSnapshot?: { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus }
  ): RemoteCard {
    const effectiveTotalCapacity = runtimeSnapshot?.totalCapacity ?? remote.totalCapacity;
    const effectiveUsedCapacity = runtimeSnapshot?.usedCapacity ?? remote.usedCapacity;
    const stats = this.computeCapacityStats({
      totalCapacity: effectiveTotalCapacity,
      reservedCapacity: remote.reservedCapacity,
      usedCapacity: effectiveUsedCapacity,
      warningThresholdPercent: remote.warningThresholdPercent,
      isActive: remote.isActive
    });

    return {
      id: remote.id.toString(),
      remoteName: remote.remoteName,
      displayName: remote.displayName,
      isActive: remote.isActive,
      cloudTrashEnabled: remote.cloudTrashEnabled,
      cloudTrashBasePath: remote.cloudTrashBasePath,
      healthStatus: runtimeSnapshot?.healthStatus ?? stats.healthStatus,
      capacity: {
        totalCapacityBytes: effectiveTotalCapacity.toString(),
        usedCapacityBytes: effectiveUsedCapacity.toString(),
        reservedCapacityBytes: remote.reservedCapacity.toString(),
        remainingCapacityBytes: stats.remainingCapacity.toString(),
        usagePercent: stats.usagePercent,
        warningThresholdPercent: remote.warningThresholdPercent,
        alert: stats.healthStatus === HealthStatus.warning || stats.healthStatus === HealthStatus.full || stats.healthStatus === HealthStatus.unavailable
      },
      mappedDirectories: remote.mappingTaskRemotes.map((link) => ({
        mappingTaskId: link.mappingTask.id.toString(),
        mappingTaskName: link.mappingTask.name,
        localPath: link.mappingTask.localPath,
        role: link.role,
        priority: link.priority,
        mappingTaskActive: link.mappingTask.isActive
      })),
      lastSyncAt: remote.lastSyncAt?.toISOString() ?? null,
      updatedAt: remote.updatedAt.toISOString()
    };
  }

  private async loadRemoteAbout(remoteName: string): Promise<{ totalCapacity?: bigint; usedCapacity?: bigint } | null> {
    try {
      const about = await this.rcloneClient.getAbout(`${remoteName}:`);
      return {
        totalCapacity: about.total ? BigInt(about.total) : undefined,
        usedCapacity: about.used ? BigInt(about.used) : undefined
      };
    } catch (error) {
      this.log.warn('failed to load remote capacity from rclone about', { remoteName, err: error });
      return null;
    }
  }

  private computeHealthStatus(input: {
    totalCapacity: bigint;
    reservedCapacity: bigint;
    usedCapacity: bigint;
    warningThresholdPercent: number;
    isActive: boolean;
  }): HealthStatus {
    return this.computeCapacityStats(input).healthStatus;
  }

  private computeCapacityStats(input: {
    totalCapacity: bigint;
    reservedCapacity: bigint;
    usedCapacity: bigint;
    warningThresholdPercent: number;
    isActive: boolean;
  }): { remainingCapacity: bigint; usagePercent: number; healthStatus: HealthStatus } {
    if (!input.isActive) {
      return {
        remainingCapacity: 0n,
        usagePercent: 0,
        healthStatus: HealthStatus.unavailable
      };
    }

    if (input.totalCapacity <= 0n) {
      return {
        remainingCapacity: 0n,
        usagePercent: 0,
        healthStatus: HealthStatus.healthy
      };
    }

    const available = input.totalCapacity - input.reservedCapacity > 0n ? input.totalCapacity - input.reservedCapacity : 0n;

    if (available === 0n) {
      return {
        remainingCapacity: 0n,
        usagePercent: 100,
        healthStatus: HealthStatus.full
      };
    }

    const remaining = input.usedCapacity >= available ? 0n : available - input.usedCapacity;
    const usagePercent = Number((input.usedCapacity * 10000n) / available) / 100;

    if (input.usedCapacity >= available) {
      return {
        remainingCapacity: remaining,
        usagePercent: 100,
        healthStatus: HealthStatus.full
      };
    }

    if (usagePercent >= input.warningThresholdPercent) {
      return {
        remainingCapacity: remaining,
        usagePercent,
        healthStatus: HealthStatus.warning
      };
    }

    return {
      remainingCapacity: remaining,
      usagePercent,
      healthStatus: HealthStatus.healthy
    };
  }
}

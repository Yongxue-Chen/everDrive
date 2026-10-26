import { HealthStatus } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';
import type { IRcloneClient } from '../../infrastructure/rclone/rclone-rcd-client.js';
import { buildRemoteFs } from './remote-fs.js';

export type RemoteUsageAggregate = {
  remoteId: bigint;
  usedCapacity: bigint;
};

export type RemoteRecord = {
  id: bigint;
  remoteName: string;
  displayName: string;
  remoteRootPath: string;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
  warningThresholdPercent: number;
  healthStatus: HealthStatus;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastAlertAt: Date | null;
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
      deletedAt?: Date | null;
    };
  }>;
};

export type CreateRemoteInput = {
  displayName: string;
  remoteName: string;
  totalCapacity?: bigint;
  reservedCapacity?: bigint;
  warningThresholdPercent?: number;
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
  remoteRootPath?: string;
};

export type RcloneRemoteOption = {
  remoteName: string;
  available: boolean;
  boundRemoteId?: string;
  boundDisplayName?: string;
};

export interface CloudInventoryRepository {
  listRemotes(remoteIds?: bigint[]): Promise<RemoteRecord[]>;
  findRemoteById(remoteId: bigint): Promise<RemoteRecord | null>;
  getRemoteByDisplayName(displayName: string): Promise<RemoteRecord | null>;
  getRemoteByBoundRemoteName(remoteName: string): Promise<RemoteRecord | null>;
  createRemote(input: CreateRemoteInput): Promise<RemoteRecord>;
  getUsedCapacityByRemoteIds(remoteIds?: bigint[]): Promise<RemoteUsageAggregate[]>;
  updateRemoteUsageSnapshot(remoteId: bigint, usedCapacity: bigint, healthStatus: HealthStatus): Promise<void>;
  updateRemoteCapacitySettings(
    remoteId: bigint,
    input: { totalCapacity?: bigint; reservedCapacity?: bigint; warningThresholdPercent?: number }
  ): Promise<void>;
  updateRemoteSettings(
    remoteId: bigint,
    input: {
      displayName?: string;
      totalCapacity?: bigint;
      reservedCapacity?: bigint;
      warningThresholdPercent?: number;
      cloudTrashEnabled?: boolean;
      cloudTrashBasePath?: string;
      remoteName?: string;
      remoteRootPath?: string;
    }
  ): Promise<void>;
  updateRemoteBindingStatus(
    remoteId: bigint,
    input: {
      healthStatus: HealthStatus;
      isActive?: boolean;
      lastCheckedAt: Date;
      lastAlertAt?: Date;
    }
  ): Promise<void>;
  writeRemoteAlert(remoteId: bigint, input: { code: string; message: string; metadataJson?: Record<string, unknown> }): Promise<void>;
  updateRemoteActiveState(remoteId: bigint, isActive: boolean): Promise<void>;
  deleteRemote(remoteId: bigint): Promise<void>;
}

export type RemoteCard = {
  id: string;
  remoteName: string;
  displayName: string;
  remoteRootPath: string;
  isActive: boolean;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
  healthStatus: HealthStatus;
  lastCheckedAt: string | null;
  lastAlertAt: string | null;
  capacity: {
    totalCapacityBytes: string;
    usedCapacityBytes: string;
    reservedCapacityBytes: string;
    remainingCapacityBytes: string;
    usagePercent: number;
    warningThresholdPercent: number;
    alert: boolean;
    realUsageAvailable: boolean;
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
  displayName?: string;
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
  remoteName?: string;
  remoteRootPath?: string;
};

export class CloudInventoryService {
  private readonly log = logger.withContext({ module: 'cloud-inventory-service' });

  constructor(private readonly repository: CloudInventoryRepository, private readonly rcloneClient: IRcloneClient) {}

  async createRemote(input: CreateRemoteInput): Promise<RemoteCard> {
    const normalized = this.normalizeCreateOrUpdateInput(input);
    await this.assertRemoteBindingAvailable(normalized.remoteName);

    const existingName = await this.repository.getRemoteByDisplayName(normalized.displayName);
    if (existingName) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `Remote displayName already exists: ${normalized.displayName}`,
        statusCode: 400
      });
    }

    const created = await this.repository.createRemote(normalized);
    return this.getRemoteCard(created.id);
  }

  async listRcloneRemoteOptions(): Promise<RcloneRemoteOption[]> {
    const [remoteNames, boundRemotes] = await Promise.all([this.rcloneClient.listRemotes(), this.repository.listRemotes()]);
    const boundMap = new Map(boundRemotes.map((item) => [item.remoteName, item]));

    return [...new Set(remoteNames.map((item) => item.replace(/:$/, '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
      .map((remoteName) => {
        const bound = boundMap.get(remoteName);
        if (!bound) {
          return { remoteName, available: true };
        }
        return {
          remoteName,
          available: false,
          boundRemoteId: bound.id.toString(),
          boundDisplayName: bound.displayName
        };
      });
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
    await this.ensureRemoteExists(remoteId);
    const normalized = this.normalizeCreateOrUpdateInput(input);
    if (normalized.displayName !== undefined) {
      const existingName = await this.repository.getRemoteByDisplayName(normalized.displayName);
      if (existingName && existingName.id !== remoteId) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: `Remote displayName already exists: ${normalized.displayName}`,
          statusCode: 400
        });
      }
    }
    if (normalized.remoteName !== undefined) {
      await this.assertRemoteBindingAvailable(normalized.remoteName, remoteId);
    }
    await this.repository.updateRemoteSettings(remoteId, normalized);
    return this.getRemoteCard(remoteId);
  }

  async setRemoteActive(remoteId: bigint, isActive: boolean): Promise<RemoteCard> {
    await this.ensureRemoteExists(remoteId);
    await this.repository.updateRemoteActiveState(remoteId, isActive);
    return this.getRemoteCard(remoteId);
  }

  async deleteRemote(remoteId: bigint): Promise<void> {
    await this.ensureRemoteExists(remoteId);
    await this.repository.deleteRemote(remoteId);
  }

  async refreshRemoteStats(): Promise<{ refreshedRemotes: number }> {
    const snapshots = await this.refreshUsageSnapshots();
    return {
      refreshedRemotes: snapshots.size
    };
  }

  async checkRemoteBindings(): Promise<{ checked: number; unavailable: string[] }> {
    const [remotes, remoteNames] = await Promise.all([this.repository.listRemotes(), this.rcloneClient.listRemotes()]);
    const availableNames = new Set(remoteNames.map((item) => item.replace(/:$/, '').trim()).filter(Boolean));
    const unavailable: string[] = [];
    const presentRemoteIds: bigint[] = [];
    const now = new Date();

    for (const remote of remotes) {
      if (availableNames.has(remote.remoteName)) {
        presentRemoteIds.push(remote.id);
        continue;
      }

      if (!availableNames.has(remote.remoteName)) {
        unavailable.push(remote.displayName);
        await this.repository.updateRemoteBindingStatus(remote.id, {
          healthStatus: HealthStatus.unavailable,
          lastCheckedAt: now,
          lastAlertAt: this.shouldWriteAlert(remote, now) ? now : undefined
        });
        if (this.shouldWriteAlert(remote, now)) {
          await this.repository.writeRemoteAlert(remote.id, {
            code: 'bound_remote_missing',
            message: `Bound rclone remote ${remote.remoteName} is missing`,
            metadataJson: {
              displayName: remote.displayName,
              remoteName: remote.remoteName
            }
          });
        }
      }
    }

    if (presentRemoteIds.length > 0) {
      await this.refreshUsageSnapshots(presentRemoteIds);
    }

    return { checked: remotes.length, unavailable };
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

  private normalizeCreateOrUpdateInput<T extends CreateRemoteInput | RemoteSettingsUpdateInput>(input: T): T {
    const output: Record<string, unknown> = { ...input };

    if ('displayName' in input && input.displayName !== undefined) {
      const displayName = input.displayName.trim();
      if (!displayName) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: 'displayName cannot be empty',
          statusCode: 400
        });
      }
      output.displayName = displayName;
    }

    if ('remoteName' in input && input.remoteName !== undefined) {
      const remoteName = input.remoteName.replace(/:$/, '').trim();
      if (!remoteName) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: 'remoteName cannot be empty',
          statusCode: 400
        });
      }
      output.remoteName = remoteName;
    }

    if (input.warningThresholdPercent !== undefined && (input.warningThresholdPercent < 1 || input.warningThresholdPercent > 100)) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'warningThresholdPercent must be between 1 and 100',
        statusCode: 400
      });
    }

    if ('cloudTrashBasePath' in input && input.cloudTrashBasePath !== undefined && !input.cloudTrashBasePath.trim()) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'cloudTrashBasePath cannot be empty',
        statusCode: 400
      });
    }

    if ('remoteRootPath' in input && input.remoteRootPath !== undefined && !input.remoteRootPath.trim()) {
      output.remoteRootPath = '';
    }

    return output as T;
  }

  private async assertRemoteBindingAvailable(remoteName: string, excludeRemoteId?: bigint): Promise<void> {
    const rcloneRemotes = await this.rcloneClient.listRemotes();
    const remoteNames = new Set(rcloneRemotes.map((item) => item.replace(/:$/, '').trim()).filter(Boolean));
    if (!remoteNames.has(remoteName)) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `rclone remote not found: ${remoteName}`,
        statusCode: 400
      });
    }

    const bound = await this.repository.getRemoteByBoundRemoteName(remoteName);
    if (bound && bound.id !== excludeRemoteId) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `rclone remote already bound by ${bound.displayName}`,
        statusCode: 400
      });
    }
  }

  private async refreshUsageSnapshots(
    remoteIds?: bigint[]
  ): Promise<Map<bigint, { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus; realUsageAvailable: boolean }>> {
    const remotes = await this.repository.listRemotes(remoteIds);
    const snapshots = new Map<
      bigint,
      { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus; realUsageAvailable: boolean }
    >();
    if (remotes.length === 0) {
      return snapshots;
    }

    const usageRows = await this.repository.getUsedCapacityByRemoteIds(remotes.map((remote) => remote.id));
    const usageMap = new Map<bigint, bigint>(usageRows.map((row) => [row.remoteId, row.usedCapacity]));

    for (const remote of remotes) {
      const fallbackUsedCapacity = usageMap.get(remote.id) ?? 0n;
      const runtimeAbout = remote.isActive ? await this.loadRemoteAbout(remote.remoteName, remote.remoteRootPath) : null;
      const usedCapacity = runtimeAbout?.usedCapacity ?? fallbackUsedCapacity;
      const totalCapacity = runtimeAbout?.totalCapacity ?? remote.totalCapacity;
      const realUsageAvailable = runtimeAbout?.realUsageAvailable ?? false;
      const status = this.computeHealthStatus({
        totalCapacity,
        reservedCapacity: remote.reservedCapacity,
        usedCapacity,
        warningThresholdPercent: remote.warningThresholdPercent,
        isActive: remote.isActive
      });

      await this.repository.updateRemoteUsageSnapshot(remote.id, usedCapacity, status);
      snapshots.set(remote.id, { totalCapacity, usedCapacity, healthStatus: status, realUsageAvailable });
    }

    return snapshots;
  }

  private toRemoteCard(
    remote: RemoteRecord,
    runtimeSnapshot?: { totalCapacity?: bigint; usedCapacity: bigint; healthStatus: HealthStatus; realUsageAvailable: boolean }
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
      remoteRootPath: remote.remoteRootPath,
      isActive: remote.isActive,
      cloudTrashEnabled: remote.cloudTrashEnabled,
      cloudTrashBasePath: remote.cloudTrashBasePath,
      healthStatus: runtimeSnapshot?.healthStatus ?? stats.healthStatus,
      lastCheckedAt: remote.lastCheckedAt?.toISOString() ?? null,
      lastAlertAt: remote.lastAlertAt?.toISOString() ?? null,
      capacity: {
        totalCapacityBytes: effectiveTotalCapacity.toString(),
        usedCapacityBytes: effectiveUsedCapacity.toString(),
        reservedCapacityBytes: remote.reservedCapacity.toString(),
        remainingCapacityBytes: stats.remainingCapacity.toString(),
        usagePercent: stats.usagePercent,
        warningThresholdPercent: remote.warningThresholdPercent,
        alert: stats.healthStatus === HealthStatus.warning || stats.healthStatus === HealthStatus.full || stats.healthStatus === HealthStatus.unavailable,
        realUsageAvailable: runtimeSnapshot?.realUsageAvailable ?? false
      },
      // Soft-deleted mappings keep their bindings in the database but are no longer in use.
      mappedDirectories: remote.mappingTaskRemotes.filter((link) => !link.mappingTask.deletedAt).map((link) => ({
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

  private shouldWriteAlert(remote: RemoteRecord, now: Date): boolean {
    if (!remote.lastAlertAt) {
      return true;
    }
    return now.getTime() - remote.lastAlertAt.getTime() >= 30 * 60 * 1000;
  }

  private async loadRemoteAbout(
    remoteName: string,
    remoteRootPath: string
  ): Promise<{ totalCapacity?: bigint; usedCapacity?: bigint; realUsageAvailable: boolean } | null> {
    try {
      const about = await this.rcloneClient.getAbout(buildRemoteFs(remoteName, remoteRootPath));
      return {
        totalCapacity: about.total ? BigInt(about.total) : undefined,
        usedCapacity: about.used ? BigInt(about.used) : undefined,
        realUsageAvailable: Boolean(about.used)
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

import path from 'node:path';
import type { HealthStatus, MappingRemoteRole, SyncMode } from '@prisma/client';
import { AppError } from '../../errors/app-error.js';

export type MappingTaskStatus = 'active' | 'inactive' | 'deleted';

export type MappingTaskRemoteRecord = {
  id: bigint;
  remoteId: bigint;
  role: MappingRemoteRole;
  priority: number;
  remoteBasePath: string;
  remote: {
    id: bigint;
    remoteName: string;
    displayName: string;
    isActive: boolean;
    healthStatus: HealthStatus;
    totalCapacity: bigint;
    usedCapacity: bigint;
    reservedCapacity: bigint;
  };
};

export type MappingTaskRecord = {
  id: bigint;
  name: string;
  localPath: string;
  syncMode: SyncMode;
  encryptionEnabled: boolean;
  redundancyEnabled: boolean;
  splitEnabled: boolean;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt: Date | null;
  remotes: MappingTaskRemoteRecord[];
};

export type RemoteCapacityRecord = {
  remoteId: bigint;
  remoteName: string;
  displayName: string;
  isActive: boolean;
  healthStatus: HealthStatus;
  totalCapacity: bigint;
  usedCapacity: bigint;
  reservedCapacity: bigint;
};

export type MappingRemoteBindingInput = {
  remoteId: bigint;
  priority?: number;
  remoteBasePath?: string;
};

export type MappingRemoteBinding = {
  remoteId: bigint;
  role: MappingRemoteRole;
  priority: number;
  remoteBasePath: string;
};

export type CreateMappingTaskInput = {
  name: string;
  localPath: string;
  syncMode: SyncMode;
  encryptionEnabled: boolean;
  redundancyEnabled: boolean;
  splitEnabled: boolean;
  expectedDataSizeBytes?: bigint;
  remoteBindings: MappingRemoteBindingInput[];
};

export type UpdateMappingTaskInput = {
  name?: string;
  localPath?: string;
  syncMode?: SyncMode;
  encryptionEnabled?: boolean;
  redundancyEnabled?: boolean;
  splitEnabled?: boolean;
  expectedDataSizeBytes?: bigint;
  remoteBindings?: MappingRemoteBindingInput[];
};

export type MappingTaskListQuery = {
  status?: MappingTaskStatus | 'all';
  includeDeleted?: boolean;
};

export interface MappingTaskRepository {
  createTask(
    input: Omit<CreateMappingTaskInput, 'expectedDataSizeBytes' | 'remoteBindings'> & { remoteBindings: MappingRemoteBinding[] }
  ): Promise<MappingTaskRecord>;
  listTasks(query?: MappingTaskListQuery): Promise<MappingTaskRecord[]>;
  listActiveTaskIds(): Promise<bigint[]>;
  findTaskById(taskId: bigint, query?: Pick<MappingTaskListQuery, 'includeDeleted'>): Promise<MappingTaskRecord | null>;
  updateTask(
    taskId: bigint,
    input: Omit<UpdateMappingTaskInput, 'expectedDataSizeBytes' | 'remoteBindings'> & { remoteBindings?: MappingRemoteBinding[] }
  ): Promise<MappingTaskRecord>;
  setTaskActive(taskId: bigint, isActive: boolean): Promise<MappingTaskRecord>;
  softDeleteTask(taskId: bigint): Promise<MappingTaskRecord>;
  hardDeleteTask(taskId: bigint): Promise<void>;
  listRemoteCapacities(remoteIds: bigint[]): Promise<RemoteCapacityRecord[]>;
}

export type MappingTaskRemoteView = {
  remoteId: string;
  remoteName: string;
  displayName: string;
  role: MappingRemoteRole;
  priority: number;
  remoteBasePath: string;
  isActive: boolean;
  healthStatus: HealthStatus;
  availableCapacityBytes: string;
};

export type MappingTaskView = {
  id: string;
  name: string;
  local_path: string;
  remotes: MappingTaskRemoteView[];
  sync_mode: SyncMode;
  encryption_enabled: boolean;
  redundancy_enabled: boolean;
  split_enabled: boolean;
  last_sync_at: string | null;
  status: MappingTaskStatus;
  created_at: string;
  updated_at: string;
};

export class MappingTaskService {
  constructor(private readonly repository: MappingTaskRepository) {}

  async createTask(input: CreateMappingTaskInput): Promise<MappingTaskView> {
    const normalized = this.normalizeCreateOrUpdateInput(input);
    const remotes = await this.validateRemotesAndResolveBindings(normalized);

    const created = await this.repository.createTask({
      ...normalized,
      remoteBindings: remotes
    });

    return this.toView(created);
  }

  async listTasks(query?: MappingTaskListQuery): Promise<MappingTaskView[]> {
    const items = await this.repository.listTasks(query);
    return items.map((item) => this.toView(item));
  }

  async listActiveTaskIds(): Promise<bigint[]> {
    return this.repository.listActiveTaskIds();
  }

  async getTaskDetail(taskId: bigint, query?: Pick<MappingTaskListQuery, 'includeDeleted'>): Promise<MappingTaskView> {
    const item = await this.repository.findTaskById(taskId, query);
    if (!item) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Mapping task ${taskId.toString()} not found`,
        statusCode: 404
      });
    }

    return this.toView(item);
  }

  async updateTask(taskId: bigint, input: UpdateMappingTaskInput): Promise<MappingTaskView> {
    const current = await this.getTask(taskId);
    const normalized = this.normalizeCreateOrUpdateInput(input);

    const effectiveSyncMode = normalized.syncMode ?? current.syncMode;
    const effectiveEncryptionEnabled = normalized.encryptionEnabled ?? current.encryptionEnabled;
    const effectiveRedundancyEnabled = normalized.redundancyEnabled ?? current.redundancyEnabled;
    const effectiveSplitEnabled = normalized.splitEnabled ?? current.splitEnabled;
    const effectiveRemoteBindings =
      normalized.remoteBindings ??
      current.remotes.map((item) => ({
        remoteId: item.remoteId,
        priority: item.priority,
        remoteBasePath: item.remoteBasePath
      }));

    const shouldRebuildBindings =
      normalized.remoteBindings !== undefined ||
      normalized.syncMode !== undefined ||
      normalized.redundancyEnabled !== undefined ||
      normalized.splitEnabled !== undefined ||
      normalized.expectedDataSizeBytes !== undefined;

    const remoteBindings = shouldRebuildBindings
      ? await this.validateRemotesAndResolveBindings({
          syncMode: effectiveSyncMode,
          encryptionEnabled: effectiveEncryptionEnabled,
          redundancyEnabled: effectiveRedundancyEnabled,
          splitEnabled: effectiveSplitEnabled,
          expectedDataSizeBytes: normalized.expectedDataSizeBytes,
          remoteBindings: effectiveRemoteBindings
        })
      : undefined;

    const updated = await this.repository.updateTask(taskId, {
      ...normalized,
      remoteBindings
    });

    return this.toView(updated);
  }

  async setTaskActive(taskId: bigint, isActive: boolean): Promise<MappingTaskView> {
    await this.ensureTaskExists(taskId);
    const updated = await this.repository.setTaskActive(taskId, isActive);
    return this.toView(updated);
  }

  async deleteTask(taskId: bigint, options?: { hardDelete?: boolean }): Promise<MappingTaskView | null> {
    await this.ensureTaskExists(taskId, { includeDeleted: true });

    if (options?.hardDelete) {
      await this.repository.hardDeleteTask(taskId);
      return null;
    }

    const deleted = await this.repository.softDeleteTask(taskId);
    return this.toView(deleted);
  }

  private async getTask(taskId: bigint): Promise<MappingTaskRecord> {
    const task = await this.repository.findTaskById(taskId, { includeDeleted: true });
    if (!task) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Mapping task ${taskId.toString()} not found`,
        statusCode: 404
      });
    }
    return task;
  }

  private async ensureTaskExists(taskId: bigint, query?: Pick<MappingTaskListQuery, 'includeDeleted'>): Promise<void> {
    const found = await this.repository.findTaskById(taskId, query);
    if (!found) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Mapping task ${taskId.toString()} not found`,
        statusCode: 404
      });
    }
  }

  private normalizeCreateOrUpdateInput<T extends CreateMappingTaskInput | UpdateMappingTaskInput>(input: T): T {
    const output: Record<string, unknown> = { ...input };

    if ('localPath' in input && input.localPath !== undefined) {
      output.localPath = this.normalizeLocalPath(input.localPath);
    }

    if ('name' in input && input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (!trimmedName) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: 'name cannot be empty',
          statusCode: 400
        });
      }
      output.name = trimmedName;
    }

    if ('expectedDataSizeBytes' in input && input.expectedDataSizeBytes !== undefined && input.expectedDataSizeBytes < 0n) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'expectedDataSizeBytes must be greater than or equal to 0',
        statusCode: 400
      });
    }

    return output as T;
  }

  private normalizeLocalPath(rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'localPath cannot be empty',
        statusCode: 400
      });
    }

    const slashNormalized = trimmed.replace(/\\/g, '/');
    let normalized = path.posix.normalize(slashNormalized);

    if (!normalized.startsWith('/')) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'localPath must be an absolute path',
        statusCode: 400
      });
    }

    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    if (normalized === '.') {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'localPath is invalid',
        statusCode: 400
      });
    }

    return normalized;
  }

  private async validateRemotesAndResolveBindings(input: {
    syncMode: SyncMode;
    encryptionEnabled: boolean;
    redundancyEnabled: boolean;
    splitEnabled: boolean;
    expectedDataSizeBytes?: bigint;
    remoteBindings: MappingRemoteBindingInput[];
  }): Promise<MappingRemoteBinding[]> {
    if (input.remoteBindings.length === 0) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'At least one remote must be bound to the mapping task',
        statusCode: 400
      });
    }

    const remoteIds = input.remoteBindings.map((item) => item.remoteId);
    const dedup = new Set(remoteIds.map((id) => id.toString()));
    if (dedup.size !== remoteIds.length) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'remoteIds cannot contain duplicates',
        statusCode: 400
      });
    }

    if (input.redundancyEnabled && input.splitEnabled) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'redundancyEnabled and splitEnabled cannot both be true',
        statusCode: 400
      });
    }

    if (input.redundancyEnabled && input.remoteBindings.length < 2) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'redundancy mode requires at least two remotes',
        statusCode: 400
      });
    }

    if (input.splitEnabled && input.remoteBindings.length < 2) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'split mode requires at least two remotes',
        statusCode: 400
      });
    }

    if (!input.redundancyEnabled && !input.splitEnabled && input.remoteBindings.length > 1) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: 'Multiple remotes require either redundancyEnabled or splitEnabled',
        statusCode: 400
      });
    }

    const remotes = await this.repository.listRemoteCapacities(remoteIds);
    if (remotes.length !== remoteIds.length) {
      const found = new Set(remotes.map((item) => item.remoteId.toString()));
      const missing = remoteIds.filter((id) => !found.has(id.toString())).map((id) => id.toString());
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `Remote not found: ${missing.join(', ')}`,
        statusCode: 400
      });
    }

    for (const remote of remotes) {
      if (!remote.isActive) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: `Remote ${remote.remoteName} is inactive`,
          statusCode: 400
        });
      }
    }

    if (input.splitEnabled) {
      let totalAvailable = 0n;
      for (const remote of remotes) {
        const available = this.computeAvailableCapacity(remote);
        if (available <= 0n) {
          throw new AppError({
            code: 'BAD_REQUEST',
            message: `Remote ${remote.remoteName} has no available capacity for split distribution`,
            statusCode: 400
          });
        }
        totalAvailable += available;
      }

      if (input.expectedDataSizeBytes !== undefined && totalAvailable < input.expectedDataSizeBytes) {
        throw new AppError({
          code: 'BAD_REQUEST',
          message: 'Split mode total remote capacity is insufficient for expected data size',
          statusCode: 400,
          details: {
            expectedDataSizeBytes: input.expectedDataSizeBytes.toString(),
            totalAvailableBytes: totalAvailable.toString()
          }
        });
      }
    }

    return input.remoteBindings.map((item, index) => ({
      remoteId: item.remoteId,
      role: this.resolveRole(index, input.redundancyEnabled, input.splitEnabled),
      priority: item.priority ?? (index + 1) * 100,
      remoteBasePath: this.normalizeRemoteBasePath(item.remoteBasePath)
    }));
  }

  private resolveRole(index: number, redundancyEnabled: boolean, splitEnabled: boolean): MappingRemoteRole {
    if (splitEnabled) {
      return 'shard';
    }

    if (redundancyEnabled) {
      return index === 0 ? 'primary' : 'backup';
    }

    return 'primary';
  }

  private computeAvailableCapacity(remote: {
    totalCapacity: bigint;
    reservedCapacity: bigint;
    usedCapacity: bigint;
  }): bigint {
    const reservedAdjusted = remote.totalCapacity - remote.reservedCapacity;
    const base = reservedAdjusted > 0n ? reservedAdjusted : 0n;
    return base > remote.usedCapacity ? base - remote.usedCapacity : 0n;
  }

  private normalizeRemoteBasePath(rawPath?: string): string {
    if (!rawPath) {
      return '';
    }

    const trimmed = rawPath.trim();
    if (!trimmed) {
      return '';
    }

    const slashNormalized = trimmed.replace(/\\/g, '/');
    let normalized = path.posix.normalize(slashNormalized);

    if (normalized === '.' || normalized === '/') {
      return '';
    }

    if (normalized.startsWith('/')) {
      normalized = normalized.replace(/^\/+/, '');
    }

    if (normalized.endsWith('/')) {
      normalized = normalized.replace(/\/+$/, '');
    }

    if (!normalized) {
      return '';
    }

    if (normalized === '..' || normalized.startsWith('../')) {
      throw new AppError({
        code: 'BAD_REQUEST',
        message: `remoteBasePath is invalid: ${rawPath}`,
        statusCode: 400
      });
    }

    return normalized;
  }

  private toView(record: MappingTaskRecord): MappingTaskView {
    return {
      id: record.id.toString(),
      name: record.name,
      local_path: record.localPath,
      remotes: record.remotes.map((item) => ({
        remoteId: item.remoteId.toString(),
        remoteName: item.remote.remoteName,
        displayName: item.remote.displayName,
          role: item.role,
          priority: item.priority,
          remoteBasePath: item.remoteBasePath,
          isActive: item.remote.isActive,
        healthStatus: item.remote.healthStatus,
        availableCapacityBytes: this.computeAvailableCapacity(item.remote).toString()
      })),
      sync_mode: record.syncMode,
      encryption_enabled: record.encryptionEnabled,
      redundancy_enabled: record.redundancyEnabled,
      split_enabled: record.splitEnabled,
      last_sync_at: record.lastSyncAt?.toISOString() ?? null,
      status: this.resolveStatus(record),
      created_at: record.createdAt.toISOString(),
      updated_at: record.updatedAt.toISOString()
    };
  }

  private resolveStatus(record: MappingTaskRecord): MappingTaskStatus {
    if (record.deletedAt) {
      return 'deleted';
    }

    return record.isActive ? 'active' : 'inactive';
  }
}

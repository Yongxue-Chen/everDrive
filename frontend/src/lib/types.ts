export type ApiMode = 'live' | 'mock';

export type WorkspaceItem = {
  mapping_task_id: string;
  name: string;
  local_path: string;
  remotes: Array<{
    remote_id: string;
    remote_name: string;
    display_name: string;
    role: string;
    priority: number;
    health_status: string;
    is_active: boolean;
  }>;
  sync_status: 'green' | 'yellow' | 'red';
  last_sync_at: string | null;
  encryption_enabled: boolean;
  redundancy_enabled: boolean;
  replica_count: number;
  file_count: number;
  total_size: string;
};

export type WorkspaceViewResponse = {
  items: WorkspaceItem[];
  rules: {
    sync_status: Record<'green' | 'yellow' | 'red', string>;
  };
};

export type CloudItem = {
  remote_id: string;
  remote_name: string;
  total_capacity: string;
  used_capacity: string;
  remaining_capacity: string;
  usage_percent: number;
  health_status: string;
  mapping_tasks: Array<{
    mapping_task_id: string;
    name: string;
    local_path: string;
  }>;
  file_count: number;
  warning_flag: boolean;
};

export type CloudViewResponse = {
  items: CloudItem[];
  rules: {
    capacity_warning: {
      warning_flag_true: string;
      warning_flag_false: string;
    };
  };
};

export type MappingTaskListResponse = {
  items: Array<{
    id: string;
    name: string;
    local_path: string;
    remotes: Array<{
      remoteId: string;
      remoteName: string;
      displayName: string;
      role: string;
      priority: number;
      remoteBasePath: string;
      is_active: boolean;
      healthStatus: string;
      availableCapacityBytes: string;
    }>;
    sync_mode: 'archive' | 'mirror';
    encryption_enabled: boolean;
    redundancy_enabled: boolean;
    split_enabled: boolean;
    last_sync_at: string | null;
    status: 'active' | 'inactive' | 'deleted';
    created_at: string;
    updated_at: string;
  }>;
};

export type MappingTaskItem = MappingTaskListResponse['items'][number];
export type MappingTaskRemoteItem = MappingTaskItem['remotes'][number];

export type MappingTaskRemoteBindingInput = {
  remoteId: string;
  priority?: number;
  remoteBasePath?: string;
};

export type CreateMappingTaskPayload = {
  name: string;
  localPath: string;
  syncMode: 'archive' | 'mirror';
  encryptionEnabled: boolean;
  redundancyEnabled: boolean;
  splitEnabled: boolean;
  expectedDataSizeBytes?: string;
  remoteBindings: MappingTaskRemoteBindingInput[];
};

export type UpdateMappingTaskPayload = Partial<Omit<CreateMappingTaskPayload, 'remoteBindings'>> & {
  remoteBindings?: MappingTaskRemoteBindingInput[];
};

export type MappingTaskMutationResponse = {
  item: MappingTaskItem;
};

export type MappingTaskDeleteResponse = {
  item: MappingTaskItem | null;
  deleted: boolean;
  hardDelete: boolean;
};

export type RemotesListResponse = {
  items: Array<{
    id: string;
    remoteName: string;
    displayName: string;
    remoteRootPath: string;
    isActive: boolean;
    cloudTrashEnabled: boolean;
    cloudTrashBasePath: string;
    healthStatus: string;
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
  }>;
};

export type SyncCloudRemotesResponse = {
  summary: {
    added: string[];
    reactivated: string[];
    disabled: string[];
  };
};

export type UpdateRemoteCapacityPayload = {
  totalCapacity?: string;
  reservedCapacity?: string;
  warningThresholdPercent?: number;
};

export type UpdateRemoteCapacityResponse = {
  item: RemotesListResponse['items'][number];
};

export type UpdateRemoteSettingsPayload = UpdateRemoteCapacityPayload & {
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
  remoteRootPath?: string;
};

export type UpdateRemoteSettingsResponse = {
  item: RemotesListResponse['items'][number];
};

export type LocalPathBrowseResponse = {
  currentPath: string;
  parentPath: string | null;
  roots: string[];
  items: Array<{
    name: string;
    path: string;
    isDirectory: true;
  }>;
};

export type QueueJob = {
  id: string;
  kind: string;
  lane: 'short' | 'long';
  mappingTaskId: string | null;
  remoteIds: string[];
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
};

export type SettingsItem = {
  values: {
    rcloneRcd: {
      url: string;
      user: string;
      passMasked: string;
      hasPassword: boolean;
      timeoutMs: number;
      retryAttempts: number;
      retryDelayMs: number;
    };
    defaultScanIntervalSeconds: number;
    defaultConcurrency: {
      sync: number;
      rclone: number;
      jobLong: number;
      jobShort: number;
      jobRemoteLimit: number;
    };
    defaultCapacityWarningThresholdPercent: number;
    hashAlgorithm: 'md5' | 'sha1' | 'sha256' | 'blake3';
    logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
    syncProfile: {
      transfers: number;
      checkers: number;
      bufferSizeMiB: number;
      tpsLimit: number;
      bwLimitMiB: number;
    };
    cloudTrash: {
      enabled: boolean;
      retentionDays: number;
      cleanupIntervalHours: number;
      basePath: string;
      maxDeleteBatchPerRun: number;
    };
  };
  hotUpdate: {
    hotUpdatedKeys: string[];
    restartRequiredKeys: string[];
    notes: string[];
  };
};

export type SettingsResponse = {
  item: SettingsItem;
};

export type UpdateSettingsPayload = {
  rcloneRcd?: {
    url?: string;
    user?: string;
    pass?: string;
    timeoutMs?: number;
    retryAttempts?: number;
    retryDelayMs?: number;
  };
  defaultScanIntervalSeconds?: number;
  defaultConcurrency?: {
    sync?: number;
    rclone?: number;
    jobLong?: number;
    jobShort?: number;
    jobRemoteLimit?: number;
  };
  defaultCapacityWarningThresholdPercent?: number;
  hashAlgorithm?: 'md5' | 'sha1' | 'sha256' | 'blake3';
  logLevel?: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  syncProfile?: {
    transfers?: number;
    checkers?: number;
    bufferSizeMiB?: number;
    tpsLimit?: number;
    bwLimitMiB?: number;
  };
  cloudTrash?: {
    enabled?: boolean;
    retentionDays?: number;
    cleanupIntervalHours?: number;
    basePath?: string;
    maxDeleteBatchPerRun?: number;
  };
};

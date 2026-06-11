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
    source_type: 'local' | 'rclone';
    source_remote_name: string | null;
    source_path: string;
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
  sourceType?: 'local' | 'rclone';
  sourceRemoteName?: string | null;
  sourcePath?: string;
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
  }>;
};

export type RcloneRemoteOptionsResponse = {
  items: Array<{
    remoteName: string;
    available: boolean;
    boundRemoteId?: string;
    boundDisplayName?: string;
  }>;
};

export type CreateRemotePayload = {
  displayName: string;
  remoteName: string;
  totalCapacity?: string;
  reservedCapacity?: string;
  warningThresholdPercent?: number;
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
  remoteRootPath?: string;
};

export type CreateRemoteResponse = {
  item: RemotesListResponse['items'][number];
};

export type DeleteRemoteResponse = {
  deleted: boolean;
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
  displayName?: string;
  remoteName?: string;
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

export type RcloneConfigValue = string | number | boolean;
export type RcloneProviderOption = {
  Name: string;
  Help?: string;
  Required?: boolean;
  IsPassword?: boolean;
  Sensitive?: boolean;
  Advanced?: boolean;
  DefaultStr?: string;
  Type?: string;
  Examples?: Array<{ Value: string; Help?: string }>;
  Hide?: number;
};
export type RcloneProvider = { Name: string; Prefix: string; Description: string; Options: RcloneProviderOption[]; Hide?: boolean };
export type RcloneConfigRemoteSummary = { name: string; boundRemoteId: string | null; boundDisplayName: string | null; webUrl: string | null };
export type RcloneConfigFlowPayload = { action: 'create' | 'update'; name: string; type?: string; parameters: Record<string, RcloneConfigValue>; state?: string; result?: string };
export type RcloneConfigRemote = { name: string; type: string; parameters: Record<string, unknown>; sensitiveFields: string[] };
export type RcloneConfigMutationPayload = { name: string; type: string; parameters: Record<string, RcloneConfigValue> };

export type MigrationPayload = { sourceRemoteId: string; targetRemoteId: string; scopeRelativePath?: string; targetBasePath?: string; removeSourceReplica?: boolean };
export type RedundancyOverview = { mappingTaskId: string; name: string; localPath: string; remotes: Array<{ remoteId: string; remoteName: string; displayName: string; isActive: boolean; syncedCount: number; pendingCount: number; failedCount: number; deletedCount: number }>; fileCount: number; replicaTarget: number; replicaAchieved: number; protectionLevel: 'ok' | 'degraded' | 'critical' };
export type AuditLogItem = { id: string; operationType: string; targetType: string; targetId: string | null; message: string; metadataJson: unknown; createdAt: string };
export type AuditLogQuery = { operationType?: string; targetType?: string; targetId?: string; from?: string; to?: string; limit?: number };
export type MetricsOverview = { queueLength: number; runningTasks: number; failedTasks24h: number; remoteCapacityNearLimitCount: number; recentSyncSuccessRate: number; recentFailedJobs: Array<{ jobId: string; jobType: string; mappingTaskId: string; errorMessage: string | null; createdAt: string }> };

export type EncryptionRecoveryTask = { id: string; name: string; fileCount: number };
export type EncryptionRecoveryFile = { id: string; relativePath: string; fileSize: string; modifiedTime: string; replicas: Array<{ remoteId: string; displayName: string; remotePath: string }> };

export type RcloneSourceOption = { name: string; type: 'smb' | 'sftp' };
export type RcloneSourceBrowseItem = { name: string; path: string; isDirectory: boolean; sizeBytes: string };

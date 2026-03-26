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
      remote_id: string;
      remote_name: string;
      display_name: string;
      role: string;
      priority: number;
      is_active: boolean;
      health_status: string;
      available_capacity_bytes: string;
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

export type RemotesListResponse = {
  items: Array<{
    id: string;
    remoteName: string;
    displayName: string;
    isActive: boolean;
    healthStatus: string;
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
};

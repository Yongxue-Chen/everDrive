export type SyncStatusColor = 'green' | 'yellow' | 'red';

export type WorkspaceSyncStatusRule = {
  green: string;
  yellow: string;
  red: string;
};

export type CapacityWarningRule = {
  warning_flag_true: string;
  warning_flag_false: string;
};

export type WorkspaceViewItem = {
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
  sync_status: SyncStatusColor;
  last_sync_at: string | null;
  latest_sync_status: string | null;
  latest_sync_finished_at: string | null;
  pending_change_count: number;
  attention_reasons: string[];
  encryption_enabled: boolean;
  redundancy_enabled: boolean;
  replica_count: number;
  file_count: number;
  total_size: string;
};

export type WorkspaceViewResponse = {
  items: WorkspaceViewItem[];
  rules: {
    sync_status: WorkspaceSyncStatusRule;
  };
};

export type CloudViewItem = {
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
  items: CloudViewItem[];
  rules: {
    capacity_warning: CapacityWarningRule;
  };
};

export const WORKSPACE_SYNC_STATUS_RULES: WorkspaceSyncStatusRule = {
  green: 'last sync success and no pending local changes and all bound remotes healthy',
  yellow: 'no successful sync yet or has pending changes or has warning remote',
  red: 'latest sync failed or any bound remote unavailable/full/inactive'
};

export const CAPACITY_WARNING_RULES: CapacityWarningRule = {
  warning_flag_true: 'usage_percent reaches warning threshold OR health_status is warning/full/unavailable OR remote inactive',
  warning_flag_false: 'remote active and below threshold with healthy status'
};

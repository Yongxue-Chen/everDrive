import type {
  ApiMode,
  CreateRemotePayload,
  CreateRemoteResponse,
  DeleteRemoteResponse,
  CreateMappingTaskPayload,
  CloudViewResponse,
  LocalPathBrowseResponse,
  MappingTaskDeleteResponse,
  MappingTaskItem,
  MappingTaskListResponse,
  MappingTaskMutationResponse,
  QueueJob,
  RcloneRemoteOptionsResponse,
  RemotesListResponse,
  SettingsResponse,
  UpdateMappingTaskPayload,
  UpdateRemoteCapacityPayload,
  UpdateRemoteCapacityResponse,
  UpdateRemoteSettingsPayload,
  UpdateRemoteSettingsResponse,
  UpdateSettingsPayload,
  WorkspaceViewResponse
} from './types.js';
import { cloneMockMappingTasks, mockCloudView, mockJob, mockMappingTasks, mockRemotes, mockSettings, mockWorkspaceView } from './mock-data.js';
import type { MappingTaskRemoteBindingInput, MappingTaskRemoteItem } from './types.js';

const API_MODE_KEY = 'everdrive_api_mode';
const DEFAULT_MODE = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_DEFAULT_API_MODE ?? '') === 'live' ? 'live' : 'mock';
let mockMappingTaskStore: MappingTaskItem[] | null = null;

export function getApiMode(): ApiMode {
  const raw = localStorage.getItem(API_MODE_KEY);
  if (raw === 'live' || raw === 'mock') {
    return raw;
  }
  return DEFAULT_MODE;
}

export function setApiMode(mode: ApiMode): void {
  localStorage.setItem(API_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent('everdrive_api_mode_changed', { detail: mode }));
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, path));
  }
  return (await response.json()) as T;
}

async function requestJsonWithBody<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, path));
  }
  return (await response.json()) as T;
}

async function buildApiErrorMessage(response: Response, path: string): Promise<string> {
  const fallback = `HTTP ${response.status} - ${path}`;

  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
      message?: string;
    };
    const message = payload.error?.message ?? payload.message;

    if (!message) {
      return fallback;
    }

    return `${fallback}: ${message}`;
  } catch {
    return fallback;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getMockMappingTaskStore(): MappingTaskItem[] {
  if (!mockMappingTaskStore) {
    mockMappingTaskStore = cloneMockMappingTasks();
  }
  return mockMappingTaskStore ?? [];
}

function buildRemoteView(
  binding: CreateMappingTaskPayload['remoteBindings'][number],
  index: number,
  payload: CreateMappingTaskPayload | UpdateMappingTaskPayload
): MappingTaskRemoteItem {
  const remote = mockRemotes.items.find((candidate: RemotesListResponse['items'][number]) => candidate.id === binding.remoteId);
  const mode = payload.redundancyEnabled ? (index === 0 ? 'primary' : 'backup') : payload.splitEnabled ? 'shard' : 'primary';

  return {
    remoteId: binding.remoteId,
    remoteName: remote?.remoteName ?? `remote-${binding.remoteId}`,
    displayName: remote?.displayName ?? `云盘 ${binding.remoteId}`,
    role: mode,
    priority: binding.priority ?? index + 1,
    remoteBasePath: binding.remoteBasePath ?? '',
    is_active: remote?.isActive ?? true,
    healthStatus: remote?.healthStatus ?? 'healthy',
    availableCapacityBytes: remote?.capacity.remainingCapacityBytes ?? '0'
  };
}

function upsertMockMappingTask(taskId: string, payload: CreateMappingTaskPayload | UpdateMappingTaskPayload, current?: MappingTaskItem): MappingTaskItem {
  const now = new Date().toISOString();
  const existing = current ?? {
    id: taskId,
    name: '',
    local_path: '',
    source_type: 'local' as const,
    source_remote_name: null,
    source_path: '',
    remotes: [],
    sync_mode: 'archive',
    encryption_enabled: false,
    redundancy_enabled: false,
    split_enabled: false,
    last_sync_at: null,
    status: 'active',
    created_at: now,
    updated_at: now
  };

  const nextBindings = payload.remoteBindings
    ? payload.remoteBindings.map((binding: MappingTaskRemoteBindingInput, index: number) => buildRemoteView(binding, index, payload))
    : existing.remotes;

  return {
    ...existing,
    name: payload.name ?? existing.name,
    local_path: payload.localPath ?? existing.local_path,
    source_type: payload.sourceType ?? existing.source_type,
    source_remote_name: payload.sourceRemoteName ?? existing.source_remote_name,
    source_path: payload.sourcePath ?? existing.source_path,
    remotes: nextBindings,
    sync_mode: payload.syncMode ?? existing.sync_mode,
    encryption_enabled: payload.encryptionEnabled ?? existing.encryption_enabled,
    redundancy_enabled: payload.redundancyEnabled ?? existing.redundancy_enabled,
    split_enabled: payload.splitEnabled ?? existing.split_enabled,
    updated_at: now
  };
}

export async function fetchWorkspaceView(): Promise<WorkspaceViewResponse> {
  if (getApiMode() === 'mock') {
    await sleep(150);
    return mockWorkspaceView;
  }
  return requestJson<WorkspaceViewResponse>('/api/dashboard/workspaces');
}

export async function fetchCloudView(): Promise<CloudViewResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return mockCloudView;
  }
  return requestJson<CloudViewResponse>('/api/dashboard/remotes');
}

export async function fetchMappingTasks(): Promise<MappingTaskListResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return { items: getMockMappingTaskStore() };
  }
  return requestJson<MappingTaskListResponse>('/api/mapping-tasks');
}

export async function createMappingTask(payload: CreateMappingTaskPayload): Promise<MappingTaskMutationResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const items = getMockMappingTaskStore();
    const nextId = (Math.max(0, ...items.map((item) => Number(item.id))) + 1).toString();
    const created = upsertMockMappingTask(nextId, payload);
    items.unshift(created);
    return { item: created };
  }

  return requestJsonWithBody<MappingTaskMutationResponse>('/api/mapping-tasks', 'POST', payload);
}

export async function updateMappingTask(taskId: string, payload: UpdateMappingTaskPayload): Promise<MappingTaskMutationResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const items = getMockMappingTaskStore();
    const index = items.findIndex((item) => item.id === taskId);
    if (index === -1) {
      throw new Error(`Mock mapping task not found: ${taskId}`);
    }
    const updated = upsertMockMappingTask(taskId, payload, items[index]);
    items[index] = updated;
    return { item: updated };
  }

  return requestJsonWithBody<MappingTaskMutationResponse>(`/api/mapping-tasks/${taskId}`, 'PATCH', payload);
}

export async function setMappingTaskActive(taskId: string, isActive: boolean): Promise<MappingTaskMutationResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const items = getMockMappingTaskStore();
    const index = items.findIndex((item) => item.id === taskId);
    if (index === -1) {
      throw new Error(`Mock mapping task not found: ${taskId}`);
    }
    const updated = {
      ...items[index],
      status: isActive ? ('active' as const) : ('inactive' as const),
      updated_at: new Date().toISOString()
    };
    items[index] = updated;
    return { item: updated };
  }

  return requestJsonWithBody<MappingTaskMutationResponse>(`/api/mapping-tasks/${taskId}/active`, 'PATCH', { isActive });
}

export async function runMappingTaskSync(taskId: string): Promise<{ jobs: QueueJob[] }> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return {
      jobs: [
        { ...mockJob, id: `${taskId}-scan`, kind: 'scan', mappingTaskId: taskId },
        { ...mockJob, id: `${taskId}-rename`, kind: 'rename_detect', mappingTaskId: taskId },
        { ...mockJob, id: `${taskId}-sync`, kind: 'sync', mappingTaskId: taskId }
      ]
    };
  }

  return requestJsonWithBody<{ jobs: QueueJob[] }>(`/api/mapping-tasks/${taskId}/run-sync`, 'POST');
}

export async function deleteMappingTask(taskId: string): Promise<MappingTaskDeleteResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const items = getMockMappingTaskStore();
    const index = items.findIndex((item) => item.id === taskId);
    if (index === -1) {
      throw new Error(`Mock mapping task not found: ${taskId}`);
    }
    const [deleted] = items.splice(index, 1);
    return {
      item: deleted,
      deleted: true,
      hardDelete: false
    };
  }

  return requestJsonWithBody<MappingTaskDeleteResponse>(`/api/mapping-tasks/${taskId}`, 'DELETE');
}

export async function fetchCloudRemotes(): Promise<RemotesListResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return mockRemotes;
  }
  return requestJson<RemotesListResponse>('/api/remotes');
}

export async function listRcloneRemoteOptions(): Promise<RcloneRemoteOptionsResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return {
      items: ['driveA', 'driveB', 'driveC'].map((remoteName) => {
        const bound = mockRemotes.items.find((item: RemotesListResponse['items'][number]) => item.remoteName === remoteName);
        return bound
          ? { remoteName, available: false, boundRemoteId: bound.id, boundDisplayName: bound.displayName }
          : { remoteName, available: true };
      })
    };
  }

  return requestJson<RcloneRemoteOptionsResponse>('/api/remotes/rclone-options');
}

export async function createCloudRemote(payload: CreateRemotePayload): Promise<CreateRemoteResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const totalCapacityBytes = payload.totalCapacity ?? '0';
    const item: RemotesListResponse['items'][number] = {
      id: String(Date.now()),
      remoteName: payload.remoteName,
      displayName: payload.displayName,
      remoteRootPath: payload.remoteRootPath ?? '',
      isActive: true,
      cloudTrashEnabled: payload.cloudTrashEnabled ?? false,
      cloudTrashBasePath: payload.cloudTrashBasePath ?? '.everdrive-trash',
      healthStatus: 'healthy',
      lastCheckedAt: new Date().toISOString(),
      lastAlertAt: null,
      capacity: {
        totalCapacityBytes,
        usedCapacityBytes: '0',
        reservedCapacityBytes: payload.reservedCapacity ?? '0',
        remainingCapacityBytes: totalCapacityBytes,
        usagePercent: 0,
        warningThresholdPercent: payload.warningThresholdPercent ?? 85,
        alert: false,
        realUsageAvailable: false
      },
      mappedDirectories: [],
      lastSyncAt: null,
      updatedAt: new Date().toISOString()
    };
    mockRemotes.items.unshift(item);
    return { item };
  }

  return requestJsonWithBody<CreateRemoteResponse>('/api/remotes', 'POST', payload);
}

export async function deleteCloudRemote(remoteId: string): Promise<DeleteRemoteResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    mockRemotes.items = mockRemotes.items.filter((item: RemotesListResponse['items'][number]) => item.id !== remoteId);
    return { deleted: true };
  }

  return requestJsonWithBody<DeleteRemoteResponse>(`/api/remotes/${remoteId}`, 'DELETE');
}

export async function updateRemoteCapacity(
  remoteId: string,
  payload: UpdateRemoteCapacityPayload
): Promise<UpdateRemoteCapacityResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const index = mockRemotes.items.findIndex((item: RemotesListResponse['items'][number]) => item.id === remoteId);
    if (index === -1) {
      throw new Error(`Mock remote not found: ${remoteId}`);
    }

    const current = mockRemotes.items[index];
    const totalCapacityBytes = payload.totalCapacity ?? current.capacity.totalCapacityBytes;
    const reservedCapacityBytes = payload.reservedCapacity ?? current.capacity.reservedCapacityBytes;
    const usedCapacityBytes = current.capacity.usedCapacityBytes;
    const remainingCapacityBytes = Math.max(
      0,
      Number(totalCapacityBytes) - Number(reservedCapacityBytes) - Number(usedCapacityBytes)
    ).toString();
    const usagePercent = Number(totalCapacityBytes) > 0 ? (Number(usedCapacityBytes) / Number(totalCapacityBytes)) * 100 : 0;

    const updated = {
      ...current,
      capacity: {
        ...current.capacity,
        totalCapacityBytes,
        reservedCapacityBytes,
        remainingCapacityBytes,
        usagePercent,
        warningThresholdPercent: payload.warningThresholdPercent ?? current.capacity.warningThresholdPercent
      }
    };
    mockRemotes.items[index] = updated;
    return { item: updated };
  }

  return requestJsonWithBody<UpdateRemoteCapacityResponse>(`/api/remotes/${remoteId}/capacity`, 'PATCH', payload);
}

export async function updateRemoteSettings(
  remoteId: string,
  payload: UpdateRemoteSettingsPayload
): Promise<UpdateRemoteSettingsResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    const index = mockRemotes.items.findIndex((item: RemotesListResponse['items'][number]) => item.id === remoteId);
    if (index === -1) {
      throw new Error(`Mock remote not found: ${remoteId}`);
    }

    const current = mockRemotes.items[index];
    const totalCapacityBytes = payload.totalCapacity ?? current.capacity.totalCapacityBytes;
    const reservedCapacityBytes = payload.reservedCapacity ?? current.capacity.reservedCapacityBytes;
    const usedCapacityBytes = current.capacity.usedCapacityBytes;
    const remainingCapacityBytes = Math.max(
      0,
      Number(totalCapacityBytes) - Number(reservedCapacityBytes) - Number(usedCapacityBytes)
    ).toString();
    const usagePercent = Number(totalCapacityBytes) > 0 ? (Number(usedCapacityBytes) / Number(totalCapacityBytes)) * 100 : 0;

    const updated = {
      ...current,
      cloudTrashEnabled: payload.cloudTrashEnabled ?? current.cloudTrashEnabled,
      cloudTrashBasePath: payload.cloudTrashBasePath ?? current.cloudTrashBasePath,
      capacity: {
        ...current.capacity,
        totalCapacityBytes,
        reservedCapacityBytes,
        remainingCapacityBytes,
        usagePercent,
        warningThresholdPercent: payload.warningThresholdPercent ?? current.capacity.warningThresholdPercent
      }
    };
    mockRemotes.items[index] = updated;
    return { item: updated };
  }

  return requestJsonWithBody<UpdateRemoteSettingsResponse>(`/api/remotes/${remoteId}`, 'PATCH', payload);
}

export async function browseLocalDirectories(targetPath?: string): Promise<LocalPathBrowseResponse> {
  const query = targetPath ? `?path=${encodeURIComponent(targetPath)}` : '';

  if (getApiMode() === 'mock') {
    await sleep(120);
    const currentPath = targetPath ?? '/data';
    return {
      currentPath,
      parentPath: currentPath === '/data' ? null : '/data',
      roots: ['/data'],
      items: [
        { name: 'photos', path: '/data/photos', isDirectory: true },
        { name: 'videos', path: '/data/videos', isDirectory: true },
        { name: 'archive', path: '/data/archive', isDirectory: true }
      ]
    };
  }

  return requestJson<LocalPathBrowseResponse>(`/api/local-paths${query}`);
}

export async function fetchJob(jobId: string): Promise<QueueJob> {
  if (getApiMode() === 'mock') {
    await sleep(100);
    return { ...mockJob, id: jobId };
  }
  const response = await requestJson<{ job: QueueJob }>(`/api/jobs/${jobId}`);
  return response.job;
}

export async function fetchSettings(): Promise<SettingsResponse> {
  if (getApiMode() === 'mock') {
    await sleep(100);
    return mockSettings;
  }
  return requestJson<SettingsResponse>('/api/settings');
}

export async function updateSettings(payload: UpdateSettingsPayload): Promise<SettingsResponse> {
  if (getApiMode() === 'mock') {
    await sleep(150);
    return {
      ...mockSettings,
      item: {
        ...mockSettings.item,
        hotUpdate: {
          hotUpdatedKeys: ['logLevel'],
          restartRequiredKeys: ['defaultScanIntervalSeconds'],
          notes: ['模拟模式：当前返回的是前端模拟更新结果。']
        }
      }
    };
  }

  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await buildApiErrorMessage(response, '/api/settings'));
  }
  return (await response.json()) as SettingsResponse;
}

export async function listRcloneProviders(): Promise<{ providers: import('./types.js').RcloneProvider[] }> {
  return requestJson('/api/rclone-config/providers');
}
export async function listRcloneConfigRemotes(): Promise<{ items: import('./types.js').RcloneConfigRemoteSummary[] }> {
  return requestJson('/api/rclone-config/remotes');
}
export async function getRcloneRemote(name: string): Promise<{ item: import('./types.js').RcloneConfigRemote }> {
  return requestJson(`/api/rclone-config/remotes/${encodeURIComponent(name)}`);
}
export async function createRcloneRemote(payload: import('./types.js').RcloneConfigMutationPayload): Promise<{ item: import('./types.js').RcloneConfigRemote }> {
  return requestJsonWithBody('/api/rclone-config/remotes', 'POST', payload);
}
export async function updateRcloneRemote(name: string, parameters: Record<string, import('./types.js').RcloneConfigValue>): Promise<{ item: import('./types.js').RcloneConfigRemote }> {
  return requestJsonWithBody(`/api/rclone-config/remotes/${encodeURIComponent(name)}`, 'PATCH', { parameters });
}
export async function deleteRcloneRemote(name: string): Promise<{ deleted: true }> {
  return requestJsonWithBody(`/api/rclone-config/remotes/${encodeURIComponent(name)}`, 'DELETE');
}
export async function updateRcloneRemoteWebUrl(name: string, webUrl: string | null): Promise<{ webUrl: string | null }> { return requestJsonWithBody(`/api/rclone-config/remotes/${encodeURIComponent(name)}/metadata`, 'PATCH', { webUrl }); }
export async function runRcloneConfigFlow(payload: import('./types.js').RcloneConfigFlowPayload): Promise<{ item: Record<string, unknown> }> { return requestJsonWithBody('/api/rclone-config/flow', 'POST', payload); }
export async function testRcloneRemote(name: string): Promise<{ online: boolean; error?: string }> {
  return requestJsonWithBody(`/api/rclone-config/remotes/${encodeURIComponent(name)}/test`, 'POST');
}

export async function startCloudMigration(taskId: string, payload: import('./types.js').MigrationPayload): Promise<{ job: QueueJob }> {
  return requestJsonWithBody(`/api/mapping-tasks/${encodeURIComponent(taskId)}/migration`, 'POST', payload);
}
export async function fetchRedundancyOverview(taskId: string): Promise<{ item: import('./types.js').RedundancyOverview }> {
  return requestJson(`/api/mapping-tasks/${encodeURIComponent(taskId)}/redundancy`);
}
export async function retryFailedReplicas(taskId: string): Promise<{ summary: { mappingTaskId: string; retriedFiles: number; syncedRemotes: number; failedRemotes: number } }> {
  return requestJsonWithBody(`/api/mapping-tasks/${encodeURIComponent(taskId)}/redundancy/retry-failed`, 'POST');
}
export async function fetchAuditLogs(query: import('./types.js').AuditLogQuery = {}): Promise<{ items: import('./types.js').AuditLogItem[] }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return requestJson(`/api/audit/logs${suffix}`);
}
export async function fetchMetricsOverview(): Promise<{ metrics: import('./types.js').MetricsOverview }> {
  return requestJson('/api/metrics/overview');
}

export async function listRcloneSources(): Promise<{ items: import('./types.js').RcloneSourceOption[] }> { return requestJson('/api/sources/rclone'); }
export async function browseRcloneSource(name: string, path = ''): Promise<{ items: import('./types.js').RcloneSourceBrowseItem[] }> { const query=path?`?path=${encodeURIComponent(path)}`:''; return requestJson(`/api/sources/rclone/${encodeURIComponent(name)}/browse${query}`); }
export async function testRcloneSource(name: string, path = ''): Promise<{ online: true }> { return requestJsonWithBody(`/api/sources/rclone/${encodeURIComponent(name)}/test`,'POST',{path}); }

export async function listEncryptionRecoveryTasks(): Promise<{ items: import('./types.js').EncryptionRecoveryTask[] }> {
  return requestJson('/api/encryption-recovery/tasks');
}
export async function listEncryptionRecoveryFiles(taskId: string, query = ''): Promise<{ items: import('./types.js').EncryptionRecoveryFile[] }> {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : '';
  return requestJson(`/api/encryption-recovery/tasks/${encodeURIComponent(taskId)}/files${suffix}`);
}
export function encryptionRecoveryDownloadUrl(fileId: string, remoteId: string): string {
  return `/api/encryption-recovery/files/${encodeURIComponent(fileId)}/download?remoteId=${encodeURIComponent(remoteId)}`;
}

export async function listDataRecoveryTasks():Promise<{items:import('./types.js').DataRecoveryTask[]}>{return requestJson('/api/data-recovery/tasks');}
export async function listDataRecoveryFiles(taskId:string,query=''):Promise<{items:import('./types.js').DataRecoveryFile[]}>{const suffix=query?`?query=${encodeURIComponent(query)}`:'';return requestJson(`/api/data-recovery/tasks/${encodeURIComponent(taskId)}/files${suffix}`);}
export async function runDataRecovery(taskId:string,payload:{destinationPath:string;query:string;conflictStrategy:'skip'|'overwrite'}):Promise<{summary:import('./types.js').DataRecoverySummary}>{return requestJsonWithBody(`/api/data-recovery/tasks/${encodeURIComponent(taskId)}/restore`,'POST',payload);}

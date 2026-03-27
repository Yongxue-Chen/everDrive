import type {
  ApiMode,
  CreateMappingTaskPayload,
  CloudViewResponse,
  LocalPathBrowseResponse,
  MappingTaskDeleteResponse,
  MappingTaskItem,
  MappingTaskListResponse,
  MappingTaskMutationResponse,
  QueueJob,
  RemotesListResponse,
  SettingsResponse,
  SyncCloudRemotesResponse,
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

export async function syncCloudRemotes(): Promise<SyncCloudRemotesResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return {
      summary: {
        added: mockRemotes.items.map((item: RemotesListResponse['items'][number]) => item.remoteName),
        reactivated: [],
        disabled: []
      }
    };
  }

  return requestJsonWithBody<SyncCloudRemotesResponse>('/api/remotes/sync', 'POST');
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

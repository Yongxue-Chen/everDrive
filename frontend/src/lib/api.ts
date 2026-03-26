import type {
  ApiMode,
  CloudViewResponse,
  MappingTaskListResponse,
  QueueJob,
  RemotesListResponse,
  SettingsResponse,
  UpdateSettingsPayload,
  WorkspaceViewResponse
} from './types';
import { mockCloudView, mockJob, mockMappingTasks, mockRemotes, mockSettings, mockWorkspaceView } from './mock-data';

const API_MODE_KEY = 'everdrive_api_mode';
const DEFAULT_MODE = import.meta.env.VITE_DEFAULT_API_MODE === 'live' ? 'live' : 'mock';

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
    throw new Error(`HTTP ${response.status} - ${path}`);
  }
  return (await response.json()) as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    return mockMappingTasks;
  }
  return requestJson<MappingTaskListResponse>('/api/mapping-tasks');
}

export async function fetchCloudRemotes(): Promise<RemotesListResponse> {
  if (getApiMode() === 'mock') {
    await sleep(120);
    return mockRemotes;
  }
  return requestJson<RemotesListResponse>('/api/remotes');
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
          notes: ['Mock mode: simulated update result.']
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
    throw new Error(`HTTP ${response.status} - /api/settings`);
  }
  return (await response.json()) as SettingsResponse;
}

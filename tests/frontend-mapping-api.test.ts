import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMappingTask,
  deleteMappingTask,
  fetchMappingTasks,
  setApiMode,
  setMappingTaskActive,
  updateMappingTask
} from '../frontend/src/lib/api.js';

type StorageMap = Record<string, string>;

function createStorage() {
  const store: StorageMap = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const key of Object.keys(store)) {
        delete store[key];
      }
    })
  };
}

describe('frontend mapping api', () => {
  beforeEach(() => {
    const localStorage = createStorage();
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates mapping tasks in mock mode and returns them in subsequent list calls', async () => {
    setApiMode('mock');

    const created = await createMappingTask({
      name: '媒体库',
      localPath: '/data/media',
      syncMode: 'archive',
      encryptionEnabled: false,
      redundancyEnabled: false,
      splitEnabled: false,
      remoteBindings: [{ remoteId: '11', priority: 100, remoteBasePath: 'team/media' }]
    });

    const list = await fetchMappingTasks();

    expect(created.item.name).toBe('媒体库');
    expect(list.items.some((item: (typeof list.items)[number]) => item.id === created.item.id)).toBe(true);
    expect(list.items.find((item: (typeof list.items)[number]) => item.id === created.item.id)?.remotes[0]?.remoteBasePath).toBe('team/media');
  });

  it('updates mapping tasks in mock mode', async () => {
    setApiMode('mock');
    const existing = await fetchMappingTasks();
    const first = existing.items[0];

    const updated = await updateMappingTask(first.id, {
      name: '已更新映射',
      remoteBindings: [{ remoteId: first.remotes[0].remoteId, priority: 300, remoteBasePath: 'archive/2026' }]
    });

    expect(updated.item.name).toBe('已更新映射');
    expect(updated.item.remotes[0]?.priority).toBe(300);
    expect(updated.item.remotes[0]?.remoteBasePath).toBe('archive/2026');
  });

  it('toggles mapping task active status in mock mode', async () => {
    setApiMode('mock');
    const existing = await fetchMappingTasks();
    const first = existing.items[0];

    const updated = await setMappingTaskActive(first.id, false);

    expect(updated.item.status).toBe('inactive');
  });

  it('deletes mapping tasks in mock mode', async () => {
    setApiMode('mock');
    const existing = await fetchMappingTasks();
    const first = existing.items[0];

    await deleteMappingTask(first.id);
    const afterDelete = await fetchMappingTasks();

    expect(afterDelete.items.some((item: (typeof afterDelete.items)[number]) => item.id === first.id)).toBe(false);
  });

  it('calls live backend endpoints for mapping writes', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: '9', name: '后端映射' } })
    } as Response);

    await createMappingTask({
      name: '后端映射',
      localPath: '/data/live',
      syncMode: 'mirror',
      encryptionEnabled: true,
      redundancyEnabled: false,
      splitEnabled: false,
      remoteBindings: [{ remoteId: '11', priority: 100, remoteBasePath: '' }]
    });

    await updateMappingTask('9', { name: '后端映射-更新' });
    await setMappingTaskActive('9', true);
    await deleteMappingTask('9');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/mapping-tasks',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/mapping-tasks/9',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/mapping-tasks/9/active',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      '/api/mapping-tasks/9',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('surfaces backend error messages for live mapping creation', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          code: 'BAD_REQUEST',
          message: 'remoteIds cannot contain duplicates'
        }
      })
    } as Response);

    await expect(
      createMappingTask({
        name: '重复绑定',
        localPath: '/data/live',
        syncMode: 'mirror',
        encryptionEnabled: false,
        redundancyEnabled: false,
        splitEnabled: false,
        remoteBindings: [
          { remoteId: '11', priority: 100, remoteBasePath: '' },
          { remoteId: '11', priority: 200, remoteBasePath: '' }
        ]
      })
    ).rejects.toThrow('remoteIds cannot contain duplicates');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApiMode, setApiMode, syncCloudRemotes, updateRemoteCapacity, updateRemoteSettings } from '../frontend/src/lib/api.js';

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

describe('frontend remote api', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('syncs remotes through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ summary: { added: ['mymega'], reactivated: [], disabled: [] } })
    } as Response);

    const result = await syncCloudRemotes();

    expect(getApiMode()).toBe('live');
    expect(result.summary.added).toEqual(['mymega']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remotes/sync',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates remote capacity through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: '11',
          remoteName: 'mymega',
          displayName: 'mymega',
          remoteRootPath: '',
          isActive: true,
          healthStatus: 'healthy',
          capacity: {
            totalCapacityBytes: '1000',
            usedCapacityBytes: '100',
            reservedCapacityBytes: '10',
            remainingCapacityBytes: '890',
            usagePercent: 10,
            warningThresholdPercent: 85,
            alert: false
          },
          mappedDirectories: [],
          lastSyncAt: null,
          updatedAt: '2026-03-27T14:00:00.000Z'
        }
      })
    } as Response);

    const result = await updateRemoteCapacity('11', {
      totalCapacity: '1000',
      reservedCapacity: '10',
      warningThresholdPercent: 85
    });

    expect(result.item.capacity.totalCapacityBytes).toBe('1000');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remotes/11/capacity',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('updates remote cloud trash settings through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: '11',
          remoteName: 'mymega',
          displayName: 'mymega',
          remoteRootPath: 'container-a',
          isActive: true,
          cloudTrashEnabled: true,
          cloudTrashBasePath: 'trash-a',
          healthStatus: 'healthy',
          capacity: {
            totalCapacityBytes: '1000',
            usedCapacityBytes: '100',
            reservedCapacityBytes: '10',
            remainingCapacityBytes: '890',
            usagePercent: 10,
            warningThresholdPercent: 85,
            alert: false
          },
          mappedDirectories: [],
          lastSyncAt: null,
          updatedAt: '2026-03-27T14:00:00.000Z'
        }
      })
    } as Response);

    const result = await updateRemoteSettings('11', {
      cloudTrashEnabled: true,
      cloudTrashBasePath: 'trash-a',
      remoteRootPath: 'container-a'
    });

    expect(result.item.cloudTrashEnabled).toBe(true);
    expect(result.item.remoteRootPath).toBe('container-a');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remotes/11',
      expect.objectContaining({ method: 'PATCH' })
    );
  });
});

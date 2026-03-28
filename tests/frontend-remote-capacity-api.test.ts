import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCloudRemote,
  deleteCloudRemote,
  getApiMode,
  listRcloneRemoteOptions,
  setApiMode,
  updateRemoteCapacity,
  updateRemoteSettings
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

describe('frontend remote api', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('creates a business remote through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          id: '11',
          remoteName: 'driveA',
          displayName: '相册盘',
          remoteRootPath: '',
          isActive: true,
          cloudTrashEnabled: false,
          cloudTrashBasePath: '.everdrive-trash',
          healthStatus: 'healthy',
          capacity: {
            totalCapacityBytes: '1000',
            usedCapacityBytes: '0',
            reservedCapacityBytes: '0',
            remainingCapacityBytes: '1000',
            usagePercent: 0,
            warningThresholdPercent: 85,
            alert: false,
            realUsageAvailable: false
          },
          mappedDirectories: [],
          lastSyncAt: null,
          updatedAt: '2026-03-27T14:00:00.000Z'
        }
      })
    } as Response);

    const result = await createCloudRemote({
      displayName: '相册盘',
      remoteName: 'driveA',
      totalCapacity: '1000'
    });

    expect(getApiMode()).toBe('live');
    expect(result.item.displayName).toBe('相册盘');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remotes',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('loads rclone remote options through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { remoteName: 'driveA', available: true },
          { remoteName: 'driveB', available: false, boundRemoteId: '11', boundDisplayName: '相册盘' }
        ]
      })
    } as Response);

    const result = await listRcloneRemoteOptions();

    expect(result.items[1]?.boundDisplayName).toBe('相册盘');
    expect(fetchMock).toHaveBeenCalledWith('/api/remotes/rclone-options');
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

  it('deletes a business remote through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ deleted: true })
    } as Response);

    const result = await deleteCloudRemote('11');

    expect(result.deleted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/remotes/11',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});

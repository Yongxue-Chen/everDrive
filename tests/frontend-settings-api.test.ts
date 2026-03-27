import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setApiMode, updateSettings } from '../frontend/src/lib/api.js';

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

describe('frontend settings api', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn()
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('updates cloud trash cleanup settings through the live backend endpoint', async () => {
    setApiMode('live');
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          values: {
            rcloneRcd: {
              url: 'http://127.0.0.1:5572',
              user: 'admin',
              passMasked: 'se*****et',
              hasPassword: true,
              timeoutMs: 5000,
              retryAttempts: 2,
              retryDelayMs: 250
            },
            defaultScanIntervalSeconds: 30,
            defaultConcurrency: {
              sync: 4,
              rclone: 4,
              jobLong: 2,
              jobShort: 1,
              jobRemoteLimit: 1
            },
            defaultCapacityWarningThresholdPercent: 85,
            hashAlgorithm: 'sha1',
            logLevel: 'info',
            syncProfile: {
              transfers: 1,
              checkers: 1,
              bufferSizeMiB: 8,
              tpsLimit: 2,
              bwLimitMiB: 4
            },
            cloudTrash: {
              enabled: true,
              retentionDays: 14,
              cleanupIntervalHours: 6,
              basePath: '.everdrive-trash',
              maxDeleteBatchPerRun: 500
            }
          },
          hotUpdate: {
            hotUpdatedKeys: [],
            restartRequiredKeys: ['cloudTrash.cleanupIntervalHours'],
            notes: []
          }
        }
      })
    } as Response);

    const result = await updateSettings({
      defaultScanIntervalSeconds: 300,
      syncProfile: {
        transfers: 1,
        checkers: 1,
        bufferSizeMiB: 8,
        tpsLimit: 2,
        bwLimitMiB: 4
      },
      cloudTrash: {
        retentionDays: 14,
        cleanupIntervalHours: 6,
        maxDeleteBatchPerRun: 500
      }
    });

    expect(result.item.values.cloudTrash.cleanupIntervalHours).toBe(6);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          defaultScanIntervalSeconds: 300,
          syncProfile: {
            transfers: 1,
            checkers: 1,
            bufferSizeMiB: 8,
            tpsLimit: 2,
            bwLimitMiB: 4
          },
          cloudTrash: {
            retentionDays: 14,
            cleanupIntervalHours: 6,
            maxDeleteBatchPerRun: 500
          }
        })
      })
    );
  });
});

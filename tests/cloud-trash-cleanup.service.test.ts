import { describe, expect, it, vi } from 'vitest';
import type { CloudTrashSettings } from '../src/modules/settings/settings.dto.js';
import {
  CloudTrashCleanupService,
  type CloudTrashCleanupRemoteClient,
  type CloudTrashRemoteRef
} from '../src/modules/cloud-trash/cloud-trash-cleanup.service.js';

function cloudTrashSettings(overrides: Partial<CloudTrashSettings> = {}): CloudTrashSettings {
  return {
    enabled: true,
    retentionDays: 30,
    cleanupIntervalHours: 24,
    basePath: '.everdrive-trash',
    maxDeleteBatchPerRun: 1000,
    ...overrides
  };
}

describe('CloudTrashCleanupService', () => {
  it('uses each remote cloud trash base path and ignores remotes with trash disabled', async () => {
    const remoteClient: CloudTrashCleanupRemoteClient = {
      list: vi.fn(async () => [{ Path: '2026/02/20/101/report.txt', Name: 'report.txt', IsDir: false }]),
      purge: vi.fn(async () => undefined)
    };

    const service = new CloudTrashCleanupService({
      settingsService: {
        getCurrentConfig: () => ({
          cloudTrash: cloudTrashSettings({ enabled: false, maxDeleteBatchPerRun: 10 })
        })
      } as any,
      listActiveRemotes: async () => [
        { id: 1n, remoteName: 'alpha', cloudTrashEnabled: true, cloudTrashBasePath: 'trash-a' },
        { id: 2n, remoteName: 'beta', cloudTrashEnabled: false, cloudTrashBasePath: 'trash-b' }
      ],
      remoteClient,
      now: () => new Date('2026-03-27T12:00:00.000Z')
    });

    const summary = await service.runCleanup();

    expect(remoteClient.list).toHaveBeenCalledTimes(1);
    expect(remoteClient.list).toHaveBeenCalledWith({
      fs: 'alpha:',
      remote: 'trash-a'
    });
    expect(remoteClient.purge).toHaveBeenCalledWith({
      fs: 'alpha:',
      remote: 'trash-a/2026/02/20'
    });
    expect(summary.scannedRemotes).toBe(1);
  });

  it('purges expired trash day directories, skips malformed paths, and deduplicates nested entries', async () => {
    const activeRemotes: CloudTrashRemoteRef[] = [
      { id: 1n, remoteName: 'alpha', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' }
    ];
    const remoteClient: CloudTrashCleanupRemoteClient = {
      list: vi.fn(async () => [
        { Path: '2026/02/20/101/report.txt', Name: 'report.txt', IsDir: false },
        { Path: '2026/02/20/101/subdir/photo.jpg', Name: 'photo.jpg', IsDir: false },
        { Path: '2026/02/21', Name: '21', IsDir: true },
        { Path: '2026/03/10/101/recent.txt', Name: 'recent.txt', IsDir: false },
        { Path: 'oops/not-a-date.txt', Name: 'not-a-date.txt', IsDir: false },
        { Path: '2026/13/01/101/bad-month.txt', Name: 'bad-month.txt', IsDir: false }
      ]),
      purge: vi.fn(async () => undefined)
    };

    const service = new CloudTrashCleanupService({
      settingsService: {
        getCurrentConfig: () => ({
          cloudTrash: cloudTrashSettings({ maxDeleteBatchPerRun: 10 })
        })
      } as any,
      listActiveRemotes: async () => activeRemotes,
      remoteClient,
      now: () => new Date('2026-03-27T12:00:00.000Z')
    });

    const summary = await service.runCleanup();

    expect(remoteClient.list).toHaveBeenCalledWith({
      fs: 'alpha:',
      remote: '.everdrive-trash'
    });
    expect(remoteClient.purge).toHaveBeenCalledTimes(2);
    expect(remoteClient.purge).toHaveBeenNthCalledWith(1, {
      fs: 'alpha:',
      remote: '.everdrive-trash/2026/02/20'
    });
    expect(remoteClient.purge).toHaveBeenNthCalledWith(2, {
      fs: 'alpha:',
      remote: '.everdrive-trash/2026/02/21'
    });
    expect(summary).toEqual({
      scannedRemotes: 1,
      expiredEntriesFound: 2,
      deletedEntries: 2,
      skippedMalformedPaths: 2,
      remoteFailures: 0,
      deleteFailures: 0,
      failureSamples: []
    });
  });

  it('stops deleting when maxDeleteBatchPerRun is reached', async () => {
    const remoteClient: CloudTrashCleanupRemoteClient = {
      list: vi.fn(async () => [
        { Path: '2026/01/01/1/a.txt', Name: 'a.txt', IsDir: false },
        { Path: '2026/01/02/1/b.txt', Name: 'b.txt', IsDir: false },
        { Path: '2026/01/03/1/c.txt', Name: 'c.txt', IsDir: false }
      ]),
      purge: vi.fn(async () => undefined)
    };

    const service = new CloudTrashCleanupService({
      settingsService: {
        getCurrentConfig: () => ({
          cloudTrash: cloudTrashSettings({ maxDeleteBatchPerRun: 2 })
        })
      } as any,
      listActiveRemotes: async () => [{ id: 1n, remoteName: 'alpha', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' }],
      remoteClient,
      now: () => new Date('2026-03-27T12:00:00.000Z')
    });

    const summary = await service.runCleanup();

    expect(remoteClient.purge).toHaveBeenCalledTimes(2);
    expect(remoteClient.purge).toHaveBeenNthCalledWith(1, {
      fs: 'alpha:',
      remote: '.everdrive-trash/2026/01/01'
    });
    expect(remoteClient.purge).toHaveBeenNthCalledWith(2, {
      fs: 'alpha:',
      remote: '.everdrive-trash/2026/01/02'
    });
    expect(summary).toEqual({
      scannedRemotes: 1,
      expiredEntriesFound: 3,
      deletedEntries: 2,
      skippedMalformedPaths: 0,
      remoteFailures: 0,
      deleteFailures: 0,
      failureSamples: []
    });
  });

  it('continues cleanup when one remote list fails and a later purge fails', async () => {
    const activeRemotes: CloudTrashRemoteRef[] = [
      { id: 1n, remoteName: 'alpha', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' },
      { id: 2n, remoteName: 'beta', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' },
      { id: 3n, remoteName: 'gamma', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' }
    ];
    const remoteClient: CloudTrashCleanupRemoteClient = {
      list: vi.fn(async ({ fs }) => {
        if (fs === 'alpha:') {
          throw new Error('list exploded');
        }
        if (fs === 'beta:') {
          return [{ Path: '2026/02/01/1/old.txt', Name: 'old.txt', IsDir: false }];
        }
        return [{ Path: '2026/02/02/1/older.txt', Name: 'older.txt', IsDir: false }];
      }),
      purge: vi.fn(async ({ remote }) => {
        if (remote === '.everdrive-trash/2026/02/01') {
          throw new Error('purge exploded');
        }
      })
    };

    const service = new CloudTrashCleanupService({
      settingsService: {
        getCurrentConfig: () => ({
          cloudTrash: cloudTrashSettings({ maxDeleteBatchPerRun: 10 })
        })
      } as any,
      listActiveRemotes: async () => activeRemotes,
      remoteClient,
      now: () => new Date('2026-03-27T12:00:00.000Z')
    });

    const summary = await service.runCleanup();

    expect(remoteClient.list).toHaveBeenCalledTimes(3);
    expect(remoteClient.purge).toHaveBeenCalledTimes(2);
    expect(summary).toEqual({
      scannedRemotes: 3,
      expiredEntriesFound: 2,
      deletedEntries: 1,
      skippedMalformedPaths: 0,
      remoteFailures: 1,
      deleteFailures: 1,
      failureSamples: [
        {
          stage: 'list',
          remoteName: 'alpha',
          message: 'list exploded'
        },
        {
          stage: 'purge',
          remoteName: 'beta',
          path: '2026/02/01',
          message: 'purge exploded'
        }
      ]
    });
  });

  it('treats a missing trash root as empty instead of failing the run', async () => {
    const remoteClient: CloudTrashCleanupRemoteClient = {
      list: vi.fn(async ({ fs }) => {
        if (fs === 'alpha:') {
          throw new Error('directory not found');
        }
        return [{ Path: '2026/02/01/1/old.txt', Name: 'old.txt', IsDir: false }];
      }),
      purge: vi.fn(async () => undefined)
    };

    const service = new CloudTrashCleanupService({
      settingsService: {
        getCurrentConfig: () => ({
          cloudTrash: cloudTrashSettings({ maxDeleteBatchPerRun: 10 })
        })
      } as any,
      listActiveRemotes: async () => [
        { id: 1n, remoteName: 'alpha', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' },
        { id: 2n, remoteName: 'beta', cloudTrashEnabled: true, cloudTrashBasePath: '.everdrive-trash' }
      ],
      remoteClient,
      now: () => new Date('2026-03-27T12:00:00.000Z')
    });

    const summary = await service.runCleanup();

    expect(summary).toEqual({
      scannedRemotes: 2,
      expiredEntriesFound: 1,
      deletedEntries: 1,
      skippedMalformedPaths: 0,
      remoteFailures: 0,
      deleteFailures: 0,
      failureSamples: []
    });
  });
});

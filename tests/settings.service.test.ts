import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import type { Settings } from '../src/modules/settings/settings.dto.js';
import type { SettingsRepository } from '../src/modules/settings/settings.repository.js';
import { SettingsRepository as RealSettingsRepository } from '../src/modules/settings/settings.repository.js';

describe('SettingsService', () => {
  it('masks sensitive fields and applies log level hot update', async () => {
    const initial: Settings = {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        pass: 'secret-pass',
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
      cloudTrash: {
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    };

    const repository: Partial<SettingsRepository> = {
      load: vi.fn(async () => initial),
      save: vi.fn(async () => undefined)
    };

    const service = await SettingsService.create(repository as SettingsRepository);
    const current = service.getCurrent();
    expect(current.values.rcloneRcd.passMasked).not.toBe(initial.rcloneRcd.pass);
    expect(current.values.rcloneRcd.hasPassword).toBe(true);

    const updated = await service.update({ logLevel: 'debug' });
    expect(updated.values.logLevel).toBe('debug');
    expect(updated.hotUpdate.hotUpdatedKeys).toContain('logLevel');
  });

  it('marks restart-required settings', async () => {
    const initial: Settings = {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        pass: 'secret-pass',
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
      cloudTrash: {
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    };

    const repository: Partial<SettingsRepository> = {
      load: vi.fn(async () => initial),
      save: vi.fn(async () => undefined)
    };

    const service = await SettingsService.create(repository as SettingsRepository);
    const updated = await service.update({
      defaultScanIntervalSeconds: 60,
      hashAlgorithm: 'md5'
    });

    expect(updated.hotUpdate.restartRequiredKeys).toContain('defaultScanIntervalSeconds');
    expect(updated.hotUpdate.restartRequiredKeys).toContain('hashAlgorithm');
  });

  it('round-trips cloudTrash settings and exposes raw config', async () => {
    const initial: Settings = {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        pass: 'secret-pass',
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
      cloudTrash: {
        enabled: false,
        retentionDays: 14,
        cleanupIntervalHours: 6,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    };

    const repository: Partial<SettingsRepository> = {
      load: vi.fn(async () => initial),
      save: vi.fn(async () => undefined)
    };

    const service = await SettingsService.create(repository as SettingsRepository);

    const snapshot = service.getCurrentConfig();
    expect(snapshot).toEqual(initial);
    expect(service.getCurrent().values.cloudTrash).toEqual(initial.cloudTrash);

    snapshot.cloudTrash.enabled = true;
    snapshot.defaultConcurrency.sync = 99;
    expect(service.getCurrentConfig()).toEqual(initial);

    const updated = await service.update({
      cloudTrash: {
        enabled: true,
        retentionDays: 21
      }
    });

    expect(updated.values.cloudTrash).toEqual({
      enabled: true,
      retentionDays: 21,
      cleanupIntervalHours: 6,
      basePath: '.everdrive-trash',
      maxDeleteBatchPerRun: 1000
    });
    expect(updated.hotUpdate.restartRequiredKeys).toContain('cloudTrash.enabled');
    expect(updated.hotUpdate.restartRequiredKeys).toContain('cloudTrash.retentionDays');
  });

  it('upgrades legacy settings without cloudTrash non-destructively', async () => {
    const legacy = {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        pass: 'secret-pass',
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
      logLevel: 'info'
    } satisfies Omit<Settings, 'cloudTrash'>;

    const repository: Partial<SettingsRepository> = {
      load: vi.fn(async () => legacy as unknown as Settings),
      save: vi.fn(async () => undefined)
    };

    const service = await SettingsService.create(repository as SettingsRepository);

    expect(repository.save).not.toHaveBeenCalled();
    expect(service.getCurrentConfig()).toEqual({
      ...legacy,
      cloudTrash: {
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    });
    expect(service.getCurrent().values.cloudTrash).toEqual({
      enabled: false,
      retentionDays: 30,
      cleanupIntervalHours: 24,
      basePath: '.everdrive-trash',
      maxDeleteBatchPerRun: 1000
    });
  });

  it('loads partial persisted cloudTrash settings and fills missing fields', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'everdrive-settings-'));
    const filePath = path.join(tempDir, 'settings.json');
    const persisted = {
      rcloneRcd: {
        url: 'http://127.0.0.1:5572',
        user: 'admin',
        pass: 'secret-pass',
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
      cloudTrash: {
        enabled: true
      }
    };

    await writeFile(filePath, JSON.stringify(persisted, null, 2), 'utf8');

    try {
      const service = await SettingsService.create(new RealSettingsRepository(filePath));
      expect(service.getCurrentConfig().cloudTrash).toEqual({
        enabled: true,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      });
      expect(service.getCurrent().values.cloudTrash).toEqual({
        enabled: true,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { SettingsService } from '../src/modules/settings/settings.service.js';
import type { Settings } from '../src/modules/settings/settings.dto.js';
import type { SettingsRepository } from '../src/modules/settings/settings.repository.js';

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
      logLevel: 'info'
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
      logLevel: 'info'
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
});

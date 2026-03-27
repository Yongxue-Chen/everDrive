import { rawLogger } from '../../lib/logger.js';
import { getEnv } from '../../config/env.js';
import type { UpdateSettingsInput, Settings, SettingsView } from './settings.dto.js';
import { SettingsRepository } from './settings.repository.js';

type CompleteSettings = Omit<Settings, 'cloudTrash'> & {
  cloudTrash: NonNullable<Settings['cloudTrash']>;
};

function maskSecret(value: string): string {
  if (!value) {
    return '';
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
}

function cloneSettings(settings: CompleteSettings): CompleteSettings {
  return {
    ...settings,
    rcloneRcd: {
      ...settings.rcloneRcd
    },
    defaultConcurrency: {
      ...settings.defaultConcurrency
    },
    cloudTrash: {
      ...settings.cloudTrash
    }
  };
}

function normalizeSettings(defaults: CompleteSettings, loaded: Settings): CompleteSettings {
  return {
    ...defaults,
    ...loaded,
    rcloneRcd: {
      ...defaults.rcloneRcd,
      ...loaded.rcloneRcd
    },
    defaultConcurrency: {
      ...defaults.defaultConcurrency,
      ...loaded.defaultConcurrency
    },
    cloudTrash: {
      ...defaults.cloudTrash,
      ...(loaded.cloudTrash ?? {})
    }
  };
}

export class SettingsService {
  private settings: CompleteSettings;

  private constructor(initialSettings: CompleteSettings, private readonly repository: SettingsRepository) {
    this.settings = initialSettings;
  }

  static async create(repository = new SettingsRepository()): Promise<SettingsService> {
    const env = getEnv();
    const defaults: Settings = {
      rcloneRcd: {
        url: env.RCLONE_RCD_URL,
        user: env.RCLONE_RCD_USER,
        pass: env.RCLONE_RCD_PASS,
        timeoutMs: env.RCLONE_HTTP_TIMEOUT_MS,
        retryAttempts: env.RCLONE_RETRY_ATTEMPTS,
        retryDelayMs: env.RCLONE_RETRY_DELAY_MS
      },
      defaultScanIntervalSeconds: env.SCAN_INTERVAL_SECONDS,
      defaultConcurrency: {
        sync: env.SYNC_CONCURRENCY,
        rclone: env.RCLONE_CONCURRENCY,
        jobLong: env.JOB_WORKER_CONCURRENCY,
        jobShort: env.JOB_SHORT_WORKER_CONCURRENCY,
        jobRemoteLimit: env.JOB_REMOTE_CONCURRENCY_LIMIT
      },
      defaultCapacityWarningThresholdPercent: 85,
      hashAlgorithm: 'sha1',
      logLevel: env.LOG_LEVEL,
      cloudTrash: {
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }
    };

    const loaded = await repository.load(defaults);
    const normalized = normalizeSettings(defaults, loaded);
    rawLogger.level = normalized.logLevel;
    return new SettingsService(normalized, repository);
  }

  getCurrent(): SettingsView {
    return this.toView(this.settings, {
      hotUpdatedKeys: [],
      restartRequiredKeys: [],
      notes: []
    });
  }

  getCurrentConfig(): Settings {
    return cloneSettings(this.settings);
  }

  async update(input: UpdateSettingsInput): Promise<SettingsView> {
    const merged: CompleteSettings = {
      ...this.settings,
      ...input,
      rcloneRcd: {
        ...this.settings.rcloneRcd,
        ...input.rcloneRcd
      },
      defaultConcurrency: {
        ...this.settings.defaultConcurrency,
        ...input.defaultConcurrency
      },
      cloudTrash: {
        ...this.settings.cloudTrash,
        ...(input.cloudTrash ?? {})
      }
    };

    const hotUpdatedKeys: string[] = [];
    const restartRequiredKeys: string[] = [];
    const notes: string[] = [];

    if (merged.logLevel !== this.settings.logLevel) {
      rawLogger.level = merged.logLevel;
      hotUpdatedKeys.push('logLevel');
      notes.push('logLevel applied immediately.');
    }

    const restartCandidates: Array<[boolean, string]> = [
      [merged.rcloneRcd.url !== this.settings.rcloneRcd.url, 'rcloneRcd.url'],
      [merged.rcloneRcd.user !== this.settings.rcloneRcd.user, 'rcloneRcd.user'],
      [merged.rcloneRcd.pass !== this.settings.rcloneRcd.pass, 'rcloneRcd.pass'],
      [merged.rcloneRcd.timeoutMs !== this.settings.rcloneRcd.timeoutMs, 'rcloneRcd.timeoutMs'],
      [merged.rcloneRcd.retryAttempts !== this.settings.rcloneRcd.retryAttempts, 'rcloneRcd.retryAttempts'],
      [merged.rcloneRcd.retryDelayMs !== this.settings.rcloneRcd.retryDelayMs, 'rcloneRcd.retryDelayMs'],
      [merged.defaultScanIntervalSeconds !== this.settings.defaultScanIntervalSeconds, 'defaultScanIntervalSeconds'],
      [merged.defaultConcurrency.sync !== this.settings.defaultConcurrency.sync, 'defaultConcurrency.sync'],
      [merged.defaultConcurrency.rclone !== this.settings.defaultConcurrency.rclone, 'defaultConcurrency.rclone'],
      [merged.defaultConcurrency.jobLong !== this.settings.defaultConcurrency.jobLong, 'defaultConcurrency.jobLong'],
      [merged.defaultConcurrency.jobShort !== this.settings.defaultConcurrency.jobShort, 'defaultConcurrency.jobShort'],
      [merged.defaultConcurrency.jobRemoteLimit !== this.settings.defaultConcurrency.jobRemoteLimit, 'defaultConcurrency.jobRemoteLimit'],
      [merged.defaultCapacityWarningThresholdPercent !== this.settings.defaultCapacityWarningThresholdPercent, 'defaultCapacityWarningThresholdPercent'],
      [merged.hashAlgorithm !== this.settings.hashAlgorithm, 'hashAlgorithm'],
      [merged.cloudTrash.enabled !== this.settings.cloudTrash.enabled, 'cloudTrash.enabled'],
      [merged.cloudTrash.retentionDays !== this.settings.cloudTrash.retentionDays, 'cloudTrash.retentionDays'],
      [merged.cloudTrash.cleanupIntervalHours !== this.settings.cloudTrash.cleanupIntervalHours, 'cloudTrash.cleanupIntervalHours'],
      [merged.cloudTrash.basePath !== this.settings.cloudTrash.basePath, 'cloudTrash.basePath'],
      [merged.cloudTrash.maxDeleteBatchPerRun !== this.settings.cloudTrash.maxDeleteBatchPerRun, 'cloudTrash.maxDeleteBatchPerRun']
    ];

    for (const [changed, key] of restartCandidates) {
      if (changed) {
        restartRequiredKeys.push(key);
      }
    }

    if (restartRequiredKeys.length > 0) {
      notes.push('Some settings require service restart to take full effect.');
    }

    this.settings = merged;
    await this.repository.save(this.settings);

    return this.toView(this.settings, {
      hotUpdatedKeys,
      restartRequiredKeys,
      notes
    });
  }

  private toView(
    settings: CompleteSettings,
    hotUpdate: {
      hotUpdatedKeys: string[];
      restartRequiredKeys: string[];
      notes: string[];
    }
  ): SettingsView {
    return {
      values: {
        rcloneRcd: {
          url: settings.rcloneRcd.url,
          user: settings.rcloneRcd.user,
          passMasked: maskSecret(settings.rcloneRcd.pass),
          hasPassword: Boolean(settings.rcloneRcd.pass),
          timeoutMs: settings.rcloneRcd.timeoutMs,
          retryAttempts: settings.rcloneRcd.retryAttempts,
          retryDelayMs: settings.rcloneRcd.retryDelayMs
        },
        defaultScanIntervalSeconds: settings.defaultScanIntervalSeconds,
        defaultConcurrency: {
          ...settings.defaultConcurrency
        },
        defaultCapacityWarningThresholdPercent: settings.defaultCapacityWarningThresholdPercent,
        hashAlgorithm: settings.hashAlgorithm,
        logLevel: settings.logLevel,
        cloudTrash: {
          ...settings.cloudTrash
        }
      },
      hotUpdate
    };
  }
}

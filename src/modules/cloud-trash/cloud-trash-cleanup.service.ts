import path from 'node:path';
import { logger } from '../../lib/logger.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { CloudTrashSettings } from '../settings/settings.dto.js';

export type CloudTrashRemoteRef = {
  id: bigint;
  remoteName: string;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
};

export type CloudTrashCleanupListItem = {
  Path: string;
  Name: string;
  IsDir: boolean;
};

export type CloudTrashCleanupSummary = {
  scannedRemotes: number;
  expiredEntriesFound: number;
  deletedEntries: number;
  skippedMalformedPaths: number;
  remoteFailures: number;
  deleteFailures: number;
  failureSamples: Array<{
    stage: 'list' | 'purge';
    remoteName: string;
    path?: string;
    message: string;
  }>;
};

export interface CloudTrashCleanupRemoteClient {
  list(input: { fs: string; remote: string }): Promise<CloudTrashCleanupListItem[]>;
  purge(input: { fs: string; remote: string }): Promise<void>;
}

type CleanupServiceOptions = {
  settingsService: Pick<SettingsService, 'getCurrentConfig'>;
  listActiveRemotes: () => Promise<CloudTrashRemoteRef[]>;
  remoteClient?: CloudTrashCleanupRemoteClient;
  now?: () => Date;
};

export class CloudTrashCleanupService {
  private readonly log = logger.withContext({ module: 'cloud-trash-cleanup-service' });
  private readonly remoteClient: CloudTrashCleanupRemoteClient;
  private readonly now: () => Date;
  private static readonly MAX_FAILURE_SAMPLES = 5;

  constructor(private readonly options: CleanupServiceOptions) {
    this.remoteClient = options.remoteClient ?? new RcloneRcCloudTrashCleanupClient(options.settingsService);
    this.now = options.now ?? (() => new Date());
  }

  async runCleanup(): Promise<CloudTrashCleanupSummary> {
    const cloudTrash = this.options.settingsService.getCurrentConfig().cloudTrash;
    const activeRemotes = await this.options.listActiveRemotes();
    const enabledRemotes = activeRemotes.filter(
      (remote) => remote.cloudTrashEnabled && remote.cloudTrashBasePath.trim().length > 0
    );
    const summary: CloudTrashCleanupSummary = {
      scannedRemotes: 0,
      expiredEntriesFound: 0,
      deletedEntries: 0,
      skippedMalformedPaths: 0,
      remoteFailures: 0,
      deleteFailures: 0,
      failureSamples: []
    };
    const remainingDeletes = { value: cloudTrash.maxDeleteBatchPerRun };
    this.log.info('cloud trash cleanup started', {
      activeRemoteCount: enabledRemotes.length,
      retentionDays: cloudTrash.retentionDays,
      maxDeleteBatchPerRun: cloudTrash.maxDeleteBatchPerRun
    });

    for (const remote of enabledRemotes) {
      summary.scannedRemotes += 1;
      const expiredTrashPaths = await this.collectExpiredTrashDayPaths(remote, cloudTrash, summary);
      summary.expiredEntriesFound += expiredTrashPaths.length;

      for (const expiredTrashPath of expiredTrashPaths) {
        if (remainingDeletes.value <= 0) {
          this.log.info('cloud trash cleanup completed', summary);
          return summary;
        }

        try {
          await this.remoteClient.purge({
            fs: `${remote.remoteName}:`,
            remote: path.posix.join(remote.cloudTrashBasePath, expiredTrashPath)
          });
          summary.deletedEntries += 1;
          remainingDeletes.value -= 1;
        } catch (error) {
          summary.deleteFailures += 1;
          this.recordFailure(summary, {
            stage: 'purge',
            remoteName: remote.remoteName,
            path: expiredTrashPath,
            message: this.errorMessage(error)
          });
          this.log.warn('cloud trash cleanup purge failed', {
            remoteName: remote.remoteName,
            path: expiredTrashPath,
            err: error
          });
        }
      }
    }

    this.log.info('cloud trash cleanup completed', summary);
    return summary;
  }

  private async collectExpiredTrashDayPaths(
    remote: CloudTrashRemoteRef,
    cloudTrash: CloudTrashSettings,
    summary: CloudTrashCleanupSummary
  ): Promise<string[]> {
    let items: CloudTrashCleanupListItem[];
    try {
      items = await this.remoteClient.list({
        fs: `${remote.remoteName}:`,
        remote: remote.cloudTrashBasePath
      });
    } catch (error) {
      if (this.isMissingTrashRootError(error)) {
        return [];
      }
      summary.remoteFailures += 1;
      this.recordFailure(summary, {
        stage: 'list',
        remoteName: remote.remoteName,
        message: this.errorMessage(error)
      });
      this.log.warn('cloud trash cleanup list failed', { remoteName: remote.remoteName, err: error });
      return [];
    }

    const uniqueExpiredPaths = new Set<string>();

    for (const item of items) {
      const parsed = this.parseTrashDayPath(item.Path);
      if (!parsed) {
        summary.skippedMalformedPaths += 1;
        this.log.warn('cloud trash cleanup skipped malformed path', {
          remoteName: remote.remoteName,
          path: item.Path
        });
        continue;
      }
      if (!this.isExpiredTrashDate(parsed.date, cloudTrash.retentionDays)) {
        continue;
      }
      uniqueExpiredPaths.add(parsed.dayPath);
    }

    return [...uniqueExpiredPaths].sort((left, right) => left.localeCompare(right));
  }

  private parseTrashDayPath(relativePath: string): { dayPath: string; date: Date } | null {
    const segments = relativePath.split('/').filter(Boolean);
    if (segments.length < 3) {
      return null;
    }

    const [yearPart, monthPart, dayPart] = segments;
    if (!yearPart || !monthPart || !dayPart) {
      return null;
    }
    if (!/^\d{4}$/.test(yearPart) || !/^\d{2}$/.test(monthPart) || !/^\d{2}$/.test(dayPart)) {
      return null;
    }

    const year = Number(yearPart);
    const month = Number(monthPart);
    const day = Number(dayPart);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return null;
    }

    return {
      dayPath: [yearPart, monthPart, dayPart].join('/'),
      date: parsedDate
    };
  }

  private isExpiredTrashDate(entryDate: Date, retentionDays: number): boolean {
    const current = this.now();
    const utcToday = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
    const cutoff = utcToday - retentionDays * 24 * 60 * 60 * 1000;
    return entryDate.getTime() < cutoff;
  }

  private isMissingTrashRootError(error: unknown): boolean {
    const message = this.errorMessage(error).toLowerCase();
    return (
      message.includes('directory not found') ||
      message.includes('dir not found') ||
      message.includes('file not found') ||
      message.includes('not found')
    );
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return String(error);
  }

  private recordFailure(
    summary: CloudTrashCleanupSummary,
    sample: {
      stage: 'list' | 'purge';
      remoteName: string;
      path?: string;
      message: string;
    }
  ): void {
    if (summary.failureSamples.length >= CloudTrashCleanupService.MAX_FAILURE_SAMPLES) {
      return;
    }
    summary.failureSamples.push(sample);
  }
}

class RcloneRcCloudTrashCleanupClient implements CloudTrashCleanupRemoteClient {
  constructor(private readonly settingsService: Pick<SettingsService, 'getCurrentConfig'>) {}

  async list(input: { fs: string; remote: string }): Promise<CloudTrashCleanupListItem[]> {
    const response = await this.post<{ list?: CloudTrashCleanupListItem[] }>('operations/list', {
      fs: input.fs,
      remote: input.remote,
      opt: {
        recurse: true,
        noModTime: true,
        noMimeType: true
      }
    });
    return response.list ?? [];
  }

  async purge(input: { fs: string; remote: string }): Promise<void> {
    await this.post('operations/purge', {
      fs: input.fs,
      remote: input.remote,
      _async: false
    });
  }

  private async post<TResult extends Record<string, unknown>>(method: string, body: Record<string, unknown>): Promise<TResult> {
    const config = this.settingsService.getCurrentConfig().rcloneRcd;
    const response = await fetch(`${config.url.replace(/\/+$/, '')}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.user}:${config.pass}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(`rclone rc ${method} failed: ${response.status} ${message}`.trim());
    }

    return (await response.json().catch(() => ({}))) as TResult;
  }
}

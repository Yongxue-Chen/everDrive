import { logger } from '../../lib/logger.js';
import { JobQueueService } from '../job-queue/job-queue.service.js';
import type { CloudTrashSettings } from '../settings/settings.dto.js';

type ActiveTaskProvider = () => Promise<bigint[]>;
type CloudTrashSettingsProvider = () => CloudTrashSettings;

export class AutoSyncSchedulerService {
  private readonly log = logger.withContext({ module: 'auto-sync-scheduler' });
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly getCloudTrashSettings: CloudTrashSettingsProvider;
  private readonly now: () => Date;
  private lastCleanupEnqueuedAt: Date | null = null;

  constructor(
    private readonly queue: JobQueueService,
    private readonly listActiveTaskIds: ActiveTaskProvider,
    private readonly intervalSeconds: number,
    options?: {
      getCloudTrashSettings?: CloudTrashSettingsProvider;
      now?: () => Date;
    }
  ) {
    this.getCloudTrashSettings =
      options?.getCloudTrashSettings ??
      (() => ({
        enabled: false,
        retentionDays: 30,
        cleanupIntervalHours: 24,
        basePath: '.everdrive-trash',
        maxDeleteBatchPerRun: 1000
      }));
    this.now = options?.now ?? (() => new Date());
  }

  start(): void {
    if (this.timer) {
      return;
    }
    const intervalMs = Math.max(1, this.intervalSeconds) * 1000;
    this.timer = setInterval(() => {
      void this.runCycle();
    }, intervalMs);
    void this.runCycle();
    this.log.info('auto sync scheduler started', { intervalSeconds: this.intervalSeconds });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log.info('auto sync scheduler stopped');
    }
  }

  async runCycle(): Promise<void> {
    if (this.running) {
      this.log.debug('auto sync scheduler skipped overlapping cycle');
      return;
    }
    this.running = true;
    try {
      const taskIds = await this.listActiveTaskIds();
      for (const taskId of taskIds) {
        this.enqueueIfNotRunning('scan', taskId);
        this.enqueueIfNotRunning('rename_detect', taskId, { candidateWindowSeconds: 30 });
        this.enqueueIfNotRunning('sync', taskId, { deleteGraceSeconds: 30, renameHintWindowSeconds: 3600 });
      }
      this.enqueueCloudTrashCleanupIfDue();
      this.log.info('auto sync cycle completed', { tasks: taskIds.length });
    } catch (error) {
      this.log.error('auto sync cycle failed', { err: error });
    } finally {
      this.running = false;
    }
  }

  private enqueueIfNotRunning(kind: 'scan' | 'rename_detect' | 'sync', mappingTaskId: bigint, payload?: Record<string, unknown>): void {
    this.queue.enqueueUnique({
      kind,
      lane: 'long',
      mappingTaskId,
      payload
    });
  }

  private enqueueCloudTrashCleanupIfDue(): void {
    const cloudTrash = this.getCloudTrashSettings();
    if (!cloudTrash.enabled) {
      return;
    }

    const now = this.now();
    const cleanupIntervalMs = Math.max(1, cloudTrash.cleanupIntervalHours) * 60 * 60 * 1000;
    if (this.lastCleanupEnqueuedAt && now.getTime() - this.lastCleanupEnqueuedAt.getTime() < cleanupIntervalMs) {
      return;
    }

    this.queue.enqueueUnique({
      kind: 'cloud_trash_cleanup',
      lane: 'short'
    });
    this.lastCleanupEnqueuedAt = now;
  }
}

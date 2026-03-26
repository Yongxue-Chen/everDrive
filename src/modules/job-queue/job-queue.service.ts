import { AppError } from '../../errors/app-error.js';
import { logger } from '../../lib/logger.js';

export type QueueJobKind = 'scan' | 'sync' | 'rename_detect' | 'migrate' | 'remote_stats_refresh';
export type QueueJobLane = 'short' | 'long';
export type QueueJobStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

export type QueueJob = {
  id: string;
  kind: QueueJobKind;
  lane: QueueJobLane;
  mappingTaskId: string | null;
  remoteIds: string[];
  payload: Record<string, unknown>;
  status: QueueJobStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
};

export type QueueJobHandler = (job: QueueJob) => Promise<Record<string, unknown> | void>;

export type EnqueueJobInput = {
  kind: QueueJobKind;
  lane: QueueJobLane;
  mappingTaskId?: bigint;
  remoteIds?: bigint[];
  payload?: Record<string, unknown>;
};

export type JobQueueOptions = {
  longWorkerConcurrency: number;
  shortWorkerConcurrency: number;
  remoteConcurrencyLimit: number;
};

const DEFAULT_OPTIONS: JobQueueOptions = {
  longWorkerConcurrency: 1,
  shortWorkerConcurrency: 1,
  remoteConcurrencyLimit: 1
};

export class JobQueueService {
  private readonly log = logger.withContext({ module: 'job-queue-service' });
  private readonly jobs = new Map<string, QueueJob>();
  private readonly handlers = new Map<QueueJobKind, QueueJobHandler>();

  private readonly pendingLong: string[] = [];
  private readonly pendingShort: string[] = [];

  private runningLong = 0;
  private runningShort = 0;

  private readonly runningMappingTasks = new Set<string>();
  private readonly runningRemotes = new Map<string, number>();

  private nextId = 1;

  constructor(private readonly options: JobQueueOptions = DEFAULT_OPTIONS) {}

  registerHandler(kind: QueueJobKind, handler: QueueJobHandler): void {
    this.handlers.set(kind, handler);
  }

  enqueue(input: EnqueueJobInput): QueueJob {
    const now = new Date().toISOString();
    const job: QueueJob = {
      id: (this.nextId++).toString(),
      kind: input.kind,
      lane: input.lane,
      mappingTaskId: input.mappingTaskId?.toString() ?? null,
      remoteIds: (input.remoteIds ?? []).map((item) => item.toString()),
      payload: input.payload ?? {},
      status: 'queued',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      errorMessage: null,
      result: null
    };

    this.jobs.set(job.id, job);

    if (job.lane === 'short') {
      this.pendingShort.push(job.id);
    } else {
      this.pendingLong.push(job.id);
    }

    this.schedule();
    this.log.info('job queued', {
      jobId: job.id,
      kind: job.kind,
      lane: job.lane,
      mappingTaskId: job.mappingTaskId
    });
    return { ...job };
  }

  getJob(jobId: string): QueueJob | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  getJobOrThrow(jobId: string): QueueJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Job ${jobId} not found`,
        statusCode: 404
      });
    }

    return { ...job };
  }

  cancelQueuedJob(jobId: string): QueueJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `Job ${jobId} not found`,
        statusCode: 404
      });
    }

    if (job.status !== 'queued') {
      throw new AppError({
        code: 'CONFLICT',
        message: `Job ${jobId} is ${job.status} and cannot be cancelled`,
        statusCode: 409
      });
    }

    this.removeFromPending(job.id, job.lane);
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    return { ...job };
  }

  async waitForIdle(timeoutMs = 3000): Promise<void> {
    const start = Date.now();
    while (!this.isIdle()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitForIdle timeout after ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  private isIdle(): boolean {
    return this.runningLong === 0 && this.runningShort === 0 && this.pendingLong.length === 0 && this.pendingShort.length === 0;
  }

  private schedule(): void {
    this.scheduleLane('long');
    this.scheduleLane('short');
  }

  private scheduleLane(lane: QueueJobLane): void {
    while (this.hasLaneCapacity(lane)) {
      const jobId = this.nextRunnableJobId(lane);
      if (!jobId) {
        return;
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        continue;
      }

      this.startJob(job);
    }
  }

  private hasLaneCapacity(lane: QueueJobLane): boolean {
    if (lane === 'long') {
      return this.runningLong < this.options.longWorkerConcurrency;
    }

    return this.runningShort < this.options.shortWorkerConcurrency;
  }

  private nextRunnableJobId(lane: QueueJobLane): string | null {
    const queue = lane === 'long' ? this.pendingLong : this.pendingShort;
    for (let index = 0; index < queue.length; index += 1) {
      const jobId = queue[index];
      if (!jobId) {
        continue;
      }

      const job = this.jobs.get(jobId);
      if (!job) {
        queue.splice(index, 1);
        index -= 1;
        continue;
      }

      if (!this.canRun(job)) {
        continue;
      }

      queue.splice(index, 1);
      return jobId;
    }

    return null;
  }

  private canRun(job: QueueJob): boolean {
    if (job.mappingTaskId && this.runningMappingTasks.has(job.mappingTaskId)) {
      return false;
    }

    for (const remoteId of job.remoteIds) {
      const current = this.runningRemotes.get(remoteId) ?? 0;
      if (current >= this.options.remoteConcurrencyLimit) {
        return false;
      }
    }

    return true;
  }

  private startJob(job: QueueJob): void {
    const handler = this.handlers.get(job.kind);
    if (!handler) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        message: `Queue handler for ${job.kind} not registered`,
        statusCode: 500
      });
    }

    if (job.lane === 'long') {
      this.runningLong += 1;
    } else {
      this.runningShort += 1;
    }

    if (job.mappingTaskId) {
      this.runningMappingTasks.add(job.mappingTaskId);
    }

    for (const remoteId of job.remoteIds) {
      this.runningRemotes.set(remoteId, (this.runningRemotes.get(remoteId) ?? 0) + 1);
    }

    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.log.info('job started', {
      jobId: job.id,
      kind: job.kind,
      lane: job.lane,
      mappingTaskId: job.mappingTaskId
    });

    void this.executeJob(job, handler);
  }

  private async executeJob(job: QueueJob, handler: QueueJobHandler): Promise<void> {
    try {
      const result = await handler({ ...job });
      job.status = 'success';
      job.result = result ?? {};
      job.finishedAt = new Date().toISOString();
      this.log.info('job succeeded', {
        jobId: job.id,
        kind: job.kind,
        lane: job.lane,
        mappingTaskId: job.mappingTaskId
      });
    } catch (error) {
      job.status = 'failed';
      job.errorMessage = error instanceof Error ? error.message : 'job failed';
      job.finishedAt = new Date().toISOString();
      this.log.error('job failed', {
        jobId: job.id,
        kind: job.kind,
        lane: job.lane,
        mappingTaskId: job.mappingTaskId,
        err: error
      });
    } finally {
      this.releaseRunSlots(job);
      this.schedule();
    }
  }

  private releaseRunSlots(job: QueueJob): void {
    if (job.lane === 'long') {
      this.runningLong = Math.max(0, this.runningLong - 1);
    } else {
      this.runningShort = Math.max(0, this.runningShort - 1);
    }

    if (job.mappingTaskId) {
      this.runningMappingTasks.delete(job.mappingTaskId);
    }

    for (const remoteId of job.remoteIds) {
      const current = this.runningRemotes.get(remoteId) ?? 0;
      if (current <= 1) {
        this.runningRemotes.delete(remoteId);
      } else {
        this.runningRemotes.set(remoteId, current - 1);
      }
    }
  }

  private removeFromPending(jobId: string, lane: QueueJobLane): void {
    const queue = lane === 'long' ? this.pendingLong : this.pendingShort;
    const index = queue.indexOf(jobId);
    if (index >= 0) {
      queue.splice(index, 1);
    }
  }
}

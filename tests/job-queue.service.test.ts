import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/errors/app-error.js';
import { JobQueueService } from '../src/modules/job-queue/job-queue.service.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('JobQueueService', () => {
  it('runs queued job and stores success result', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });

    queue.registerHandler('scan', async () => ({ scannedCount: 2 }));

    const job = queue.enqueue({
      kind: 'scan',
      lane: 'long',
      mappingTaskId: 1n
    });

    await queue.waitForIdle();

    const saved = queue.getJobOrThrow(job.id);
    expect(saved.status).toBe('success');
    expect(saved.result).toEqual({ scannedCount: 2 });
  });

  it('enforces mappingTask mutex', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 2, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 2 });
    const first = deferred<void>();
    const second = deferred<void>();

    const handler = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);

    queue.registerHandler('scan', handler);

    const a = queue.enqueue({ kind: 'scan', lane: 'long', mappingTaskId: 7n });
    const b = queue.enqueue({ kind: 'scan', lane: 'long', mappingTaskId: 7n });

    await Promise.resolve();
    expect(queue.getJobOrThrow(a.id).status).toBe('running');
    expect(queue.getJobOrThrow(b.id).status).toBe('queued');

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.getJobOrThrow(b.id).status).toBe('running');

    second.resolve();
    await queue.waitForIdle();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('enforces remote concurrency limit per remote', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 2, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    const first = deferred<void>();
    const second = deferred<void>();

    const handler = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);

    queue.registerHandler('migrate', handler);

    const a = queue.enqueue({ kind: 'migrate', lane: 'long', mappingTaskId: 1n, remoteIds: [1n] });
    const b = queue.enqueue({ kind: 'migrate', lane: 'long', mappingTaskId: 2n, remoteIds: [1n] });

    await Promise.resolve();
    expect(queue.getJobOrThrow(a.id).status).toBe('running');
    expect(queue.getJobOrThrow(b.id).status).toBe('queued');

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.getJobOrThrow(b.id).status).toBe('running');

    second.resolve();
    await queue.waitForIdle();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('supports cancelling queued job', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    const blocker = deferred<void>();
    queue.registerHandler('sync', async () => blocker.promise);

    const running = queue.enqueue({ kind: 'sync', lane: 'long', mappingTaskId: 1n });
    const pending = queue.enqueue({ kind: 'sync', lane: 'long', mappingTaskId: 2n });

    await Promise.resolve();

    const cancelled = queue.cancelQueuedJob(pending.id);
    expect(cancelled.status).toBe('cancelled');

    expect(() => queue.cancelQueuedJob(running.id)).toThrowError(AppError);

    blocker.resolve();
    await queue.waitForIdle();
  });

  it('runs short and long jobs in separate worker pools', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    const longDeferred = deferred<void>();
    const shortDeferred = deferred<void>();

    queue.registerHandler('scan', async () => longDeferred.promise);
    queue.registerHandler('remote_stats_refresh', async () => shortDeferred.promise);

    const longJob = queue.enqueue({ kind: 'scan', lane: 'long', mappingTaskId: 1n });
    const shortJob = queue.enqueue({ kind: 'remote_stats_refresh', lane: 'short' });

    await Promise.resolve();

    expect(queue.getJobOrThrow(longJob.id).status).toBe('running');
    expect(queue.getJobOrThrow(shortJob.id).status).toBe('running');

    longDeferred.resolve();
    shortDeferred.resolve();
    await queue.waitForIdle();
  });
});

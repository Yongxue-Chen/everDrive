import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { createJobQueueRouter } from '../src/modules/job-queue/job-queue.controller.js';
import { JobQueueService } from '../src/modules/job-queue/job-queue.service.js';
import { createMaintenanceRouter } from '../src/modules/maintenance/maintenance.controller.js';
import { createScanRouter } from '../src/modules/scan/scan.controller.js';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('job queue API', () => {
  it('enqueues scan job and exposes status endpoint', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    queue.registerHandler('scan', async () => ({ ok: true }));

    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      scanRouter: createScanRouter({} as any, queue),
      jobQueueRouter: createJobQueueRouter(queue)
    });

    const queued = await request(app).post('/api/mapping-tasks/1/scan').send({});
    expect(queued.status).toBe(202);
    const jobId = queued.body.job.id as string;
    expect(jobId).toBeTruthy();

    let latest = await request(app).get('/api/jobs/' + jobId);
    for (let i = 0; i < 20 && latest.body.job.status !== 'success'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      latest = await request(app).get('/api/jobs/' + jobId);
    }

    expect(latest.status).toBe(200);
    expect(latest.body.job.status).toBe('success');
    expect(latest.body.job.result).toEqual({ ok: true });
  });

  it('cancels queued job', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    const blocker = deferred<void>();
    queue.registerHandler('scan', async () => blocker.promise);

    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      scanRouter: createScanRouter({} as any, queue),
      jobQueueRouter: createJobQueueRouter(queue)
    });

    const first = await request(app).post('/api/mapping-tasks/1/scan').send({});
    const second = await request(app).post('/api/mapping-tasks/2/scan').send({});

    const cancel = await request(app).post('/api/jobs/' + second.body.job.id + '/cancel').send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.job.status).toBe('cancelled');

    blocker.resolve();

    const runningJob = await request(app).get('/api/jobs/' + first.body.job.id);
    expect(['running', 'success']).toContain(runningJob.body.job.status);
  });

  it('enqueues a cloud trash cleanup job from the maintenance endpoint', async () => {
    const queue = new JobQueueService({ longWorkerConcurrency: 1, shortWorkerConcurrency: 1, remoteConcurrencyLimit: 1 });
    queue.registerHandler('cloud_trash_cleanup', async () => ({ ok: true }));
    const auditService = {
      write: vi.fn(async () => undefined)
    } as any;

    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      jobQueueRouter: createJobQueueRouter(queue),
      maintenanceRouter: createMaintenanceRouter(queue, auditService)
    });

    const response = await request(app).post('/api/maintenance/cloud-trash/cleanup').send({});

    expect(response.status).toBe(202);
    expect(response.body.job.kind).toBe('cloud_trash_cleanup');
    expect(response.body.job.lane).toBe('short');
    expect(['queued', 'running', 'success']).toContain(response.body.job.status);
    expect(auditService.write).toHaveBeenCalledWith({
      operationType: 'update',
      targetType: 'sync_job',
      message: 'Manual cloud trash cleanup enqueued',
      metadataJson: {
        jobId: response.body.job.id
      }
    });
  });
});

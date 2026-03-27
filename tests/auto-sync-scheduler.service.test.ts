import { describe, expect, it, vi } from 'vitest';
import { AutoSyncSchedulerService } from '../src/modules/scheduler/auto-sync-scheduler.service.js';
import type { CloudTrashSettings } from '../src/modules/settings/settings.dto.js';

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

describe('AutoSyncSchedulerService', () => {
  it('enqueues scan/rename/sync jobs for each active task', async () => {
    const queue = {
      enqueueUnique: vi.fn(() => ({}))
    } as any;

    const scheduler = new AutoSyncSchedulerService(
      queue,
      async () => [1n, 2n],
      30
    );

    await scheduler.runCycle();

    expect(queue.enqueueUnique).toHaveBeenCalledTimes(6);
    expect(queue.enqueueUnique).toHaveBeenCalledWith(expect.objectContaining({ kind: 'scan', mappingTaskId: 1n }));
    expect(queue.enqueueUnique).toHaveBeenCalledWith(expect.objectContaining({ kind: 'rename_detect', mappingTaskId: 1n }));
    expect(queue.enqueueUnique).toHaveBeenCalledWith(expect.objectContaining({ kind: 'sync', mappingTaskId: 1n }));
  });

  it('delegates dedupe to queue enqueueUnique', async () => {
    const queue = {
      enqueueUnique: vi.fn(() => ({}))
    } as any;

    const scheduler = new AutoSyncSchedulerService(queue, async () => [9n], 30);
    await scheduler.runCycle();

    expect(queue.enqueueUnique).toHaveBeenCalledTimes(3);
  });

  it('enqueues cleanup jobs on the configured interval when cloud trash is enabled', async () => {
    const queue = {
      enqueueUnique: vi.fn(() => ({}))
    } as any;

    let currentTime = new Date('2026-03-27T00:00:00.000Z');
    const scheduler = new AutoSyncSchedulerService(queue, async () => [7n], 30, {
      getCloudTrashSettings: () => cloudTrashSettings({ cleanupIntervalHours: 6 }),
      now: () => currentTime
    });

    await scheduler.runCycle();
    currentTime = new Date('2026-03-27T02:00:00.000Z');
    await scheduler.runCycle();
    currentTime = new Date('2026-03-27T06:00:00.000Z');
    await scheduler.runCycle();

    expect(queue.enqueueUnique).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cloud_trash_cleanup', lane: 'short' }));
    expect(queue.enqueueUnique).toHaveBeenCalledTimes(11);
    expect(
      queue.enqueueUnique.mock.calls.filter(([input]: [{ kind: string }]) => input.kind === 'cloud_trash_cleanup')
    ).toHaveLength(2);
  });
});

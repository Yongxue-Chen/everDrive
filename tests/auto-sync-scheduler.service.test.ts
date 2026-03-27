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
      hasCloudTrashEnabledRemotes: async () => true,
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

  it('enqueues cleanup jobs when any active remote enables cloud trash even if legacy global switch is off', async () => {
    const queue = {
      enqueueUnique: vi.fn(() => ({}))
    } as any;

    const scheduler = new AutoSyncSchedulerService(queue, async () => [7n], 30, {
      getCloudTrashSettings: () => cloudTrashSettings({ enabled: false, cleanupIntervalHours: 6 }),
      hasCloudTrashEnabledRemotes: async () => true,
      now: () => new Date('2026-03-27T00:00:00.000Z')
    } as any);

    await scheduler.runCycle();

    expect(queue.enqueueUnique).toHaveBeenCalledWith(expect.objectContaining({ kind: 'cloud_trash_cleanup', lane: 'short' }));
  });

  it('uses the runtime sync interval provider when starting the scheduler', () => {
    const queue = {
      enqueueUnique: vi.fn(() => ({}))
    } as any;
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    let currentIntervalSeconds = 120;

    const scheduler = new AutoSyncSchedulerService(queue, async () => [], 30, {
      getSyncIntervalSeconds: () => currentIntervalSeconds
    });

    scheduler.start();
    currentIntervalSeconds = 45;
    scheduler.refreshSchedule();
    scheduler.stop();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120_000);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 45_000);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});

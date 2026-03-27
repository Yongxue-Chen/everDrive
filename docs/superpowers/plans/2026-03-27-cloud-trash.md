# Cloud Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional everDrive-managed cloud trash flow for `mirror` sync deletions, plus scheduled cleanup and a manual cleanup trigger.

**Architecture:** Keep sync planning unchanged and implement cloud-trash behavior in the sync executor, where delete actions are already executed against remotes. Add a focused cloud-trash cleanup service that runs through the existing job queue and scheduler, and extend the settings module with a global `cloudTrash` configuration block.

**Tech Stack:** Node.js, TypeScript, Express, Zod, existing in-memory job queue, Prisma-backed repositories, rclone rcd client, Vitest.

---

### Task 1: Extend Global Settings For Cloud Trash

**Files:**
- Modify: `src/modules/settings/settings.dto.ts`
- Modify: `src/modules/settings/settings.service.ts`
- Test: `tests/settings.service.test.ts`

- [ ] **Step 1: Write the failing settings test**

```ts
it('round-trips cloud trash settings and marks restart-required keys', async () => {
  const initial: Settings = {
    rcloneRcd: {
      url: 'http://127.0.0.1:5572',
      user: 'admin',
      pass: 'secret',
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

  let saved: Settings | null = null;
  const repository: Partial<SettingsRepository> = {
    load: vi.fn(async () => initial),
    save: vi.fn(async (value: Settings) => {
      saved = value;
    })
  };

  const service = await SettingsService.create(repository as SettingsRepository);
  const result = await service.update({
    cloudTrash: {
      enabled: true,
      retentionDays: 14,
      cleanupIntervalHours: 24,
      basePath: '.everdrive-trash',
      maxDeleteBatchPerRun: 500
    }
  });

  expect(saved?.cloudTrash.enabled).toBe(true);
  expect(saved?.cloudTrash.retentionDays).toBe(14);
  expect(result.values.cloudTrash.enabled).toBe(true);
  expect(result.hotUpdate.restartRequiredKeys).toContain('cloudTrash.enabled');
  expect(result.hotUpdate.restartRequiredKeys).toContain('cloudTrash.retentionDays');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/settings.service.test.ts`
Expected: FAIL because `Settings` / `SettingsView` / `UpdateSettingsInput` do not yet contain `cloudTrash`.

- [ ] **Step 3: Write minimal settings implementation**

```ts
const CloudTrashSettingsSchema = z.object({
  enabled: z.boolean(),
  retentionDays: z.number().int().min(1),
  cleanupIntervalHours: z.number().int().min(1),
  basePath: z.string().min(1),
  maxDeleteBatchPerRun: z.number().int().min(1)
});

export const SettingsSchema = z.object({
  rcloneRcd: z.object({ /* existing fields */ }),
  defaultScanIntervalSeconds: z.number().int().positive(),
  defaultConcurrency: z.object({ /* existing fields */ }),
  defaultCapacityWarningThresholdPercent: z.number().int().min(1).max(100),
  hashAlgorithm: HashAlgorithmSchema,
  logLevel: LogLevelSchema,
  cloudTrash: CloudTrashSettingsSchema
});

export const UpdateSettingsSchema = z.object({
  rcloneRcd: z.object({ /* existing fields */ }).optional(),
  defaultScanIntervalSeconds: z.number().int().positive().optional(),
  defaultConcurrency: z.object({ /* existing fields */ }).optional(),
  defaultCapacityWarningThresholdPercent: z.number().int().min(1).max(100).optional(),
  hashAlgorithm: HashAlgorithmSchema.optional(),
  logLevel: LogLevelSchema.optional(),
  cloudTrash: CloudTrashSettingsSchema.partial().optional()
}).refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });
```

```ts
const defaults: Settings = {
  // existing defaults...
  cloudTrash: {
    enabled: false,
    retentionDays: 30,
    cleanupIntervalHours: 24,
    basePath: '.everdrive-trash',
    maxDeleteBatchPerRun: 1000
  }
};

const merged: Settings = {
  ...this.settings,
  ...input,
  rcloneRcd: { ...this.settings.rcloneRcd, ...input.rcloneRcd },
  defaultConcurrency: { ...this.settings.defaultConcurrency, ...input.defaultConcurrency },
  cloudTrash: { ...this.settings.cloudTrash, ...input.cloudTrash }
};

getCurrentConfig(): Settings {
  return this.settings;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/settings.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/settings/settings.dto.ts src/modules/settings/settings.service.ts tests/settings.service.test.ts
git commit -m "feat: add cloud trash settings"
```

### Task 2: Convert Mirror Deletes Into Move-To-Trash

**Files:**
- Modify: `src/modules/sync/sync-executor.service.ts`
- Test: `tests/sync-executor.test.ts`
- Optional create: `src/modules/sync/cloud-trash-path.ts`

- [ ] **Step 1: Write the failing sync executor test**

```ts
it('moves mirror delete targets into cloud trash when enabled', async () => {
  const deleteFile = vi.fn(async () => undefined);
  const move = vi.fn(async () => undefined);

  const rcloneClient = {
    move,
    deleteFile
  } as unknown as IRcloneClient;

  const repository = createRepositoryStub();
  const executor = new SyncExecutor(repository as SyncEngineRepository, rcloneClient, {
    getCloudTrashSettings: () => ({
      enabled: true,
      retentionDays: 30,
      cleanupIntervalHours: 24,
      basePath: '.everdrive-trash',
      maxDeleteBatchPerRun: 1000
    }),
    now: () => new Date('2026-03-27T12:00:00Z')
  });

  await executor.executePlan(planWithSingleDeleteAction());

  expect(move).toHaveBeenCalledWith(expect.objectContaining({
    srcFs: 'driveA:',
    srcRemote: 'photos/a.jpg',
    dstFs: 'driveA:',
    dstRemote: '.everdrive-trash/2026/03/27/1/photos/a.jpg'
  }));
  expect(deleteFile).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync-executor.test.ts`
Expected: FAIL because executor has no cloud-trash settings input and still calls `deleteFile`.

- [ ] **Step 3: Write minimal executor implementation**

```ts
export type CloudTrashSettings = {
  enabled: boolean;
  retentionDays: number;
  cleanupIntervalHours: number;
  basePath: string;
  maxDeleteBatchPerRun: number;
};

function buildCloudTrashPath(basePath: string, now: Date, mappingTaskId: string, remotePath: string): string {
  const yyyy = now.getUTCFullYear().toString();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${basePath}/${yyyy}/${mm}/${dd}/${mappingTaskId}/${remotePath}`.replace(/^\/+/, '');
}
```

```ts
constructor(
  private readonly repository: SyncEngineRepository,
  private readonly rcloneClient: IRcloneClient,
  private readonly deps: {
    getCloudTrashSettings?: () => CloudTrashSettings;
    now?: () => Date;
  } = {}
) {}
```

```ts
private async executeDelete(
  action: DeleteAction,
  summary: Omit<SyncExecutionSummary, 'jobId' | 'mappingTaskId'>,
  mappingTaskId: string
): Promise<void> {
  const cloudTrash = this.deps.getCloudTrashSettings?.();
  const now = this.deps.now?.() ?? new Date();

  for (const target of action.targets) {
    try {
      if (cloudTrash?.enabled) {
        const trashPath = buildCloudTrashPath(cloudTrash.basePath, now, mappingTaskId, target.remotePath);
        await this.rcloneClient.move({
          srcFs: `${target.remoteName}:`,
          srcRemote: target.remotePath,
          dstFs: `${target.remoteName}:`,
          dstRemote: trashPath,
          async: false
        });
        await this.repository.writeOperationLog({
          operationType: 'delete',
          targetType: 'file_location',
          targetId: BigInt(action.fileId),
          message: 'Remote file moved to cloud trash by mirror policy',
          metadata: { remoteName: target.remoteName, remotePath: target.remotePath, trashPath }
        });
      } else {
        await this.rcloneClient.deleteFile({
          fs: `${target.remoteName}:`,
          remote: target.remotePath,
          async: false
        });
      }
      summary.deleteSuccess += 1;
    } catch (error) {
      summary.deleteFailed += 1;
      summary.errors.push(`delete failed file=${action.fileId} remote=${target.remoteName}: ${(error as Error).message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sync-executor.test.ts tests/sync-planner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/sync/sync-executor.service.ts tests/sync-executor.test.ts
git commit -m "feat: move mirror deletes into cloud trash"
```

### Task 3: Add Cleanup Service And Queue Job

**Files:**
- Create: `src/modules/cloud-trash/cloud-trash-cleanup.service.ts`
- Create: `tests/cloud-trash-cleanup.service.test.ts`
- Modify: `src/modules/job-queue/job-queue.service.ts`
- Modify: `src/modules/scheduler/auto-sync-scheduler.service.ts`
- Modify: `src/server.ts`

- [ ] **Step 1: Write the failing cleanup service test**

```ts
it('deletes only expired dated trash paths up to the batch limit', async () => {
  const listFiles = vi.fn(async () => [
    { Path: '.everdrive-trash/2026/02/01/1/photos/a.jpg' },
    { Path: '.everdrive-trash/2026/03/20/1/photos/b.jpg' },
    { Path: '.everdrive-trash/bad/path/file.txt' }
  ]);
  const deleteFile = vi.fn(async () => undefined);

  const service = new CloudTrashCleanupService({
    listActiveRemotes: async () => [{ remoteId: 1n, remoteName: 'driveA' }],
    listTrashEntries: async () => listFiles(),
    deleteTrashEntry: async (remoteName, remotePath) => deleteFile(remoteName, remotePath),
    now: () => new Date('2026-03-27T00:00:00Z')
  });

  const result = await service.run({
    enabled: true,
    retentionDays: 30,
    cleanupIntervalHours: 24,
    basePath: '.everdrive-trash',
    maxDeleteBatchPerRun: 1
  });

  expect(deleteFile).toHaveBeenCalledTimes(1);
  expect(result.deletedCount).toBe(1);
  expect(result.skippedMalformedCount).toBe(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cloud-trash-cleanup.service.test.ts`
Expected: FAIL because cleanup service does not exist.

- [ ] **Step 3: Write minimal cleanup implementation and queue wiring**

```ts
export type CloudTrashCleanupSummary = {
  deletedCount: number;
  skippedMalformedCount: number;
  failedCount: number;
  scannedRemoteCount: number;
};

function parseTrashDate(basePath: string, remotePath: string): Date | null {
  const normalized = remotePath.replace(/^\/+/, '');
  if (!normalized.startsWith(`${basePath}/`)) {
    return null;
  }
  const parts = normalized.slice(basePath.length + 1).split('/');
  if (parts.length < 4) {
    return null;
  }
  const [yyyy, mm, dd] = parts;
  const value = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

export class CloudTrashCleanupService {
  async run(settings: CloudTrashSettings): Promise<CloudTrashCleanupSummary> {
    const summary: CloudTrashCleanupSummary = {
      deletedCount: 0,
      skippedMalformedCount: 0,
      failedCount: 0,
      scannedRemoteCount: 0
    };

    if (!settings.enabled) {
      return summary;
    }

    const cutoff = new Date(this.deps.now().getTime() - settings.retentionDays * 24 * 60 * 60 * 1000);
    const remotes = await this.deps.listActiveRemotes();

    for (const remote of remotes) {
      summary.scannedRemoteCount += 1;
      const entries = await this.deps.listTrashEntries(remote.remoteName, settings.basePath);
      for (const entry of entries) {
        if (summary.deletedCount >= settings.maxDeleteBatchPerRun) {
          return summary;
        }
        const entryDate = parseTrashDate(settings.basePath, entry.Path);
        if (!entryDate) {
          summary.skippedMalformedCount += 1;
          continue;
        }
        if (entryDate > cutoff) {
          continue;
        }
        try {
          await this.deps.deleteTrashEntry(remote.remoteName, entry.Path);
          summary.deletedCount += 1;
        } catch {
          summary.failedCount += 1;
        }
      }
    }

    return summary;
  }
}
```

```ts
export type QueueJobKind = 'scan' | 'sync' | 'rename_detect' | 'migrate' | 'remote_stats_refresh' | 'cloud_trash_cleanup';
```

```ts
jobQueue.registerHandler('cloud_trash_cleanup', async () => {
  const summary = await cloudTrashCleanupService.run(settingsService.getCurrentConfig().cloudTrash);
  return { summary };
});
```

```ts
private enqueueCleanupIfNotRunning(): void {
  this.queue.enqueueUnique({
    kind: 'cloud_trash_cleanup',
    lane: 'short',
    payload: {}
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/cloud-trash-cleanup.service.test.ts tests/auto-sync-scheduler.service.test.ts tests/job-queue.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/cloud-trash/cloud-trash-cleanup.service.ts src/modules/job-queue/job-queue.service.ts src/modules/scheduler/auto-sync-scheduler.service.ts src/server.ts tests/cloud-trash-cleanup.service.test.ts
git commit -m "feat: add cloud trash cleanup job"
```

### Task 4: Add Manual Cleanup Endpoint And End-To-End Verification

**Files:**
- Create: `src/modules/cloud-trash/cloud-trash.controller.ts`
- Modify: `src/app/create-app.ts`
- Modify: `src/server.ts`
- Test: `tests/cloud-trash.api.test.ts`

- [ ] **Step 1: Write the failing API test**

```ts
it('enqueues a cloud trash cleanup job', async () => {
  const queue = new JobQueueService();
  const router = createCloudTrashRouter(queue);
  const app = createApp({ cloudTrashRouter: router });

  const response = await request(app)
    .post('/api/maintenance/cloud-trash/cleanup')
    .send({});

  expect(response.status).toBe(202);
  expect(response.body.job.kind).toBe('cloud_trash_cleanup');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/cloud-trash.api.test.ts`
Expected: FAIL because `createApp` does not yet accept `cloudTrashRouter` and the route does not exist.

- [ ] **Step 3: Write minimal route implementation**

```ts
export function createCloudTrashRouter(queue: JobQueueService): Router {
  const router = Router();
  router.post('/api/maintenance/cloud-trash/cleanup', (_req, res) => {
    const job = queue.enqueueUnique({
      kind: 'cloud_trash_cleanup',
      lane: 'short',
      payload: {}
    });
    res.status(202).json({ job });
  });
  return router;
}
```

```ts
export type CreateAppDeps = {
  // existing routers...
  cloudTrashRouter?: Router;
};

app.use(deps.cloudTrashRouter ?? express.Router());
```

```ts
const cloudTrashRouter = createCloudTrashRouter(jobQueue);
const app = createApp({
  // existing deps...
  cloudTrashRouter
});
```

- [ ] **Step 4: Run full verification**

Run: `npm test && npm run build`
Expected: backend tests PASS and backend build PASS

Run: `cd frontend && npm run build`
Expected: frontend build PASS

- [ ] **Step 5: Commit**

```bash
git add src/modules/cloud-trash/cloud-trash.controller.ts src/app/create-app.ts src/server.ts tests/cloud-trash.api.test.ts
git commit -m "feat: add manual cloud trash cleanup trigger"
```

## Self-Review

Spec coverage:
- global settings: Task 1
- mirror delete to move-to-trash: Task 2
- scheduled cleanup: Task 3
- manual maintenance endpoint: Task 4
- observability / logging: Tasks 2 and 3
- testing and verification: all tasks

Placeholder scan:
- no TODO/TBD markers
- all tasks include files, test targets, run commands, and commit points

Type consistency:
- shared config name is `cloudTrash`
- queue job name is `cloud_trash_cleanup`
- settings accessor added in the plan is `getCurrentConfig()`
- manual endpoint path is `/api/maintenance/cloud-trash/cleanup`

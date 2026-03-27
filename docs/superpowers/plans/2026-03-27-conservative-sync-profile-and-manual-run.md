# Conservative Sync Profile And Manual Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加全局保守同步参数、让系统设置中的同步频率真正生效，并给每个映射增加“手动同步一次”按钮。

**Architecture:** 在 settings 中新增全局 `syncProfile`，由后端统一注入到 rclone rc 调用；调度器改为按 settings 的当前值驱动；映射列表新增单独 API 入口为单个映射顺序 enqueue `scan -> rename_detect -> sync`。前端系统设置页和映射列表分别暴露这些能力。

**Tech Stack:** TypeScript, Express, React, TanStack Query, Vitest, rclone rcd

---

### Task 1: 扩展 settings 模型以支持保守同步 profile

**Files:**
- Modify: `src/modules/settings/settings.dto.ts`
- Modify: `src/modules/settings/settings.service.ts`
- Modify: `frontend/src/lib/types.ts`
- Test: `tests/settings.service.test.ts`

- [ ] **Step 1: 写 settings 失败测试**

在 `tests/settings.service.test.ts` 新增断言，验证默认 settings 含 `syncProfile`，且默认值是保守档。

```ts
expect(service.getCurrent().item.values.syncProfile).toEqual({
  transfers: 1,
  checkers: 1,
  bufferSizeMiB: 8,
  tpsLimit: 2,
  bwLimitMiB: 4
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/settings.service.test.ts`

Expected: FAIL，当前 settings 中没有 `syncProfile`

- [ ] **Step 3: 扩展后端 settings schema/defaults**

在 `src/modules/settings/settings.dto.ts` 和 `src/modules/settings/settings.service.ts` 中新增：

```ts
syncProfile: z.object({
  transfers: z.number().int().positive(),
  checkers: z.number().int().positive(),
  bufferSizeMiB: z.number().int().positive(),
  tpsLimit: z.number().positive(),
  bwLimitMiB: z.number().positive()
})
```

默认值：

```ts
syncProfile: {
  transfers: 1,
  checkers: 1,
  bufferSizeMiB: 8,
  tpsLimit: 2,
  bwLimitMiB: 4
}
```

- [ ] **Step 4: 扩展前端 settings 类型**

在 `frontend/src/lib/types.ts` 增加 `values.syncProfile` 和 `UpdateSettingsPayload.syncProfile`

- [ ] **Step 5: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/settings.service.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /home/ubuntu/everDrive add src/modules/settings/settings.dto.ts src/modules/settings/settings.service.ts frontend/src/lib/types.ts tests/settings.service.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: add conservative sync profile settings"
```

### Task 2: 让调度器真正使用 settings 中的同步频率

**Files:**
- Modify: `src/modules/scheduler/auto-sync-scheduler.service.ts`
- Modify: `src/server.ts`
- Test: `tests/auto-sync-scheduler.service.test.ts`

- [ ] **Step 1: 写调度器失败测试**

在 `tests/auto-sync-scheduler.service.test.ts` 增加用例，验证 scheduler 使用 settings provider 返回的 interval，而不是构造时固定值。

```ts
expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 120_000);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/auto-sync-scheduler.service.test.ts`

Expected: FAIL，当前 interval 仍固定来自 env

- [ ] **Step 3: 修改调度器读取 settings interval**

在 `src/modules/scheduler/auto-sync-scheduler.service.ts`：
- 新增 `getSyncIntervalSeconds` provider
- `start()` / interval 重建时使用 provider 当前值

在 `src/server.ts`：
- 由 `settingsService.getCurrentConfig().defaultScanIntervalSeconds` 提供当前值

- [ ] **Step 4: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/auto-sync-scheduler.service.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /home/ubuntu/everDrive add src/modules/scheduler/auto-sync-scheduler.service.ts src/server.ts tests/auto-sync-scheduler.service.test.ts
git -C /home/ubuntu/everDrive commit -m "fix: drive auto sync interval from settings"
```

### Task 3: 把保守同步 profile 注入 rclone rc 调用

**Files:**
- Modify: `src/infrastructure/rclone/rclone-rcd-client.ts`
- Modify: `src/server.ts`
- Test: `tests/rclone-client.test.ts`

- [ ] **Step 1: 写 rclone client 失败测试**

在 `tests/rclone-client.test.ts` 新增断言，验证传输调用带上 profile。

```ts
expect(fetchMock).toHaveBeenCalledWith(
  expect.any(String),
  expect.objectContaining({
    body: expect.stringContaining('"transfers":1')
  })
);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/rclone-client.test.ts`

Expected: FAIL，当前请求体不包含保守 profile

- [ ] **Step 3: 在 rclone client 增加 execution profile**

在 `src/infrastructure/rclone/rclone-rcd-client.ts`：
- 新增 `RcloneExecutionProfile`
- 为 copy/sync/move/delete 等调用统一追加 `_config`
- profile 值来自注入 provider

示意：

```ts
type RcloneExecutionProfile = {
  transfers: number;
  checkers: number;
  bufferSizeMiB: number;
  tpsLimit: number;
  bwLimitMiB: number;
};
```

- [ ] **Step 4: 在 server 注入 settings-based profile**

在 `src/server.ts` 构造 rclone client 时传 provider，读取 `settingsService.getCurrentConfig().syncProfile`

- [ ] **Step 5: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/rclone-client.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /home/ubuntu/everDrive add src/infrastructure/rclone/rclone-rcd-client.ts src/server.ts tests/rclone-client.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: apply conservative sync profile to rclone calls"
```

### Task 4: 系统设置页暴露保守同步参数

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Test: `tests/frontend-settings-api.test.ts`

- [ ] **Step 1: 写前端 settings 失败测试**

在 `tests/frontend-settings-api.test.ts` 新增断言，验证 `syncProfile` 会通过 `/api/settings` 提交。

```ts
expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
  syncProfile: {
    transfers: 1,
    checkers: 1,
    bufferSizeMiB: 8,
    tpsLimit: 2,
    bwLimitMiB: 4
  }
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-settings-api.test.ts`

Expected: FAIL，当前 payload 不含 `syncProfile`

- [ ] **Step 3: 修改设置页**

在 `frontend/src/pages/SettingsPage.tsx`：
- 增加保守同步参数输入项
- 增加简短说明：`更安全、更慢，适合网盘备份`
- 继续保留“扫描间隔（秒）”，并明确这是自动同步频率

- [ ] **Step 4: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-settings-api.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /home/ubuntu/everDrive add frontend/src/pages/SettingsPage.tsx tests/frontend-settings-api.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: expose conservative sync settings in ui"
```

### Task 5: 为单个映射增加手动同步 API 和按钮

**Files:**
- Modify: `src/modules/mapping-task/mapping-task.controller.ts`
- Modify: `src/server.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/MappingTable.tsx`
- Modify: `frontend/src/pages/MappingTasksPage.tsx`
- Test: `tests/frontend-mapping-api.test.ts`
- Test: mapping-task controller / job queue related tests

- [ ] **Step 1: 写失败测试，覆盖手动同步接口**

新增测试验证：
- 后端 `POST /api/mapping-tasks/:id/run-sync` 返回 202
- 前端会调用该接口

```ts
expect(fetchMock).toHaveBeenCalledWith(
  '/api/mapping-tasks/9/run-sync',
  expect.objectContaining({ method: 'POST' })
);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts`

Expected: FAIL，当前没有 run-sync 接口

- [ ] **Step 3: 新增后端 run-sync 接口**

在 `src/modules/mapping-task/mapping-task.controller.ts` 增加：
- `POST /api/mapping-tasks/:taskId/run-sync`
- 顺序 enqueue：
  - `scan`
  - `rename_detect`
  - `sync`

- [ ] **Step 4: 前端接入按钮**

在 `frontend/src/lib/api.ts` 新增 `runMappingTaskSync(taskId)`

在 `frontend/src/components/MappingTable.tsx` 新增按钮：
- `手动同步`

在 `frontend/src/pages/MappingTasksPage.tsx`：
- 调 mutation
- pending 时禁用并刷新列表

- [ ] **Step 5: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /home/ubuntu/everDrive add src/modules/mapping-task/mapping-task.controller.ts src/server.ts frontend/src/lib/api.ts frontend/src/components/MappingTable.tsx frontend/src/pages/MappingTasksPage.tsx tests/frontend-mapping-api.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: add per-mapping manual sync trigger"
```

### Task 6: 综合验证

**Files:**
- Modify: none
- Test: targeted suites and builds

- [ ] **Step 1: 运行后端测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/settings.service.test.ts tests/auto-sync-scheduler.service.test.ts tests/rclone-client.test.ts`

Expected: PASS

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-settings-api.test.ts tests/frontend-mapping-api.test.ts`

Expected: PASS

- [ ] **Step 2: 运行构建**

Run: `npm --prefix /home/ubuntu/everDrive run build`

Expected: PASS

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git -C /home/ubuntu/everDrive add -A
git -C /home/ubuntu/everDrive commit -m "feat: add conservative sync controls and manual sync"
```

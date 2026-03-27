# everDrive Remote Cloud Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把自建云端回收站改成每个云盘单独配置，并且仅在 `mirror` 模式删除时生效。

**Architecture:** 将 `cloudTrashEnabled` 与 `cloudTrashBasePath` 下沉到 remote 模型和 remote API，由云盘管理页直接编辑。同步执行器不再依赖全局 settings 决策 trash，而是在 delete target 对应的 remote 上读取开关与路径。前端映射页只保留提示文案，不承载该配置。

**Tech Stack:** Node.js, Express, Prisma, React 18, TypeScript, Vite, TanStack Query, Vitest

---

### Task 1: 扩展 Remote 后端模型与接口

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_remote_cloud_trash/migration.sql`
- Modify: `/home/ubuntu/everDrive/src/modules/remote/remote.dto.ts`
- Modify: `/home/ubuntu/everDrive/src/modules/remote/cloud-inventory.service.ts`
- Modify: `/home/ubuntu/everDrive/src/modules/remote/cloud-inventory.repository.ts`
- Modify: `/home/ubuntu/everDrive/src/modules/remote/remote.controller.ts`
- Test: `/home/ubuntu/everDrive/tests/cloud-inventory.service.test.ts`

- [ ] **Step 1: 先写失败测试锁定 remote card 与更新接口包含 trash 字段**

在 `tests/cloud-inventory.service.test.ts` 新增至少两个用例：

```ts
it('includes remote cloud trash fields in remote cards', async () => {
  const service = new CloudInventoryService(repositoryStub({
    listRemotes: vi.fn(async () => [buildRemoteRecord({ cloudTrashEnabled: true, cloudTrashBasePath: 'trash-a' })])
  }), rcloneStub());

  const [item] = await service.listRemoteCards();

  expect(item.cloudTrashEnabled).toBe(true);
  expect(item.cloudTrashBasePath).toBe('trash-a');
});

it('updates remote cloud trash settings', async () => {
  const repository = repositoryStub();
  const service = new CloudInventoryService(repository, rcloneStub());

  await service.updateRemoteSettings(11n, {
    cloudTrashEnabled: true,
    cloudTrashBasePath: 'trash-a'
  });

  expect(repository.updateRemoteSettings).toHaveBeenCalledWith(11n, expect.objectContaining({
    cloudTrashEnabled: true,
    cloudTrashBasePath: 'trash-a'
  }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/cloud-inventory.service.test.ts`
Expected: FAIL，提示 remote card 缺少 `cloudTrashEnabled/cloudTrashBasePath`，或 service/repository 还没有 remote settings 更新能力。

- [ ] **Step 3: 最小实现 remote 级 trash 字段与接口**

实现要点：

```ts
export const UpdateRemoteSettingsSchema = z.object({
  totalCapacity: bigintInputSchema.optional(),
  reservedCapacity: bigintInputSchema.optional(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  cloudTrashEnabled: z.boolean().optional(),
  cloudTrashBasePath: z.string().min(1).max(512).optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one remote field is required'
});
```

```ts
export type RemoteCard = {
  // existing fields...
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
};
```

```ts
async updateRemoteSettings(remoteId: bigint, input: RemoteSettingsUpdateInput): Promise<RemoteCard> {
  await this.ensureRemoteExists(remoteId);
  await this.repository.updateRemoteSettings(remoteId, input);
  return this.getRemoteCard(remoteId);
}
```

```ts
router.patch('/api/remotes/:remoteId', asyncHandler(async (req, res) => {
  const remoteId = parseRemoteId(req.params.remoteId);
  const body = parseOrBadRequest(UpdateRemoteSettingsSchema, req.body);
  const item = await service.updateRemoteSettings(remoteId, {
    totalCapacity: toBigInt(body.totalCapacity),
    reservedCapacity: toBigInt(body.reservedCapacity),
    warningThresholdPercent: body.warningThresholdPercent,
    cloudTrashEnabled: body.cloudTrashEnabled,
    cloudTrashBasePath: body.cloudTrashBasePath
  });
  res.status(200).json({ item });
}));
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/cloud-inventory.service.test.ts`
Expected: PASS

### Task 2: 将 Sync Executor 切到 remote 级 cloud trash

**Files:**
- Modify: `/home/ubuntu/everDrive/src/modules/sync/sync-executor.service.ts`
- Modify: `/home/ubuntu/everDrive/src/modules/sync/sync-engine.repository.ts`
- Test: `/home/ubuntu/everDrive/tests/sync-executor.test.ts`

- [ ] **Step 1: 先写失败测试，锁定 remote 级开关只影响 mirror 删除**

在 `tests/sync-executor.test.ts` 把现有全局 settings 依赖改成 remote 级上下文，至少覆盖：

```ts
it('moves mirror deletes into the target remote trash when that remote enables cloud trash', async () => {
  const executor = new SyncExecutor(repository, rclone, {
    now: () => now
  });
  const plan: SyncPlan = {
    syncMode: 'mirror',
    deleteActions: [{
      targets: [{
        remoteId: '11',
        remoteName: 'driveA',
        remotePath: '2024/vacation/a.jpg',
        cloudTrashEnabled: true,
        cloudTrashBasePath: 'trash-a'
      }]
    }]
  } as unknown as SyncPlan;

  await executor.executePlan(plan);

  expect(rclone.move).toHaveBeenCalledWith(expect.objectContaining({
    dstRemote: 'trash-a/2026/03/27/42/2024/vacation/a.jpg'
  }));
});

it('keeps direct delete when the target remote disables cloud trash', async () => {
  // remote target carries cloudTrashEnabled: false
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/sync-executor.test.ts`
Expected: FAIL，提示 delete target 上还没有 remote trash 字段，或 executor 仍在读取全局 settings。

- [ ] **Step 3: 最小实现 remote 级 delete 决策**

实现要点：

```ts
const shouldMoveToTrash =
  plan.syncMode === 'mirror' &&
  target.cloudTrashEnabled === true &&
  target.cloudTrashBasePath.trim().length > 0;

if (shouldMoveToTrash) {
  const trashRemotePath = await this.moveToCloudTrash(
    target.remoteName,
    target.remotePath,
    plan.mappingTaskId,
    target.cloudTrashBasePath
  );
  // success logging stays the same
} else {
  await this.rcloneClient.deleteFile({ fs: `${target.remoteName}:`, remote: target.remotePath, async: false });
}
```

同步调整 planner/repository 产出的 delete target 结构，使 executor 能拿到：

```ts
{
  remoteId: string;
  remoteName: string;
  remotePath: string;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/sync-executor.test.ts`
Expected: PASS

### Task 3: 前端 API 与云盘管理页接入 remote 级 trash 配置

**Files:**
- Modify: `/home/ubuntu/everDrive/frontend/src/lib/types.ts`
- Modify: `/home/ubuntu/everDrive/frontend/src/lib/api.ts`
- Modify: `/home/ubuntu/everDrive/frontend/src/lib/mock-data.ts`
- Modify: `/home/ubuntu/everDrive/frontend/src/pages/CloudRemotesPage.tsx`
- Modify: `/home/ubuntu/everDrive/frontend/src/pages/MappingTasksPage.tsx`
- Modify: `/home/ubuntu/everDrive/frontend/src/styles.css`
- Test: `/home/ubuntu/everDrive/tests/frontend-remote-capacity-api.test.ts`

- [ ] **Step 1: 先写失败测试，锁定前端走统一 remote 更新接口**

在 `tests/frontend-remote-capacity-api.test.ts` 增加：

```ts
it('updates remote cloud trash settings through the live backend endpoint', async () => {
  setApiMode('live');
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ item: { id: '11', cloudTrashEnabled: true, cloudTrashBasePath: 'trash-a' } })
  } as Response);

  await updateRemoteSettings('11', {
    cloudTrashEnabled: true,
    cloudTrashBasePath: 'trash-a'
  });

  expect(fetch).toHaveBeenCalledWith('/api/remotes/11', expect.objectContaining({ method: 'PATCH' }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-remote-capacity-api.test.ts`
Expected: FAIL，提示 `updateRemoteSettings` 未实现或路径仍是 `/capacity`。

- [ ] **Step 3: 最小实现前端 API 与云盘页表单**

实现要点：

```ts
export type UpdateRemoteSettingsPayload = {
  totalCapacity?: string;
  reservedCapacity?: string;
  warningThresholdPercent?: number;
  cloudTrashEnabled?: boolean;
  cloudTrashBasePath?: string;
};
```

```ts
export async function updateRemoteSettings(remoteId: string, payload: UpdateRemoteSettingsPayload) {
  return requestJsonWithBody<UpdateRemoteSettingsResponse>(`/api/remotes/${remoteId}`, 'PATCH', payload);
}
```

云盘页编辑表单补：

```tsx
<label>
  启用自建云端回收站
  <input
    type="checkbox"
    checked={form.cloudTrashEnabled}
    onChange={(e) => setForm((prev) => ({ ...prev, cloudTrashEnabled: e.target.checked }))}
  />
</label>
{form.cloudTrashEnabled ? (
  <label>
    回收站基础路径
    <input
      value={form.cloudTrashBasePath}
      onChange={(e) => setForm((prev) => ({ ...prev, cloudTrashBasePath: e.target.value }))}
    />
  </label>
) : null}
```

映射页只补提示文案，例如：

```tsx
<p className="muted">自建云端回收站按云盘单独配置，仅在镜像模式删除时生效。</p>
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-remote-capacity-api.test.ts`
Expected: PASS

### Task 4: 最终验证

**Files:**
- Modify: `/home/ubuntu/everDrive/src/modules/remote/cloud-inventory.service.ts`
- Modify: `/home/ubuntu/everDrive/src/modules/sync/sync-executor.service.ts`
- Modify: `/home/ubuntu/everDrive/frontend/src/pages/CloudRemotesPage.tsx`

- [ ] **Step 1: 跑后端目标测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/cloud-inventory.service.test.ts tests/sync-executor.test.ts`
Expected: PASS

- [ ] **Step 2: 跑前端目标测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-remote-capacity-api.test.ts`
Expected: PASS

- [ ] **Step 3: 跑前端构建**

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`
Expected: PASS

- [ ] **Step 4: 记录剩余风险**

检查：
- 旧 `settings.cloudTrash` 是否已从执行链路移除
- mock 数据是否包含 remote 级 trash 字段
- remote 级 trash path 空字符串时是否被后端拒绝或归一化

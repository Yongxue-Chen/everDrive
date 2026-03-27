# UX Capacity And Local Path Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复容量单位、根目录浏览、映射绑定顺序、预留容量说明和 remote 真实已用容量这 5 个可用性问题。

**Architecture:** 后端分成两块修复：本地路径允许规则和 remote 真实容量查询；前端统一把容量交互改成 GB 语义，并把映射绑定顺序从内部 priority 数字改成用户可理解的顺序号。实现保持现有数据模型和接口主结构不变，优先做兼容式调整。

**Tech Stack:** TypeScript, Express, Prisma, React, TanStack Query, Vitest, rclone rcd

---

### Task 1: 修复根目录下的本地路径浏览

**Files:**
- Modify: `src/modules/local-path/local-path.service.ts`
- Modify: `tests/local-path-browser.api.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 `/` 下进入子目录**

在 `tests/local-path-browser.api.test.ts` 新增用例，验证允许根目录时，请求 `/api/local-paths?path=/etc` 返回 200。

```ts
  it('allows browsing child directories under the system root when root is allowed', async () => {
    const localPathService = new LocalPathService(['/']);
    const app = createApp({
      checkDb: async () => true,
      checkRclone: async () => true,
      localPathRouter: createLocalPathRouter(localPathService)
    });

    const response = await request(app).get('/api/local-paths').query({
      path: '/etc'
    });

    expect(response.status).toBe(200);
    expect(response.body.currentPath).toBe('/etc');
    expect(Array.isArray(response.body.items)).toBe(true);
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts`

Expected: FAIL，报 `/etc` 被判定为超出允许根目录。

- [ ] **Step 3: 修正根目录允许规则**

在 `src/modules/local-path/local-path.service.ts` 修改 `isAllowed`。

```ts
  private isAllowed(candidate: string): boolean {
    return this.allowedRoots.some((root) => {
      if (candidate === root) {
        return true;
      }

      if (root === path.sep) {
        return candidate.startsWith(path.sep);
      }

      return candidate.startsWith(root + path.sep);
    });
  }
```

- [ ] **Step 4: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /home/ubuntu/everDrive add src/modules/local-path/local-path.service.ts tests/local-path-browser.api.test.ts
git -C /home/ubuntu/everDrive commit -m "fix: allow browsing child paths from root"
```

### Task 2: 为 remote 增加 rclone about 真实容量读取

**Files:**
- Modify: `src/infrastructure/rclone/rclone-rcd-client.ts`
- Modify: `src/modules/remote/cloud-inventory.service.ts`
- Test: `tests/rclone-client.test.ts`
- Test: `tests/cloud-inventory.service.test.ts`

- [ ] **Step 1: 写 rclone client 失败测试**

在 `tests/rclone-client.test.ts` 新增 `operations/about` 用例。

```ts
  it('loads remote capacity stats through operations/about', async () => {
    fetchMock.mockResolvedValueOnce(
      createJsonResponse({
        total: 1000,
        used: 250,
        free: 750
      })
    );

    const result = await client.getAbout('myremote:');

    expect(result.total).toBe('1000');
    expect(result.used).toBe('250');
    expect(result.free).toBe('750');
  });
```

- [ ] **Step 2: 写 cloud inventory 失败测试**

在 `tests/cloud-inventory.service.test.ts` 新增用例，验证 remote card 优先用 rclone about 的 `used/total`。

```ts
  it('prefers real remote usage from rclone about when available', async () => {
    repository.listRemotes.mockResolvedValue([remoteRecord]);
    rcloneClient.getAbout.mockResolvedValue({
      total: '1000',
      used: '250',
      free: '750'
    });

    const items = await service.listRemoteCards();

    expect(items[0]?.capacity.usedCapacityBytes).toBe('250');
    expect(items[0]?.capacity.totalCapacityBytes).toBe('1000');
    expect(items[0]?.capacity.remainingCapacityBytes).toBe('750');
  });
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/rclone-client.test.ts tests/cloud-inventory.service.test.ts`

Expected: FAIL，`getAbout` 不存在，service 未使用真实 remote 容量。

- [ ] **Step 4: 在 rclone client 新增 about 能力**

在 `src/infrastructure/rclone/rclone-rcd-client.ts`：

```ts
export type RcloneAboutResult = {
  total: string | null;
  used: string | null;
  free: string | null;
};

export interface IRcloneClient {
  // ...
  getAbout(fs: string): Promise<RcloneAboutResult>;
}

  async getAbout(fs: string): Promise<RcloneAboutResult> {
    const response = await this.post<Record<string, unknown>>('operations/about', { fs });

    const readBigintLike = (value: unknown): string | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value).toString();
      }
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
      return null;
    };

    return {
      total: readBigintLike(response.total),
      used: readBigintLike(response.used),
      free: readBigintLike(response.free)
    };
  }
```

- [ ] **Step 5: 在 remote service 中优先使用真实容量**

在 `src/modules/remote/cloud-inventory.service.ts` 中：
- 获取 active remote 的 `getAbout(\`${remote.remoteName}:\`)`
- 成功时用真实 `used`
- 若数据库总容量为 `0` 且 rclone 提供了 `total`，显示层使用真实 `total`
- about 失败时降级回现有数据库快照

```ts
const about = await this.rcloneClient.getAbout(`${remote.remoteName}:`);
const effectiveUsedCapacity = about.used ? BigInt(about.used) : remote.usedCapacity;
const effectiveTotalCapacity =
  remote.totalCapacity > 0n ? remote.totalCapacity : about.total ? BigInt(about.total) : remote.totalCapacity;
```

- [ ] **Step 6: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/rclone-client.test.ts tests/cloud-inventory.service.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C /home/ubuntu/everDrive add src/infrastructure/rclone/rclone-rcd-client.ts src/modules/remote/cloud-inventory.service.ts tests/rclone-client.test.ts tests/cloud-inventory.service.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: use rclone about for remote capacity"
```

### Task 3: 把映射绑定 priority 改成可理解的绑定顺序

**Files:**
- Modify: `frontend/src/pages/MappingTasksPage.tsx`
- Modify: `frontend/src/components/MappingTable.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `tests/frontend-mapping-api.test.ts`

- [ ] **Step 1: 写前端 API/表单失败测试**

在 `tests/frontend-mapping-api.test.ts` 新增顺序号用例，验证默认和提交使用 `1, 2, 3` 而非 `100, 200, 300`。

```ts
    expect(body.remoteBindings[0]?.priority).toBe(1);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts`

Expected: FAIL，当前默认 priority 为 100。

- [ ] **Step 3: 修改映射页与展示文案**

在 `frontend/src/pages/MappingTasksPage.tsx`：
- 默认绑定顺序改为 `1`
- 新增 remote 时按 `prev.remoteBindings.length + 1`
- 字段标签改成“绑定顺序”

在 `frontend/src/components/MappingTable.tsx`：
- `优先级` 改成 `顺序`

```ts
remoteBindings: [{ remoteId: '', priority: 1, remoteBasePath: '' }]
```

- [ ] **Step 4: 调整 API/mock 兼容逻辑**

在 `frontend/src/lib/api.ts`：

```ts
priority: binding.priority ?? (index + 1),
```

- [ ] **Step 5: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git -C /home/ubuntu/everDrive add frontend/src/pages/MappingTasksPage.tsx frontend/src/components/MappingTable.tsx frontend/src/lib/api.ts tests/frontend-mapping-api.test.ts
git -C /home/ubuntu/everDrive commit -m "fix: simplify mapping remote binding order"
```

### Task 4: 前端容量交互统一为 GB 并补充预留容量说明

**Files:**
- Modify: `frontend/src/lib/format.ts`
- Modify: `frontend/src/pages/CloudRemotesPage.tsx`
- Modify: `frontend/src/components/RemoteCard.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `tests/frontend-remote-capacity-api.test.ts`

- [ ] **Step 1: 写失败测试，覆盖 GB 提交转换**

在 `tests/frontend-remote-capacity-api.test.ts` 新增断言，验证表单层会把 `GB` 转成 bytes 发送。

```ts
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      totalCapacity: '107374182400',
      reservedCapacity: '21474836480'
    });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-remote-capacity-api.test.ts`

Expected: FAIL，当前直接传的是表单原始数字/字节字符串。

- [ ] **Step 3: 新增 GB/bytes 转换工具**

在 `frontend/src/lib/format.ts` 添加：

```ts
const BYTES_PER_GB = 1024 ** 3;

export function formatGigabytes(bytes: string | number): string {
  return (Number(bytes) / BYTES_PER_GB).toFixed(2);
}

export function gigabytesToBytes(input: string): string {
  return Math.round(Number(input || '0') * BYTES_PER_GB).toString();
}
```

- [ ] **Step 4: 修改云盘页表单和卡片**

在 `frontend/src/pages/CloudRemotesPage.tsx`：
- 表单状态改存 `GB`
- `toCapacityForm()` 把 bytes 转成 `GB`
- 提交前把 `GB` 转成 bytes
- 字段标签改成 `总容量（GB）`、`预留容量（GB）`、`已用容量（GB）`
- 补一句说明：`预留容量是给该云盘预先保留、不允许 everDrive 使用的空间`

在 `frontend/src/components/RemoteCard.tsx`：
- 统一用 `formatGigabytes`

- [ ] **Step 5: 如有 dashboard/其他 remote 容量展示，也统一为 GB**

在相关页面把 remote 容量展示都改成 `GB` 口径，不再用自动单位。

- [ ] **Step 6: 重跑测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-remote-capacity-api.test.ts`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git -C /home/ubuntu/everDrive add frontend/src/lib/format.ts frontend/src/pages/CloudRemotesPage.tsx frontend/src/components/RemoteCard.tsx frontend/src/pages/DashboardPage.tsx frontend/src/lib/api.ts tests/frontend-remote-capacity-api.test.ts
git -C /home/ubuntu/everDrive commit -m "feat: present remote capacity in gigabytes"
```

### Task 5: 全量验证

**Files:**
- Modify: none
- Test: existing suites

- [ ] **Step 1: 运行后端相关测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts tests/rclone-client.test.ts tests/cloud-inventory.service.test.ts`

Expected: PASS

- [ ] **Step 2: 运行前端相关测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts tests/frontend-remote-capacity-api.test.ts`

Expected: PASS

- [ ] **Step 3: 运行构建**

Run: `npm --prefix /home/ubuntu/everDrive run build`

Expected: PASS

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git -C /home/ubuntu/everDrive add -A
git -C /home/ubuntu/everDrive commit -m "fix: improve remote capacity and local path UX"
```

# everDrive UX Capacity And Local Path Fixes Design

## Goal

修复当前影响可用性的 5 个问题：

1. 所有容量输入与展示统一使用 `GB`
2. 本地目录选择器在允许根目录 `/` 时可继续进入任意子目录
3. 新建映射中的 remote 绑定顺序不再暴露难以理解的内部数字 `100`
4. remote 编辑页明确说明“预留容量”的含义
5. remote 显示云盘真实已用容量，而不是仅统计 everDrive 自己记录的文件

## Current Problems

### 1. 容量单位混乱

- 前端 remote 编辑页直接展示 `totalCapacityBytes` / `reservedCapacityBytes`
- remote 卡片和其他位置使用自动换算单位
- 用户需要手工理解“字节”和“GB”的换算，操作成本高

### 2. 根目录浏览只能停留在 `/`

- 后端 `LocalPathService.isAllowed()` 通过 `candidate.startsWith(root + path.sep)` 判断子路径
- 当允许根目录是 `/` 时，拼出来的是 `//`
- 导致 `/etc`、`/usr`、`/home` 等全部被错误判定为越界

### 3. 映射绑定顺序暴露内部实现

- mapping form 直接让用户编辑 `priority`
- 默认值是 `100, 200, 300...`
- 这是内部排序权重，不是用户能理解的业务概念

### 4. 预留容量语义不清

- 当前逻辑会用 `totalCapacity - reservedCapacity - usedCapacity` 计算剩余容量
- 但 UI 没有告诉用户：预留容量是专门从云盘总容量里扣掉、不允许 everDrive 占用的缓冲空间

### 5. 已用容量来源不符合用户预期

- 当前后端通过 `file_locations + files` 汇总已用容量
- 这只代表 everDrive 已登记文件的已用空间
- 用户需要看到的是 remote 云盘本身的真实已用容量

## Chosen Approach

采用单一修复方案，一次性统一 UI 和后端容量来源：

- 前端统一以 `GB` 展示和编辑容量
- 目录浏览修复根目录子路径判定
- 映射绑定只展示“顺序”概念，默认从 `1` 开始
- remote 页面补充“预留容量”帮助文案
- 后端通过 `rclone rcd` 的 `operations/about` 读取 remote 的真实容量数据

## Design

### A. 容量字段统一为 GB

#### UI 规则

- remote 卡片显示：
  - 已用 `X GB`
  - 剩余 `Y GB`
- remote 编辑表单输入：
  - 总容量（GB）
  - 预留容量（GB）
  - 已用容量（GB，只读）
- 仪表盘与其他 remote 容量相关展示也统一为 `GB`

#### 数据规则

- 前端表单内部以字符串形式存 `GB`
- 提交到后端前统一转换成 bytes
- 从后端读回 bytes 后统一转换成 `GB` 字符串显示
- 不改变后端数据库中的 bytes 存储模型

### B. 修复根目录下的本地路径浏览

- `LocalPathService.isAllowed()` 对根目录 `/` 做专门处理
- 允许规则变为：
  - `candidate === root`
  - 或者 `root === '/'`
  - 或者 `candidate.startsWith(root + path.sep)`
- 增加 `/ -> /etc` 这种真实子目录浏览测试

### C. 映射绑定顺序改成用户可理解的顺序号

- 表单文案从“优先级”改成“绑定顺序”
- 默认顺序为 `1, 2, 3...`
- 用户侧只看到顺序号，不再看到 `100`
- 后端排序语义保持“数值越小越靠前”
- 前端提交时直接发送顺序号；现有后端约束已接受正整数，不需要继续放大成 `100`

### D. 解释预留容量

- remote 编辑页在字段旁或表单说明中明确：
  - “预留容量是给该云盘预先保留、不允许 everDrive 使用的空间”
- 剩余容量继续按：
  - `总容量 - 预留容量 - 已用容量`

### E. remote 真实已用容量

#### 新能力

- 在 `IRcloneClient` 中新增 `about(fs)` 或等价方法
- 调用 `operations/about`
- 从返回结果中提取：
  - `used`
  - `total`
  - `free`

#### 列表行为

- `CloudInventoryService.listRemoteCards()` 在列出 remote 时优先请求每个 active remote 的真实容量
- 如果 `rclone about` 成功：
  - `usedCapacityBytes` 使用真实 `used`
  - 如果 remote 的 `totalCapacity` 仍为 0 或未人工维护，可用 rclone 的 `total` 回填显示层
- 如果 `rclone about` 失败：
  - 降级为当前数据库快照
  - health/status 标记维持现有逻辑，不因为单次 about 失败把整个接口打爆

#### 边界

- 某些 remote 可能不支持 `about`
- 这类 remote 仍允许手动维护总容量和预留容量
- 已用容量若无法从 rclone 取得，则退回现有快照值

## Files Expected To Change

- `src/modules/local-path/local-path.service.ts`
- `src/infrastructure/rclone/rclone-rcd-client.ts`
- `src/modules/remote/cloud-inventory.service.ts`
- `frontend/src/pages/CloudRemotesPage.tsx`
- `frontend/src/pages/MappingTasksPage.tsx`
- `frontend/src/components/RemoteCard.tsx`
- `frontend/src/lib/format.ts`
- `frontend/src/lib/api.ts`
- `tests/local-path-browser.api.test.ts`
- `tests/frontend-remote-capacity-api.test.ts`
- remote/rclone 相关测试文件

## Success Criteria

- 用户在目录选择器中从 `/` 能进入 `/etc`、`/usr`、`/home` 等子目录
- remote 页面所有容量输入/展示默认以 `GB` 呈现
- 新建映射页不再出现 `100/200/300` 这种内部排序值
- remote 页面能让用户理解“预留容量”会怎样影响剩余空间
- remote 已用容量优先显示云盘真实已用，而不是恒为 0 的系统内快照

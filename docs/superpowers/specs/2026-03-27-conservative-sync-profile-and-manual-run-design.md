# Conservative Sync Profile And Manual Run Design

## Goal

在保证备份可用的前提下，把自动同步改成更保守、更慢、更不容易触发网盘风控的模式，并允许用户对单个映射手动执行一次完整同步。

## Scope

本次包含三件事：

1. 增加全局保守同步参数
2. 系统设置页中的同步频率真正影响运行中的调度器
3. 每个映射增加“手动同步一次”按钮

## Current Problems

### 1. 同步频率虽然有 UI，但没有真正驱动调度器

- 设置页已有 `defaultScanIntervalSeconds`
- 当前调度器启动时仍直接使用 `.env` 的 `SCAN_INTERVAL_SECONDS`
- 所以 UI 看起来能改，实际运行时不生效

### 2. rclone 传输缺少“保守模式”参数

- 目前 everDrive 传给 `rclone rcd` 的主要是源/目标路径
- 没有明确传 `transfers`、`checkers`、`buffer size`、`TPS`、带宽限制等保守参数
- 对大多数网盘来说，这意味着行为更多取决于 rclone 默认值，不够可控

### 3. 缺少单映射手动执行入口

- 现在映射列表只能启用/停用/删除
- 用户无法对某一个映射立即手动触发一次完整同步

## Chosen Approach

采用全局保守同步配置，不做 per-remote / per-mapping 独立传输参数：

- 新增全局 `syncProfile`
- 系统设置页可以编辑同步频率和保守传输参数
- 自动调度和手动同步都使用同一套 profile
- 每个映射可单独点击“手动同步一次”，立即排一次 `scan -> rename_detect -> sync`

## Design

### A. 全局保守同步参数

新增 settings 配置块：

- `syncProfile.transfers`
- `syncProfile.checkers`
- `syncProfile.bufferSizeMiB`
- `syncProfile.tpsLimit`
- `syncProfile.bwLimitMiB`

默认值使用保守档：

- `transfers = 1`
- `checkers = 1`
- `bufferSizeMiB = 8`
- `tpsLimit = 2`
- `bwLimitMiB = 4`

设计目标：

- 降低并发
- 降低请求密度
- 降低峰值吞吐
- 宁可慢，不追求跑满带宽

### B. 将系统设置页的同步频率真正接入调度器

- 调度器不再只在启动时读取 `.env` 里的 `SCAN_INTERVAL_SECONDS`
- 改为从 `SettingsService` 读取当前 `defaultScanIntervalSeconds`
- 当设置更新后，调度器按新周期生效

本次只要求“设置页的值真正生效”，不要求做到严格无缝热切换；如果实现上更稳妥，可在 settings 更新后重置 scheduler timer。

### C. rclone 请求统一带保守 profile

- 在 rclone client 层新增统一的执行配置注入
- 上传、同步、移动、删除等会使用同一个全局 profile
- 传输参数由 settings 提供，而不是硬编码在调用处

如果某些 rc 方法不支持全部 profile 字段：

- 支持的字段正常下发
- 不支持的字段不强行拼接成错误请求

### D. 映射列表增加“手动同步一次”

#### UI

- 在映射列表每一行操作区新增按钮：`手动同步`
- 点击后：
  - 立即排 `scan`
  - 再排 `rename_detect`
  - 再排 `sync`
- 按钮 pending 时禁用，文案可显示 `正在同步...`

#### 语义

- 手动同步不改变映射启用状态
- 即使自动同步频率很低，手动按钮也能立即执行一次完整流程
- 手动按钮仅针对单个映射，不影响其他映射

### E. 后端入口

有两种可接受实现：

1. 新增单独 API：`POST /api/mapping-tasks/:id/run-sync`
2. 复用 maintenance / queue 逻辑，由 controller 内部顺序 enqueue 三类 job

推荐实现 `1`，语义更清楚。

## Files Expected To Change

- `src/modules/settings/settings.dto.ts`
- `src/modules/settings/settings.service.ts`
- `src/modules/scheduler/auto-sync-scheduler.service.ts`
- `src/infrastructure/rclone/rclone-rcd-client.ts`
- `src/modules/mapping-task/mapping-task.controller.ts`
- `src/server.ts`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/MappingTable.tsx`
- mapping / settings / rclone 相关测试文件

## Success Criteria

- 用户能在 UI 设置自动同步频率，并且运行时真正生效
- 所有自动/手动同步都带上全局保守 profile
- 每个映射都有单独“手动同步一次”按钮
- 手动同步不会改映射启用状态
- 同步默认行为更慢、更保守，而不是继续跑现有隐式默认值

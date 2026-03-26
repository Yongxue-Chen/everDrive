# everDrive / LoomStore 执行进度（续接用）

最后更新：2026-03-26（Phase 18 基础版已落地）

## 1) 当前总体状态
- 技术栈：Node.js + TypeScript + Express + Prisma + **外部 MySQL**
- 云端操作：统一通过 **rclone rcd HTTP API**（未使用 shell copy 作为业务执行路径）
- 已完成阶段：Phase 1 ~ Phase 13（含扫描、哈希、重命名识别、同步策略、冗余、拆分、迁移、异步队列基础能力）
- 当前可用能力：
  - Manual Mapping（本地路径 -> 1 或多 remote）
  - 文件指纹（MD5/SHA1）扫描入库
  - 秒级 rename/move 检测（基于指纹）
  - Archive / Mirror 同步计划与执行
  - 多云冗余（1->N，单 remote 失败隔离、重试）
  - 文件级拆分分发（best-fit）
  - remote-to-remote 迁移（copy 成功后再更新映射）
- 当前验证状态：`npm test`（67/67）通过，后端与前端 `npm run build` 通过

## 2) 已完成阶段与模块
### Phase 1~6（基础与管理）
- 基础设施：
  - `src/config/env.ts`
  - `src/infrastructure/db/database.ts`
  - `src/lib/logger.ts`
  - `src/lib/http-logger.ts`
  - `src/middlewares/*`
  - `src/app/create-app.ts`
  - `src/server.ts`
- rclone：
  - `src/infrastructure/rclone/rclone-rcd-client.ts`
  - `src/infrastructure/rclone/rclone.service.ts`
- Cloud Inventory：
  - `src/modules/remote/*`
- Manual Mapping：
  - `src/modules/mapping-task/*`

### Phase 7（本地扫描与哈希）
- 扫描模块：
  - `src/modules/scan/local-file-scanner.ts`
  - `src/modules/scan/file-hasher.ts`
  - `src/modules/scan/scan.repository.ts`
  - `src/modules/scan/scan.service.ts`
  - `src/modules/scan/scan.controller.ts`
- API：
  - `POST /api/mapping-tasks/:taskId/scan`
- 数据库：
  - `files` 增加 `md5_hash` / `sha1_hash`
  - migration：`20260326173000_files_md5_sha1`

### Phase 8（秒级重命名识别）
- 模块：
  - `src/modules/rename-detect/*`
- API：
  - `POST /api/mapping-tasks/:taskId/detect-renames`
- 行为：
  - 指纹匹配 missing + present
  - 生成 rename 审计日志，标记后续应走云端 `move`

### Phase 9（Archive/Mirror 同步策略引擎）
- 模块：
  - `src/modules/sync/sync-engine.repository.ts`
  - `src/modules/sync/sync-planner.service.ts`
  - `src/modules/sync/sync-executor.service.ts`
  - `src/modules/sync/sync-orchestration.service.ts`
  - `src/modules/sync/sync.controller.ts`
- API：
  - `POST /api/mapping-tasks/:taskId/sync/plan`
  - `POST /api/mapping-tasks/:taskId/sync/execute`
- 计划动作：
  - `uploadActions`
  - `renameActions`
  - `deleteActions`
  - `skipActions`

### Phase 10（多云冗余）
- 模块：
  - `src/modules/redundancy/redundancy-backup.service.ts`
  - `src/modules/redundancy/redundancy.repository.ts`
  - `src/modules/redundancy/redundancy-view.service.ts`
  - `src/modules/redundancy/redundancy-recovery.service.ts`
  - `src/modules/redundancy/redundancy.controller.ts`
- API：
  - `GET /api/mapping-tasks/:taskId/redundancy`
  - `POST /api/mapping-tasks/:taskId/redundancy/retry-failed`
- 行为：
  - 每个 remote 独立结果与落库
  - 失败重试
  - 前端保护等级 DTO

### Phase 11（拆分分发）
- 模块：
  - `src/modules/split/remote-capacity-evaluator.ts`
  - `src/modules/split/split-planner.service.ts`
- 行为：
  - 文件级分发（单文件只落一个 shard remote）
  - best-fit + 优先级 + 阈值保护
  - 容量不足自动换 remote

### Phase 12（迁移任务）
- 模块：
  - `src/modules/migration/migration.repository.ts`
  - `src/modules/migration/migration.service.ts`
  - `src/modules/migration/migration.controller.ts`
- API：
  - `POST /api/mapping-tasks/:taskId/migration`
- 行为：
  - 先 remote->remote copy
  - copy 成功后更新 `file_locations` / `mapping_task_remotes`
  - 可选 `removeSourceReplica`（源副本标记删除）

## 3) 数据库结构要点（MySQL + Prisma）
- 核心表：
  - `files`（含 `md5_hash` / `sha1_hash`）
  - `mapping_tasks`（含 `deleted_at`）
  - `cloud_remotes`
  - `mapping_task_remotes`
  - `file_locations`
  - `sync_jobs`
  - `operation_logs`
- 迁移目录：
  - `prisma/migrations/20260326150000_core_schema`
  - `prisma/migrations/20260326161000_cloud_inventory_health_threshold`
  - `prisma/migrations/20260326164000_mapping_task_soft_delete`
  - `prisma/migrations/20260326173000_files_md5_sha1`

## 4) 关键业务语义（当前实现）
- Archive：
  - 本地新增/变更 -> 上传
  - 本地删除 -> 云端保留（skip）
- Mirror：
  - 本地新增/变更 -> 上传
  - 本地删除 -> 云端删除（带 `deleteGraceSeconds` 防误删）
- Rename：
  - 指纹命中后优先计划云端 move
- 冗余：
  - 同文件多 remote 独立记录，失败不阻塞成功
- 拆分：
  - 单文件单 remote 分发
- 迁移：
  - copy 成功前不改映射，失败保留旧映射

## 5) 当前测试与构建
- `npm test`：通过（含扫描/哈希/rename/sync/redundancy/split/migration）
- `npm run build`：通过

## 6) 下一阶段任务（待做）
### Phase 13：异步任务队列与并发控制（已完成：基础版）
1. Job Queue（scan/sync/rename/migration/remote-stats-refresh）已接入
2. 已支持入队、取消、状态查询（重试机制待下一迭代增强）
3. 并发隔离已实现：
   - remote 维度限流
   - mappingTask 维度互斥
4. Worker 数量可配置，长短任务分池执行
5. 相关接口：
   - `GET /api/jobs/:jobId`
   - `POST /api/jobs/:jobId/cancel`
   - `POST /api/remotes/stats/refresh`
   - `POST /api/mapping-tasks/:taskId/scan`（改为异步入队）
   - `POST /api/mapping-tasks/:taskId/detect-renames`（改为异步入队）
   - `POST /api/mapping-tasks/:taskId/sync/execute`（改为异步入队）
   - `POST /api/mapping-tasks/:taskId/migration`（改为异步入队）

### Phase 14：双视角看板接口（基础版已完成）
1. 工作空间视图（Local-Centric）：
   - `GET /api/dashboard/workspaces`
2. 云盘资源视图（Cloud-Centric）：
   - `GET /api/dashboard/remotes`
3. 聚合查询优化：
   - `groupBy` 聚合文件数/容量
   - 单次窗口函数 SQL 获取每个 mapping task 最新 sync job
   - 批量关联加载 remotes / mapping tasks，避免 N+1
4. 状态规则：
   - `sync_status`（green/yellow/red）已定义并通过 API `rules` 返回
   - `warning_flag` 容量预警规则已定义并通过 API `rules` 返回

### Phase 15（前端基础版已完成）
1. 前端技术栈：
   - React + TypeScript + Vite
   - React Router
   - TanStack Query
2. 已完成页面：
   - Dashboard
   - Mapping Tasks
   - Cloud Remotes
   - Settings
3. 已完成组件：
   - Sidebar
   - StatusCard
   - RemoteCard
   - MappingTable
   - JobStatusPanel
4. 数据接入：
   - 对接 `/api/dashboard/*`, `/api/mapping-tasks`, `/api/remotes`, `/api/jobs/:jobId`
   - 支持 `mock/live` 运行时切换

### Phase 16（设置与配置管理接口：基础版已完成）
1. 后端：
   - `GET /api/settings`
   - `PUT /api/settings`
   - 配置持久化：`runtime/settings.json`
2. 前端：
   - Settings 页面支持查看与修改设置项
   - 显示热更新结果（hot updated / restart required）
3. 敏感字段：
   - 密码返回脱敏 (`passMasked`)
   - 更新密码支持“留空不改”
4. 热更新能力：
   - `logLevel` 立即生效
   - 其余项标记为重启后完整生效

### Phase 17（日志、审计、可观测：基础版已完成）
1. 审计：
   - `GET /api/audit/logs`（按 operationType/targetType/targetId/time range 查询）
   - mapping task create/update/delete、remote sync、settings update 已落审计
2. 系统日志：
   - API 请求日志（http logger）
   - 后台任务日志（job queue enqueue/start/success/fail）
   - rclone 调用日志（request/response/error）
   - 错误堆栈（error logger with err）
3. 可观测：
   - `GET /api/metrics/overview`
   - 指标：queueLength、runningTasks、failedTasks24h、remoteCapacityNearLimitCount、recentSyncSuccessRate

### Phase 18~20（测试补齐、重构、部署文档）
#### Phase 18（测试、种子数据、开发演示：基础版已完成）
1. 测试补齐：
   - 数据库/Repository：`tests/operation-log.repository.test.ts`
   - Service：
     - `tests/sync-planner.test.ts`（rename 计划分支）
     - `tests/rename-detect.service.test.ts`（unmatched 指纹分支）
     - `tests/migration.service.test.ts`（copy 失败回滚分支）
   - rclone client mock：
     - `tests/rclone-client.test.ts`（Basic Auth header 与错误分支）
2. 种子数据：
   - `prisma/seed.ts`
   - 覆盖 remotes / mapping tasks / files / file_locations / sync_jobs
3. 开发体验：
   - `package.json` scripts：
     - `seed`
     - `demo:prepare`
     - `demo:backend`
   - `README.md` 增加 demo 启动流程与数据说明
4. 验证结果：
   - `npm test`：22 files, 67 tests passed
   - `npm run build`（backend）：通过
   - `frontend npm run build`：通过

#### Phase 19~20（待做）
- Phase 19：结构重构与性能优化（模块边界、批量写入、关键查询索引）
- Phase 20：部署文档与生产运行手册（systemd/docker、日志留存、备份恢复）

## 7) 新对话续接指令（复制即可）
请先读取：`/home/ubuntu/everDrive/docs/EXECUTION_STATUS.md`，
然后从 **Phase 13** 继续实现，按阶段输出：
1. 本阶段完成内容
2. 关键代码
3. 目录变更
4. 下一阶段建议

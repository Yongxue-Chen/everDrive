# everDrive (Backend Scaffold)

everDrive 是一个“本地文件夹 -> 多云存储”的同步与管理系统骨架，当前阶段聚焦后端基础设施。

## 技术栈
- Node.js + TypeScript + Express + Prisma(MySQL)

## 已实现基础设施模块
- 配置管理：环境变量读取 + 启动时校验（`src/config/env.ts`）
- 数据库访问层：连接池管理、健康检查、优雅关闭（`src/infrastructure/db/database.ts`）
- Repository 示例：`OperationLogRepository`（`src/infrastructure/repositories/operation-log.repository.ts`）
- 日志模块：`info/warn/error/debug` + `requestId/jobId` 上下文 + `operation_logs` 写入入口（`src/lib/logger.ts`）
- 健康与就绪检查：`GET /health`、`GET /ready`
- 基础异常处理：统一错误结构、404/500 标准化响应

## 快速开始
```bash
cd /home/ubuntu/everDrive
npm install
cp .env.example .env
npm run prisma:generate
npm run dev
```

## 种子数据与演示
### 1) 准备数据库 + 种子
```bash
cd /home/ubuntu/everDrive
npm run demo:prepare
```

### 2) 启动后端（开发模式）
```bash
npm run demo:backend
```

### 3) 启动前端演示（新终端）
```bash
cd /home/ubuntu/everDrive/frontend
npm install
cp .env.example .env
npm run dev
```

前端默认使用 `mock` 数据；可在 Settings 页面切到 `Live API` 对接后端。

### Seed 包含的示例数据
- remotes: `driveA`, `driveB`, `driveC`
- mapping tasks: `Workspace Photos`, `Workspace Docs`
- files: 照片/文档示例文件
- file_locations: 多 remote 副本与失败样例
- sync_jobs: success/failed/queued 样例

## 核心接口
- `GET /health`
- `GET /ready`

## 质量验证
```bash
npm test
npm run build
```

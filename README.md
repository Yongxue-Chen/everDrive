# everDrive

everDrive 是一个“本地目录 -> 多云存储”的同步与管理系统，包含后端服务、前端管理界面、任务调度和基于 `rclone rcd` 的执行引擎。

它适合这样的场景：

- 把服务器上的一个目录同步到一个或多个云盘
- 对每个云盘维护容量、告警阈值和回收站策略
- 在 Web 界面里管理映射任务、云盘、系统设置和任务状态

## 主要能力

- 映射任务管理
  - 本地目录绑定到一个或多个云盘
  - 支持 `archive` / `mirror`
  - 支持冗余、分片、加密
- 云盘管理
  - 手动新增业务 remote，并从已配置的 `rclone remote` 中选择底层绑定
  - 手动维护总容量、预留容量、容量告警阈值
  - 每个云盘单独配置“自建云端回收站”
- 同步执行
  - 扫描
  - rename 检测
  - upload / rename / delete
  - mirror 模式下可将删除改为“移入云端回收站”
- 运维能力
  - 健康检查
  - 任务队列
  - 审计日志
  - 定时自动同步与定时清理回收站

## 技术栈

- 后端：Node.js + TypeScript + Express + Prisma + MySQL
- 前端：React + Vite + TanStack Query
- 执行层：`rclone rcd`

## 目录结构

- `src/`: 后端源码
- `frontend/`: 前端源码
- `prisma/`: 数据模型与迁移
- `tests/`: 后端与前端 API 级测试
- `docker/`: Docker 启动脚本
- `docs/`: 设计、计划、部署等文档

## 运行前提

### 必备组件

- Node.js 18+
- npm
- MySQL
- `rclone`
- 一个常驻的 `rclone rcd` 实例

### 核心依赖关系

1. everDrive 后端依赖 MySQL
2. everDrive 后端依赖 `rclone rcd`
3. 前端通过 HTTP 调后端 API

## 环境变量

后端模板文件在 [`.env.example`](./.env.example)。

常用变量：

- `DATABASE_URL`: MySQL 连接串
- `RCLONE_RCD_URL`: `rclone rcd` 地址
- `RCLONE_RCD_USER` / `RCLONE_RCD_PASS`: `rclone rcd` 认证
- `LOCAL_PATH_ALLOWED_ROOTS`: 本地目录浏览允许的根路径，当前默认是 `/`
- `SCAN_INTERVAL_SECONDS`: 自动扫描/同步调度周期

前端模板文件在 [`frontend/.env.example`](./frontend/.env.example)。

## 快速开始

### 1. 安装后端依赖

```bash
cd /home/ubuntu/everDrive
npm install
cp .env.example .env
```

### 2. 配置数据库和 rclone rcd

按你的环境修改 `.env`，至少确保：

- `DATABASE_URL` 正确
- `RCLONE_RCD_URL`、`RCLONE_RCD_USER`、`RCLONE_RCD_PASS` 正确

### 3. 生成 Prisma Client 并执行迁移

```bash
cd /home/ubuntu/everDrive
npm run prisma:generate
npm run prisma:migrate:deploy
```

### 4. 启动后端

```bash
cd /home/ubuntu/everDrive
npm run dev
```

默认后端端口见 `.env` 中的 `PORT`。

### 5. 启动前端

```bash
cd /home/ubuntu/everDrive/frontend
npm install
cp .env.example .env
npm run dev
```

### 6. 访问

- 前端：`http://localhost:43117` 或 Vite 启动日志里的地址
- 后端健康检查：`http://localhost:43107/health`

## 本地运行并通过 Tailscale 访问

推荐直接执行仓库脚本：

```bash
cd /home/ubuntu/everDrive
bash scripts/run-local-tailscale.sh
```

这个脚本会做这些事：

- 确保后端和前端依赖已安装
- 执行 Prisma generate / migrate
- 构建后端与前端
- 用 `tmux` 分别拉起：
  - `rclone rcd`
  - everDrive 后端
  - everDrive 前端预览服务
- 输出当前 Tailscale 访问地址

默认端口：

- 前端：`43117`
- 后端：`43107`
- `rclone rcd`：`127.0.0.1:5572`

脚本成功后，可直接通过：

- 前端：`http://<tailscale-ip>:43117/`
- 后端健康检查：`http://<tailscale-ip>:43107/health`

如果要查看后台会话：

```bash
tmux ls
tmux attach -t everdrive-backend
tmux attach -t everdrive-frontend
tmux attach -t everdrive-rclone
```

如果要停止：

```bash
tmux kill-session -t everdrive-backend
tmux kill-session -t everdrive-frontend
tmux kill-session -t everdrive-rclone
```

## Docker 方式

```bash
cd /home/ubuntu/everDrive
npm run docker:build
npm run docker:up
```

查看日志：

```bash
cd /home/ubuntu/everDrive
npm run docker:logs
```

停止：

```bash
cd /home/ubuntu/everDrive
npm run docker:down
```

## 首次使用建议流程

### 1. 先确认后端在线

- 打开 `/health`
- 确认数据库和 `rclone rcd` 检查通过

### 2. 打开前端后切到“实时后端”

系统设置页支持切换：

- 模拟数据
- 实时后端

实际使用时请切到“实时后端”。

### 3. 先新增业务云盘

在“云盘列表”页手动新增业务云盘：

- 填写业务名称
- 从当前 `rclone` 已配置的 remote 中选一个底层绑定
- 设置容量、阈值、根路径与回收站策略

### 4. 配置每个云盘

在“云盘列表”页可以设置：

- 总容量
- 预留容量
- 告警阈值
- 是否启用自建云端回收站
- 该云盘的回收站基础路径
- 绑定的底层 `rclone remote`

### 5. 删除业务云盘

业务云盘支持在“云盘列表”页手动删除。删除后会移除该业务 remote 本身以及相关联的映射绑定记录。

### 6. 新建映射任务

在“映射任务管理”页填写：

- 映射名称
- 本地路径
- 同步模式
- 是否加密
- 是否冗余
- 是否分片
- 绑定哪些云盘

## 同步模式说明

### `archive`

- 本地新增/变更会同步到云端
- 本地删除不会删除云端文件

### `mirror`

- 本地新增/变更会同步到云端
- 本地删除会影响云端
- 如果该目标云盘启用了“自建云端回收站”，删除会变成“移入回收站”
- 如果该目标云盘没启用，则仍然直接删除

## 自建云端回收站说明

### 现在的行为

- 回收站开关是“每个云盘单独设置”
- 回收站路径是“每个云盘单独设置”
- 只在 `mirror` 模式删除时生效

### 清空频率

回收站清理由后台定时任务完成，当前默认：

- `cleanupIntervalHours = 24`
- `retentionDays = 30`

也就是：

- 默认每 24 小时尝试清理一次
- 超过 30 天的回收站目录会被清掉

### 用户能不能自己设置频率

可以，但目前是“后端配置已支持、前端页面暂未直接暴露”。

后端设置模型里已经支持：

- `cloudTrash.retentionDays`
- `cloudTrash.cleanupIntervalHours`
- `cloudTrash.maxDeleteBatchPerRun`

当前前端系统设置页还没有单独做这几个输入框，所以如果你要改频率，现阶段需要通过后端设置接口或持久化设置数据来改，而不是在现有 UI 上点选。

换句话说：

- 云盘级“开关 + 路径”已经能在 UI 里配
- 全局“保留天数 + 清理频率 + 单次最大清理数”目前还不是 UI 可配项

## 前端页面说明

### 映射任务管理

用于：

- 新建映射
- 编辑映射
- 启用 / 停用映射
- 删除映射
- 选择服务器本地目录

### 云盘列表

用于：

- 查看云盘状态
- 编辑容量
- 配置单个云盘的自建回收站

### 系统设置

用于：

- 切换前端数据源模式
- 修改后端基础运行参数
- 查看热更新项与需要重启的项

## 常用后端命令

### 开发运行

```bash
cd /home/ubuntu/everDrive
npm run dev
```

### 生成 Prisma Client

```bash
cd /home/ubuntu/everDrive
npm run prisma:generate
```

### 执行迁移

```bash
cd /home/ubuntu/everDrive
npm run prisma:migrate:deploy
```

### 运行测试

```bash
cd /home/ubuntu/everDrive
npm test
```

### 构建后端

```bash
cd /home/ubuntu/everDrive
npm run build
```

### 构建前端

```bash
cd /home/ubuntu/everDrive/frontend
npm run build
```

## 质量验证

建议至少执行：

```bash
cd /home/ubuntu/everDrive
npm test
npm run build

cd /home/ubuntu/everDrive/frontend
npm run build
```

## 相关文档

- 部署说明：[DEPLOYMENT.md](./DEPLOYMENT.md)
- 运维建议：[OPS.md](./OPS.md)
- 后端环境变量模板：[`.env.example`](./.env.example)
- 前端环境变量模板：[`frontend/.env.example`](./frontend/.env.example)

## 当前已知说明

- 本地路径浏览默认允许从系统根目录 `/` 开始
- 云盘级回收站已经支持自动清理
- 如果你希望用户在 Web 页面里直接设置“回收站保留天数 / 清理频率”，还需要继续补系统设置页 UI

# everDrive

everDrive 是一个“本地目录 -> 多云存储”的同步与管理系统。它提供后端 API、前端管理界面、任务队列、自动调度，以及基于 `rclone rcd` 的实际文件执行能力。

典型用途：

- 把服务器上的本地目录同步到一个或多个云盘。
- 在 Web 界面管理云盘、映射任务、容量阈值、任务状态和系统设置。
- 通过 `archive` 或 `mirror` 模式控制云端文件的保留和删除行为。

## 架构和端口

服务组成：

- 后端：Node.js + TypeScript + Express + Prisma。
- 前端：React + Vite。
- 数据库：MySQL。
- 文件执行层：`rclone rcd`。

默认端口：

- 前端：`43117`
- 后端：`43107`
- `rclone rcd`：`5572`
- MySQL：`3306`

后端健康检查：

```bash
curl http://127.0.0.1:43107/health
curl http://127.0.0.1:43107/ready
```

`/health` 会返回服务状态；`/ready` 只有在 MySQL 和 `rclone rcd` 都可用时才返回 200。

## 运行前必须准备什么

无论是否使用 Docker，都需要理解两层 rclone 配置：

1. `rclone remote`

   这是 rclone 自己的云盘配置，例如 `gdrive:`, `onedrive:`, `s3backup:`。everDrive 不替你完成 OAuth 登录或云盘授权，必须先用 `rclone config` 配好至少一个可用 remote。

2. `rclone rcd`

   这是 everDrive 后端调用 rclone 的 HTTP API 服务。后端通过 `RCLONE_RCD_URL`、`RCLONE_RCD_USER`、`RCLONE_RCD_PASS` 连接它。

启动 everDrive 前，至少要满足：

- MySQL 可连接，且目标数据库已创建。
- `rclone rcd` 已启动，账号密码和 `.env` 中一致。
- `rclone rcd` 使用的 rclone 配置里已经有可用 remote。
- 后端 `.env` 中的 `DATABASE_URL`、`RCLONE_RCD_*` 配置正确。
- 如要使用加密功能，`ENCRYPTION_MASTER_KEY` 必须设置为稳定且足够长的随机值，后续不要随意更换。

验证 rclone：

```bash
rclone listremotes
rclone lsd yourRemote:
```

验证 rclone rcd：

```bash
curl -u "admin:change_me" -X POST http://127.0.0.1:5572/core/version
```

把命令中的用户名、密码、地址替换成你的实际配置。

## 环境变量

后端模板：`.env.example`

关键变量：

- `DATABASE_URL`: MySQL 连接串，例如 `mysql://everdrive:pass@127.0.0.1:3306/everdrive`
- `RCLONE_RCD_URL`: rclone RC 地址，例如 `http://127.0.0.1:5572`
- `RCLONE_RCD_USER`: rclone RC Basic Auth 用户
- `RCLONE_RCD_PASS`: rclone RC Basic Auth 密码
- `ENCRYPTION_MASTER_KEY`: 加密功能使用的主密钥
- `LOCAL_PATH_ALLOWED_ROOTS`: 前端本地路径浏览允许访问的根目录，多个目录用逗号分隔
- `SCAN_INTERVAL_SECONDS`: 自动扫描/同步调度间隔，单位秒

前端模板：`frontend/.env.example`

关键变量：

- `VITE_DEFAULT_API_MODE=live`: 默认连接真实后端
- `VITE_DEFAULT_API_MODE=mock`: 默认使用前端模拟数据

## 不使用 Docker 启动

适合本机开发、已有 MySQL/rclone 环境，或希望用 systemd/tmux 自己托管服务的情况。

### 1. 安装依赖

需要：

- Node.js 20+
- npm
- MySQL 8+
- rclone

进入项目：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
npm ci

cd frontend
npm ci
```

### 2. 初始化 MySQL

示例 SQL：

```sql
CREATE DATABASE everdrive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'everdrive'@'%' IDENTIFIED BY 'ChangeThisStrongPassword';
GRANT ALL PRIVILEGES ON everdrive.* TO 'everdrive'@'%';
FLUSH PRIVILEGES;
```

### 3. 配置后端 `.env`

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
cp .env.example .env
```

编辑 `.env`，至少确认：

```env
DATABASE_URL=mysql://everdrive:ChangeThisStrongPassword@127.0.0.1:3306/everdrive
RCLONE_RCD_URL=http://127.0.0.1:5572
RCLONE_RCD_USER=admin
RCLONE_RCD_PASS=change_me
ENCRYPTION_MASTER_KEY=replace_with_a_long_random_secret
LOCAL_PATH_ALLOWED_ROOTS=/home/chandler.yx.chen,/mnt,/data
```

`LOCAL_PATH_ALLOWED_ROOTS` 不建议在生产环境保持为 `/`，否则前端路径浏览可以从系统根目录开始。

### 4. 配置 rclone remote

如果还没有 remote：

```bash
rclone config
```

确认 remote 可用：

```bash
rclone listremotes
rclone lsd yourRemote:
```

### 5. 启动 rclone rcd

用户名和密码必须与 `.env` 中一致：

```bash
rclone rcd \
  --rc-addr=127.0.0.1:5572 \
  --rc-user=admin \
  --rc-pass=change_me
```

另开一个终端验证：

```bash
curl -u "admin:change_me" -X POST http://127.0.0.1:5572/core/version
```

### 6. 迁移数据库并启动后端

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm start
```

开发模式可以用：

```bash
npm run dev
```

### 7. 启动前端

```bash
cd /home/chandler.yx.chen/services-lab/everDrive/frontend
cp .env.example .env
npm run dev
```

访问：

- 前端：`http://127.0.0.1:43117`
- 后端：`http://127.0.0.1:43107/health`

Vite 开发服务器会把 `/api` 代理到 `http://127.0.0.1:43107`。如果后端不在这个地址，设置：

```bash
EVERDRIVE_API_PROXY_TARGET=http://127.0.0.1:43107 npm run dev
```

### 8. Tailscale/tmux 一键脚本

仓库提供了：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
bash scripts/run-local-tailscale.sh
```

脚本会安装依赖、迁移数据库、构建前后端，并用 tmux 启动：

- `everdrive-rclone`
- `everdrive-backend`
- `everdrive-frontend`

脚本会读取根目录 `.env`，并用其中的 `RCLONE_RCD_USER` 和 `RCLONE_RCD_PASS` 启动 `rclone rcd`。默认监听地址是 `127.0.0.1:5572`；如果需要改监听地址，可以额外设置：

```env
RCLONE_RCD_ADDR=127.0.0.1:5572
```

同时要保证：

```env
RCLONE_RCD_URL=http://127.0.0.1:5572
RCLONE_RCD_USER=admin
RCLONE_RCD_PASS=change_me
```

`RCLONE_RCD_URL` 是后端连接地址，`RCLONE_RCD_ADDR` 是脚本启动 rclone 时传给 `--rc-addr` 的监听地址。两者端口必须一致。

查看 tmux 会话：

```bash
tmux ls
tmux attach -t everdrive-backend
tmux attach -t everdrive-frontend
tmux attach -t everdrive-rclone
```

停止：

```bash
tmux kill-session -t everdrive-backend
tmux kill-session -t everdrive-frontend
tmux kill-session -t everdrive-rclone
```

## 使用 Docker 启动

Docker Compose 会启动四个服务：

- `mysql`
- `rclone`
- `backend`
- `frontend`

### 1. 准备 `.env`

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
cp .env.example .env
```

建议至少改掉这些默认值：

```env
MYSQL_ROOT_PASSWORD=replace_with_strong_root_password
MYSQL_PASSWORD=replace_with_strong_app_password
RCLONE_RCD_USER=admin
RCLONE_RCD_PASS=replace_with_strong_rclone_password
ENCRYPTION_MASTER_KEY=replace_with_a_long_random_secret
FRONTEND_PORT=43117
BACKEND_PORT=43107
RCLONE_RCD_PORT=5572
```

如果使用 Compose 内置 MySQL，通常不需要手写 `DATABASE_URL`，默认会指向 `mysql:3306`。如果你在 `.env` 里覆盖了 `DATABASE_URL`，要确认容器内能访问这个地址。

### 2. 启动 MySQL 和 rclone

```bash
docker compose up -d mysql rclone
```

### 3. 在 Docker rclone 容器里配置 remote

Docker Compose 使用名为 `rclone_config` 的数据卷保存 rclone 配置。首次启动后需要进入 rclone 容器配置 remote：

```bash
docker compose exec rclone rclone config
docker compose exec rclone rclone listremotes
docker compose exec rclone rclone lsd yourRemote:
```

如果你的云盘 OAuth 需要浏览器授权，按 rclone 的提示在有浏览器的机器上完成授权，再把 token 填回容器里的交互流程。

验证 rclone rcd：

```bash
curl -u "$RCLONE_RCD_USER:$RCLONE_RCD_PASS" -X POST http://127.0.0.1:5572/core/version
```

### 4. 启动后端和前端

```bash
docker compose build
docker compose up -d
```

访问：

- 前端：`http://127.0.0.1:43117`
- 后端健康检查：`http://127.0.0.1:43107/health`
- 后端就绪检查：`http://127.0.0.1:43107/ready`

### 5. Docker 常用命令

```bash
docker compose ps
docker compose logs -f
docker compose logs -f backend
docker compose restart backend
docker compose down
```

谨慎使用下面命令，它会删除 MySQL 和 rclone 配置数据卷：

```bash
docker compose down -v
```

## 首次使用流程

1. 确认 `/ready` 返回 200。

2. 打开前端，并在系统设置里确认数据源是“实时后端”。

3. 在“云盘列表”中新增业务云盘。

   业务云盘是 everDrive 内部管理的 remote 记录。新增时需要从已有的 rclone remote 中选择底层绑定，并填写显示名称、容量、预留容量、告警阈值、remote 根路径和回收站策略。

4. 在“映射任务管理”中新建映射任务。

   需要填写本地路径、同步模式、是否加密、是否冗余、是否分片，以及绑定哪些业务云盘。

5. 手动触发同步或等待自动调度。

## 同步模式

`archive`：

- 本地新增或变更会上传到云端。
- 本地删除不会删除云端文件。

`mirror`：

- 本地新增或变更会上传到云端。
- 本地删除会同步到云端。
- 如果目标云盘启用了自建云端回收站，删除会变成移入回收站。
- 如果目标云盘没有启用回收站，则会直接删除云端文件。

## 自建云端回收站

回收站是按云盘单独配置的，主要字段：

- 是否启用回收站。
- 回收站基础路径，默认 `.everdrive-trash`。

当前行为：

- 只在 `mirror` 模式处理云端删除时生效。
- 默认后台定时清理超过保留期的回收站目录。
- 全局保留天数、清理间隔、单次最大删除量后端已支持，现有前端未完整暴露所有输入项。

## 常用开发命令

后端：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
npm run dev
npm run build
npm test
npm run prisma:generate
npm run prisma:migrate:deploy
```

前端：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive/frontend
npm run dev
npm run build
```

Docker：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
npm run docker:build
npm run docker:up
npm run docker:logs
npm run docker:down
```

## 故障排查

### `/ready` 返回 503

通常是 MySQL 或 rclone rcd 不可用。

检查 MySQL：

```bash
npm run prisma:migrate:deploy
```

检查 rclone rcd：

```bash
curl -u "$RCLONE_RCD_USER:$RCLONE_RCD_PASS" -X POST "$RCLONE_RCD_URL/core/version"
```

### 前端能打开，但接口失败

- 非 Docker 开发模式：确认 Vite 代理目标 `EVERDRIVE_API_PROXY_TARGET` 指向后端。
- Docker 模式：确认 `frontend/docker/nginx.default.conf` 中 `/api/` 能访问 `backend:43107`。
- 确认前端数据源模式不是 `mock`。

### 云盘列表为空

- 先确认 `rclone listremotes` 有结果。
- Docker 模式下要在 rclone 容器里执行 `docker compose exec rclone rclone listremotes`。
- 在前端“云盘列表”中新增业务云盘，并选择已存在的 rclone remote。

### 本地路径无法选择

检查 `LOCAL_PATH_ALLOWED_ROOTS`。后端只允许浏览这些根目录下面的路径。

### Docker 后端反复重启

查看日志：

```bash
docker compose logs -f backend
```

常见原因：

- MySQL 未就绪。
- `DATABASE_URL` 写错。
- 数据库用户没有权限。
- Prisma 迁移失败。

## 相关文档

- 部署说明：`DEPLOYMENT.md`
- 运维建议：`OPS.md`
- rclone 客户端示例：`docs/rclone-client-examples.md`
- 映射任务 API 示例：`docs/manual-mapping-api-examples.md`

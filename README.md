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
- 数据库：远端 MySQL，例如 Oracle Cloud MySQL、云厂商托管 MySQL，或你已经部署好的 MySQL。
- 文件执行层：`rclone rcd`。

默认端口：

- 前端：`43117`
- 后端：`43107`
- `rclone rcd`：`5572`
- MySQL：通常是远端数据库的 `3306`，以你的云端数据库实际地址和端口为准。

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

- 远端 MySQL 可连接，且目标数据库已创建。
- 远端 MySQL 用户有建表、迁移、读写权限。
- 当前机器或 Docker 容器所在网络能访问远端 MySQL 地址和端口；云厂商安全组、防火墙、白名单需要放行。
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

- `DATABASE_URL`: 远端 MySQL 连接串，例如 `mysql://everdrive:pass@your-cloud-mysql-host:3306/everdrive`
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

适合本机开发、连接云端 MySQL，并在当前机器上用 systemd/tmux 自己托管后端、前端和 `rclone rcd` 的情况。

### 1. 安装依赖

需要：

- Node.js 20+
- npm
- rclone
- 一个可访问的远端 MySQL 8+ 数据库，例如 Oracle Cloud MySQL

进入项目：

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
npm ci

cd frontend
npm ci
```

### 2. 准备远端 MySQL

在云端 MySQL 中提前创建数据库和用户。示例 SQL：

```sql
CREATE DATABASE everdrive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'everdrive'@'%' IDENTIFIED BY 'ChangeThisStrongPassword';
GRANT ALL PRIVILEGES ON everdrive.* TO 'everdrive'@'%';
FLUSH PRIVILEGES;
```

如果你使用的是 Oracle Cloud、RDS、PolarDB 或其他托管数据库，也可以在控制台创建数据库和账号。关键是最终拿到可从当前机器访问的主机名、端口、用户名、密码和数据库名。

需要确认：

- 云数据库安全组或访问控制允许当前机器 IP 连接。
- 数据库监听端口通常是 `3306`。
- 用户有执行 Prisma migration 所需的 DDL 权限。

### 3. 配置后端 `.env`

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
cp .env.example .env
```

编辑 `.env`，至少确认：

```env
DATABASE_URL=mysql://everdrive:ChangeThisStrongPassword@your-cloud-mysql-host:3306/everdrive
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

Docker Compose 主要启动三个应用侧服务：

- `rclone`
- `backend`
- `frontend`

仓库里仍保留了 `mysql` 服务，方便临时本地测试；但常规部署建议使用你的云端 MySQL，不需要启动 Compose 里的 `mysql`。

### 1. 准备 `.env`

```bash
cd /home/chandler.yx.chen/services-lab/everDrive
cp .env.example .env
```

建议至少改掉这些默认值：

```env
DATABASE_URL=mysql://everdrive:replace_with_strong_app_password@your-cloud-mysql-host:3306/everdrive
DOCKER_RCLONE_RCD_URL=http://rclone:5572
RCLONE_RCD_USER=admin
RCLONE_RCD_PASS=replace_with_strong_rclone_password
ENCRYPTION_MASTER_KEY=replace_with_a_long_random_secret
FRONTEND_PORT=43117
BACKEND_PORT=43107
RCLONE_RCD_PORT=5572
```

注意：如果直接从 `.env.example` 复制，里面的 `DATABASE_URL` 是非 Docker 本地示例，指向 `127.0.0.1`。Docker 模式连接云端数据库时，必须把它改成云数据库地址：

```env
DATABASE_URL=mysql://user:password@your-cloud-mysql-host:3306/everdrive
```

Docker 模式使用独立的 `DOCKER_RCLONE_RCD_URL`，避免本机运行使用的 `RCLONE_RCD_URL=http://127.0.0.1:5572` 被 Compose 继承后指向错误容器：

```env
DOCKER_RCLONE_RCD_URL=http://rclone:5572
DATA_ROOT=/你的/NAS/共享目录
DOCKER_LOCAL_PATH_ALLOWED_ROOTS=/data
```

Compose 会将 `DATA_ROOT` 只读挂载到 backend 和 rclone 容器内相同的 `/data` 路径。映射任务应选择 `/data` 下的目录。加密任务使用的临时目录通过 `everdrive_tmp` 数据卷在 backend 和 rclone 之间共享。

MySQL、backend 和 rclone RC 默认只绑定宿主机 `127.0.0.1`；前端仍监听所有网络接口。只有明确需要从其他机器直接访问内部服务时，才覆盖对应的 `MYSQL_BIND_ADDRESS`、`BACKEND_BIND_ADDRESS` 或 `RCLONE_BIND_ADDRESS`。

### 空白主机和 NAS 准备

设备只需要预先安装 Docker 与 Docker Compose。首次启动前创建默认数据目录并准备配置：

```bash
mkdir -p data
cp .env.example .env
```

默认会把项目下的 `./data` 挂载为容器内 `/data`。NAS 上建议在 `.env` 中把 `DATA_ROOT` 改成实际共享目录的绝对路径，并确保 Docker 对该目录有读取权限。不要把 `DOCKER_LOCAL_PATH_ALLOWED_ROOTS` 改成宿主机路径；映射任务统一选择容器内的 `/data/...`。

当前 Web 界面尚未提供应用登录。前端端口只应在可信局域网、VPN 或带鉴权的反向代理后访问，不要直接暴露到公网。

### 飞牛 fnOS 部署

1. 在飞牛应用中心安装 Docker；也可以安装 Portainer 后创建 Compose Stack。
2. 将仓库或发布包放到持久化目录，并复制 `.env.example` 为 `.env`。
3. 设置 `DATA_ROOT` 为飞牛共享文件夹的实际宿主机路径。
4. 确认设备架构可用；默认 rclone 镜像支持 `amd64` 和 `arm64`。
5. 启动 Stack 后，在 rclone 容器控制台执行 `rclone config` 完成云盘授权。
6. 在 everDrive 映射任务中选择 `/data` 下的容器路径。

升级或重建容器时必须保留 `mysql_data`、`rclone_config` 和 `everdrive_tmp` 数据卷。

### 2. 启动 rclone

```bash
docker compose up -d rclone
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
curl -u "$RCLONE_RCD_USER:$RCLONE_RCD_PASS" -X POST "http://127.0.0.1:${RCLONE_RCD_PORT:-5572}/core/version"
```

### 4. 启动后端和前端

```bash
docker compose build
docker compose up -d backend frontend
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

谨慎使用下面命令，它会删除 rclone 配置数据卷；如果你启动过 Compose 内置 `mysql`，也会删除本地测试数据库数据卷：

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
docker compose up -d rclone backend frontend
npm run docker:logs
npm run docker:down
```

`npm run docker:up` 会执行 `docker compose up -d`，会把 Compose 文件里的本地测试 `mysql` 服务也一起拉起。使用云端数据库时，建议显式启动 `rclone backend frontend`。

## 故障排查

### `/ready` 返回 503

通常是远端 MySQL 或 rclone rcd 不可用。

检查远端 MySQL 连接串和迁移权限：

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

- 云端 MySQL 地址、端口、用户名或密码写错。
- 云端数据库安全组、防火墙或白名单没有放行当前机器/容器出口 IP。
- 数据库用户没有迁移或读写权限。
- Prisma 迁移失败。

## 相关文档

- 部署说明：`DEPLOYMENT.md`
- 运维建议：`OPS.md`
- rclone 客户端示例：`docs/rclone-client-examples.md`
- 映射任务 API 示例：`docs/manual-mapping-api-examples.md`

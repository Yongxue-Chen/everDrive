# everDrive 部署文档（本地 + Docker）

本文档覆盖两种方式：
1. 本地部署（外部 MySQL + 系统预装 rclone + rclone rcd 常驻 + 前后端分离）
2. Docker 部署（docker compose）

## 1. 环境变量说明

后端环境变量文件：`/home/ubuntu/everDrive/.env`

### 1.1 应用基础
- `NODE_ENV`: `development | test | production`
- `PORT`: 后端监听端口，默认 `43107`
- `LOG_LEVEL`: `fatal|error|warn|info|debug|trace`

### 1.2 数据库
- `DATABASE_URL`: `mysql://user:pass@host:3306/everdrive`

### 1.3 rclone rcd
- `RCLONE_RCD_URL`: 例如 `http://127.0.0.1:5572`
- `RCLONE_RCD_USER`: rcd Basic Auth 用户
- `RCLONE_RCD_PASS`: rcd Basic Auth 密码
- `RCLONE_HTTP_TIMEOUT_MS`
- `RCLONE_RETRY_ATTEMPTS`
- `RCLONE_RETRY_DELAY_MS`

### 1.4 同步与并发
- `SCAN_BATCH_SIZE`
- `SCAN_INTERVAL_SECONDS`（自动调度周期，秒）
- `SYNC_CONCURRENCY`
- `RCLONE_CONCURRENCY`
- `JOB_WORKER_CONCURRENCY`
- `JOB_SHORT_WORKER_CONCURRENCY`
- `JOB_REMOTE_CONCURRENCY_LIMIT`

### 1.5 安全
- `ENCRYPTION_MASTER_KEY`（生产必须配置）

### 1.6 Docker 相关（可选）
- `MYSQL_ROOT_PASSWORD`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `DATA_ROOT`：宿主机或 NAS 上需要同步的数据根目录
- `DOCKER_LOCAL_PATH_ALLOWED_ROOTS`：容器内允许选择的路径，默认 `/data`
- `MYSQL_BIND_ADDRESS`：默认 `127.0.0.1`
- `MYSQL_PORT`
- `RCLONE_RCD_PORT`
- `RCLONE_IMAGE`：固定的 rclone 容器镜像，默认 `rclone/rclone:1.73.2`
- `RCLONE_BIND_ADDRESS`：默认 `127.0.0.1`
- `DOCKER_RCLONE_RCD_URL`：默认 `http://rclone:5572`
- `BACKEND_PORT`
- `BACKEND_BIND_ADDRESS`：默认 `127.0.0.1`
- `FRONTEND_PORT`
- `VITE_DEFAULT_API_MODE`
- `DB_MIGRATE_MAX_RETRIES`
- `DB_MIGRATE_RETRY_DELAY_SECONDS`

## 2. 本地部署说明

## 2.1 前置条件
- Node.js 20+
- npm
- 外部 MySQL 可连接
- 系统已安装 `rclone`

## 2.2 MySQL 初始化
```sql
CREATE DATABASE everdrive CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'everdrive'@'%' IDENTIFIED BY 'ChangeThisStrongPassword';
GRANT ALL PRIVILEGES ON everdrive.* TO 'everdrive'@'%';
FLUSH PRIVILEGES;
```

## 2.3 启动 rclone rcd（常驻）

前台示例：
```bash
rclone rcd \
  --rc-addr=127.0.0.1:5572 \
  --rc-user=admin \
  --rc-pass='ChangeThisRclonePass'
```

systemd 示例（推荐）：
`/etc/systemd/system/rclone-rcd.service`
```ini
[Unit]
Description=Rclone RCD Service
After=network.target

[Service]
Type=simple
User=ubuntu
ExecStart=/usr/bin/rclone rcd --rc-addr=127.0.0.1:5572 --rc-user=admin --rc-pass=ChangeThisRclonePass
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

启动：
```bash
sudo systemctl daemon-reload
sudo systemctl enable rclone-rcd
sudo systemctl start rclone-rcd
sudo systemctl status rclone-rcd
```

## 2.4 后端部署
```bash
cd /home/ubuntu/everDrive
npm ci
cp .env.example .env
# 编辑 .env：DATABASE_URL、RCLONE_RCD_*、ENCRYPTION_MASTER_KEY
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
npm start
```

生产建议用 systemd 托管后端：
`/etc/systemd/system/everdrive-backend.service`
```ini
[Unit]
Description=everDrive Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/everDrive
EnvironmentFile=/home/ubuntu/everDrive/.env
ExecStart=/usr/bin/node /home/ubuntu/everDrive/dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 2.5 前端部署（分离）
```bash
cd /home/ubuntu/everDrive/frontend
npm ci
cp .env.example .env
npm run build
```

将 `frontend/dist` 部署到 Nginx 静态目录，`/api` 反向代理到后端。

Nginx 示例：
```nginx
server {
  listen 80;
  server_name your-domain.com;

  root /home/ubuntu/everDrive/frontend/dist;
  index index.html;

  location / {
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:43107;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 3. Docker 部署说明

## 3.1 已提供文件
- `/home/ubuntu/everDrive/docker-compose.yml`
- `/home/ubuntu/everDrive/Dockerfile.backend`
- `/home/ubuntu/everDrive/docker/backend-entrypoint.sh`
- `/home/ubuntu/everDrive/frontend/Dockerfile.frontend`
- `/home/ubuntu/everDrive/frontend/docker/nginx.default.conf`

## 3.2 一键启动（含 mysql + rclone + backend + frontend）
先在 `.env` 中设置 NAS 数据根目录：

```env
DATA_ROOT=/mnt/storage
DOCKER_LOCAL_PATH_ALLOWED_ROOTS=/data
DOCKER_RCLONE_RCD_URL=http://rclone:5572
```

`DATA_ROOT` 会只读挂载到 backend 和 rclone 的 `/data`。映射任务必须使用容器内路径，例如 `/data/photos`。加密同步产生的临时文件通过共享的 `everdrive_tmp` 数据卷交给 rclone 上传。该卷在 backend 和 rclone 中均为可写，用于远程 SMB/SFTP 来源启用加密时的临时下载；请确保磁盘空间足够。

```bash
cd /home/ubuntu/everDrive
docker compose build
docker compose up -d
```

访问：
- 前端：`http://localhost:43117`
- 后端：`http://localhost:43107/health`

## 3.3 使用外部 MySQL / 外部 rclone（Docker 仅跑前后端）

先在 shell 或 `.env` 里覆盖：
```bash
export DATABASE_URL='mysql://everdrive:pass@<external-mysql>:3306/everdrive'
export DOCKER_RCLONE_RCD_URL='http://<external-rclone-host>:5572'
export RCLONE_RCD_USER='admin'
export RCLONE_RCD_PASS='ChangeThisRclonePass'
```

然后仅启动应用容器：
```bash
docker compose up -d backend frontend
```

## 3.4 Web rclone 配置中心

侧边栏“rclone 配置”页面支持 provider 元数据驱动的配置表单、remote 创建/编辑、连接测试和删除。已被 everDrive 业务云盘绑定的 rclone remote 不允许删除。OAuth 交互授权仍通过 `docker compose exec rclone rclone config` 完成。后端不会接受浏览器传入的任意 rclone RC 方法名。

## 3.5 常用命令
```bash
# 查看日志
docker compose logs -f

# 重启某个服务
docker compose restart backend

# 停止并删除容器
docker compose down

# 停止并删除容器 + 数据卷（谨慎）
docker compose down -v
```

## 3.6 飞牛 fnOS / Portainer 部署

飞牛设备只需要安装 Docker，推荐通过 Docker Compose 或 Portainer Stack 部署：

1. 将项目放入飞牛持久化目录，并复制 `.env.example` 为 `.env`。
2. 将 `DATA_ROOT` 设置为飞牛共享文件夹的实际宿主机路径，例如 `/vol1/1000/photos`；实际路径以飞牛界面显示为准。
3. 保持 `DOCKER_LOCAL_PATH_ALLOWED_ROOTS=/data`。everDrive 中创建映射时选择 `/data/...`，不要填写宿主机路径。
4. 确认 Docker 服务账号对 `DATA_ROOT` 有读取权限。
5. 启动后进入 rclone 容器控制台执行 `rclone config`。
6. 保留 `mysql_data`、`rclone_config` 和 `everdrive_tmp` 数据卷，以免升级时丢失数据库、云盘授权或进行中的加密临时文件。

默认 rclone 镜像同时支持 `amd64` 和 `arm64`。如飞牛设备使用其他架构，部署前应检查所有镜像的架构支持。

当前前端没有应用级登录鉴权。只应在可信局域网、VPN 或带鉴权的反向代理后访问，不能直接暴露到公网。MySQL、backend 和 rclone RC 默认只绑定宿主机 `127.0.0.1`。

## 4. 开发环境运行说明

后端：
```bash
cd /home/ubuntu/everDrive
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

前端：
```bash
cd /home/ubuntu/everDrive/frontend
npm install
cp .env.example .env
npm run dev
```

## 5. 生产环境建议
- Node.js 使用 LTS（20+）。
- 构建使用 `npm ci`。
- 后端、rclone rcd 使用 systemd 或容器编排托管，设置自动重启。
- API 建议只暴露在内网，由网关统一出口。
- MySQL 做每日备份 + 恢复演练。
- 发布前固定执行：`npm test && npm run build`。

## 6. 安全建议
- `ENCRYPTION_MASTER_KEY` 必须通过密钥系统注入。
- `RCLONE_RCD_PASS` 使用高强度随机密码。
- rclone rcd 尽量绑定 `127.0.0.1`，避免公网暴露。
- 前后端入口强制 HTTPS。
- 防火墙只放行必要端口（80/443；数据库和 rclone 走内网）。

## 7. 故障排查指南

## 7.1 后端启动失败
1. 检查 `.env` 是否缺少 `DATABASE_URL`、`RCLONE_RCD_*`。
2. 检查数据库网络连通和账号权限。
3. 检查后端日志：
```bash
journalctl -u everdrive-backend -n 200 --no-pager
# 或 docker compose logs -f backend
```

## 7.2 `/ready` 返回 503
1. MySQL 不可达。
2. rclone rcd 不可达或鉴权失败。
3. 检查：
```bash
curl -u "$RCLONE_RCD_USER:$RCLONE_RCD_PASS" "$RCLONE_RCD_URL/core/version"
```

## 7.3 前端打开但 API 失败
1. 检查 Nginx（或容器内 Nginx）`/api` 代理目标。
2. 检查后端端口是否正确。
3. 检查浏览器 Network 响应码（404/502/504）。

## 7.4 Docker 启动后 backend 循环重启
1. 查看日志确认是否数据库未就绪或连接串错误。
2. 确认 `DATABASE_URL` 和 `DB_MIGRATE_MAX_RETRIES` 配置。
3. 确认 MySQL 已创建目标库并允许访问。

# everDrive

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-orange.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](package.json)
[![Docker Compose](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

**中文** | [English](README.en.md)

everDrive 是一个自托管的「本地目录 → 多云存储」同步与管理系统，基于 [rclone](https://rclone.org/) 构建。它把手写 cron + rclone 命令行脚本变成一个有 Web 界面、任务队列、自动调度、多云冗余和加密能力的完整应用。

## 定位：本地为主，云端只是备份

everDrive 的模型里，**本地目录才是数据的主体，云盘只是异地容灾备份**，用来防止本地磁盘损坏、误删除、NAS 故障等情况导致数据彻底丢失。

- 日常访问和同步文件本身，建议直接通过局域网、[Tailscale](https://tailscale.com/) 这类组网工具访问本地目录，而不是绕道云盘——延迟更低，也不受云厂商带宽/限流影响。
- 云盘只有在本地目录出问题时才需要真正派上用场：everDrive 提供冗余恢复、加密恢复、数据恢复等页面，把云端保存的副本按原始目录结构恢复回本地。
- 正因为这个定位，everDrive 更适合直接安装在 **NAS** 上，或者安装在一台专门的**管理服务器**上——由这台服务器去连接局域网内其他设备（例如另一台 NAS、SMB/SFTP 来源）的本地目录，统一把这些目录备份到云盘，而不是把它当成一个云端优先的网盘客户端。

## 为什么选择 everDrive

- **不止是同步脚本**：Web 界面管理云盘、映射任务、容量阈值、任务状态和系统设置，不需要记命令行参数。
- **多云而不是单云**：把同一份数据冗余备份到多个云盘，或者按容量把大文件集合分片存放到不同云盘。
- **上传前加密**：AES-256-GCM 加密后再上传，云盘服务商看不到明文内容。
- **archive / mirror 两种语义**：清楚区分「只增量归档」和「本地删除也同步删除」，避免误删。
- **完全自托管**：数据留在你自己的服务器和你自己选择的云盘账号里，没有第三方中转。

## 界面预览

前端提供云盘列表、映射任务管理、任务队列、容量与健康监控、rclone remote 配置中心、冗余恢复和加密文件恢复等页面。完整截图和交互说明见[用户手册](docs/USER_GUIDE.md)。

## 功能概览

| 能力 | 状态 |
| --- | --- |
| 本地目录扫描、MD5/SHA1 校验 | 已支持 |
| SMB/SFTP 局域网只读来源 | 已支持；可直接传输，mirror 仅影响目标云盘 |
| 自动同步和手动同步 | 已支持 |
| Archive 归档模式 | 已支持，本地删除不会删除云端副本 |
| Mirror 镜像模式 | 已支持，可配合自建云端回收站 |
| 多云冗余备份 | 已支持；提供冗余恢复页面 |
| 多云容量分片 | 已支持；每个文件完整存放在一个云盘 |
| 上传前 AES-256-GCM 加密 | 已支持；提供加密文件恢复页面 |
| 本地重命名识别与云端移动 | 已支持 |
| 云盘容量、健康检查和告警 | 已支持 |
| 云端迁移 | 已支持；提供专用 Web 页面 |
| rclone remote 配置中心 | 已支持；复杂 OAuth 仍可能需要容器命令行 |
| Docker、NAS、飞牛 fnOS 部署 | 已支持 |
| 应用登录和多用户权限 | 暂未支持，仅适合可信内网 |

## 架构

```
浏览器 ──▶ 前端 (React + Vite)
              │  /api
              ▼
         后端 (Node.js + TypeScript + Express + Prisma)
              │                       │
              ▼                       ▼
        远端 MySQL 8+          rclone rcd (HTTP API) ──▶ 各云盘 remote
```

默认端口：前端 `43117`、后端 `43107`、`rclone rcd` `5572`、MySQL 通常为远端数据库的 `3306`。

后端健康检查：

```bash
curl http://127.0.0.1:43107/health   # 服务是否存活
curl http://127.0.0.1:43107/ready    # MySQL 和 rclone rcd 都可用才返回 200
```

## 快速开始（Docker）

需要 Docker 与 Docker Compose，以及一个可访问的远端 MySQL 8+（推荐；仓库也提供本地测试用的 `mysql` 服务）。

```bash
git clone https://github.com/Yongxue-Chen/everDrive.git
cd everDrive
cp .env.example .env
# 编辑 .env：至少设置 DATABASE_URL、RCLONE_RCD_USER/PASS、ENCRYPTION_MASTER_KEY

docker compose up -d rclone
docker compose exec rclone rclone config          # 配置至少一个可用的云盘 remote

docker compose build
docker compose up -d backend frontend
```

访问 `http://127.0.0.1:43117`，在系统设置中确认数据源为「实时后端」，然后在「云盘列表」新增业务云盘、在「映射任务管理」新建同步任务。

> 当前 Web 界面没有应用登录或多用户权限。仅在可信内网、VPN（如 Tailscale）或带鉴权的反向代理后使用，不要直接暴露到公网。

**不使用 Docker（本机 / systemd 托管）**、NAS 和飞牛 fnOS 部署的完整步骤，见 [部署文档](DEPLOYMENT.md)。

## 文档导航

- [用户手册](docs/USER_GUIDE.md)（简体中文）/ [User Guide](docs/USER_GUIDE.en.md)（English）— 核心概念、首次同步流程、当前限制
- [部署文档](DEPLOYMENT.md) — 本地部署、Docker、NAS、飞牛 fnOS、生产环境建议
- [运维建议](OPS.md) — 监控告警、备份、容量治理、应急处置
- [rclone 客户端示例](docs/rclone-client-examples.md)
- [映射任务 API 示例](docs/manual-mapping-api-examples.md)

## 常用开发命令

```bash
npm run dev                    # 后端开发模式
npm test                       # 后端测试
npm run build                  # 后端构建

cd frontend && npm run dev     # 前端开发模式
cd frontend && npm run build   # 前端构建

npm run docker:build           # 构建 Docker 镜像
docker compose up -d rclone backend frontend
npm run docker:logs
npm run docker:down
```

## 安全须知

- 当前 Web 界面没有应用登录或多用户权限，请勿把前端、后端或 `rclone rcd` 端口直接暴露到公网；仅在可信内网、VPN 或带鉴权的反向代理后使用。
- `.env`、真实密钥、`ENCRYPTION_MASTER_KEY` 等敏感信息不应提交到仓库；仓库只提供 `.env.example` 模板。
- 如果你发现安全漏洞，请不要直接提公开 Issue，通过仓库所有者的 GitHub 个人主页联系方式私下报告。

## 贡献

欢迎提交 Issue 和 Pull Request。提交代码前请确保通过：

```bash
npm test
cd frontend && npm run build
```

功能性改动建议先开 Issue 讨论方案，再提交 PR。

## License

本项目基于 [PolyForm Noncommercial License 1.0.0](LICENSE) 提供源代码。

简要含义（不构成法律意见，以 LICENSE 全文为准）：

- 允许个人、学习、研究、测试、爱好项目等**非商业用途**自由使用、修改和分发。
- 慈善组织、教育机构、公共科研机构等非营利/公共机构可视为非商业用途使用。
- **禁止任何形式的商业使用**；如需商用，请联系作者单独获取商业授权。
- 分发本项目或其修改版本时，必须保留 LICENSE 全文以及其中的 `Required Notice` 版权声明。
- 不提供任何担保；作者不对使用本软件造成的损失负责。
- 该协议不是 OSI/FSF 认可的"开源许可证"，属于源码可见（source-available）协议。

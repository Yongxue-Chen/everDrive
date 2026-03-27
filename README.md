# everDrive

everDrive 是一个“本地文件夹 -> 多云存储”的同步与管理系统。

支持两种部署方式：
- 本地部署（Node.js + 外部 MySQL + 常驻 rclone rcd）
- Docker 部署（`docker compose` 一键启动前后端与依赖）

## 技术栈
- Backend: Node.js + TypeScript + Express + Prisma + MySQL
- Frontend: React + Vite
- 执行引擎: rclone rcd (HTTP API)

## 文档
- 部署与运行: [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- 运维建议: [`OPS.md`](./OPS.md)
- 后端环境变量模板: [`./.env.example`](./.env.example)
- 前端环境变量模板: [`./frontend/.env.example`](./frontend/.env.example)

## 快速开始

### A. 本地部署
```bash
cd /home/ubuntu/everDrive
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate:deploy
npm run dev
```

前端（新终端）：
```bash
cd /home/ubuntu/everDrive/frontend
npm install
cp .env.example .env
npm run dev
```

### B. Docker 部署
```bash
cd /home/ubuntu/everDrive
npm run docker:build
npm run docker:up
```

访问：
- 前端: `http://localhost:43117`
- 后端健康检查: `http://localhost:43107/health`

查看日志：
```bash
npm run docker:logs
```

停止：
```bash
npm run docker:down
```

## 质量验证
```bash
cd /home/ubuntu/everDrive
npm test
npm run build

cd /home/ubuntu/everDrive/frontend
npm run build
```

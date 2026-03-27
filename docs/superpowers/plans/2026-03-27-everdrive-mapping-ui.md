# everDrive Mapping And Remote UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把映射任务与 remote 页面补成完整中文管理界面，支持服务器目录选择、remote 自动同步、remote 容量编辑，并保留 mock/live 模式提示。

**Architecture:** 继续使用现有单页 Vite + React Query 结构，不新增路由；后端补一个目录浏览接口，前端在映射页引入目录选择弹窗与 remote 自动同步，在云盘页补 remote 容量编辑，并让设置页将 `rclone rcd` 认证改为环境变量来源说明。

**Tech Stack:** Node.js, Express, Prisma, React 18, TypeScript, Vite, TanStack Query

---

### Task 1: 扩展前端类型与 API

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/mock-data.ts`
- Test: `tests/frontend-mapping-api.test.ts`

- [ ] **Step 1: 为 remote 同步与容量编辑先写失败测试**

新增测试覆盖：
- live 模式调用 `POST /api/remotes/sync`
- live 模式调用 `PATCH /api/remotes/:remoteId/capacity`
- mock 模式可模拟更新容量与 remote 列表

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts tests/frontend-remote-capacity-api.test.ts`
Expected: FAIL，提示 API 未实现

- [ ] **Step 3: 实现最小 API 封装**

新增：
- `syncCloudRemotes`
- `updateRemoteCapacity`
- `browseLocalDirectories`

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/frontend-mapping-api.test.ts tests/frontend-remote-capacity-api.test.ts`
Expected: PASS

### Task 2: 新增服务器目录浏览接口

**Files:**
- Create: `tests/local-path-browser.api.test.ts`
- Create: `src/modules/local-path/local-path.dto.ts`
- Create: `src/modules/local-path/local-path.service.ts`
- Create: `src/modules/local-path/local-path.controller.ts`
- Modify: `src/app/create-app.ts`
- Modify: `.env.example`

- [ ] **Step 1: 写目录浏览接口失败测试**

覆盖：
- 正常列出允许根目录下的子目录
- 拒绝越出白名单根目录
- 非目录路径报错

- [ ] **Step 2: 运行测试确认失败**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts`
Expected: FAIL，提示接口未实现

- [ ] **Step 3: 实现最小目录浏览模块**

要求：
- 仅返回目录
- 限制白名单根目录
- 返回当前路径、父路径、子目录项

- [ ] **Step 4: 运行测试确认通过**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts`
Expected: PASS

### Task 3: 重做映射页交互

**Files:**
- Modify: `frontend/src/pages/MappingTasksPage.tsx`
- Modify: `frontend/src/components/MappingTable.tsx`
- Create: `frontend/src/components/LocalPathPicker.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 先让页面依赖新 API 并暴露缺口**

在页面中接入：
- remote 自动同步
- 本地路径目录选择
- “绑定顺序”文案
- 分片模式下才显示 `预估数据量`

- [ ] **Step 2: 实现完整中文映射页**

页面包含：
- 中文标题和错误/加载文案
- 当前数据源状态与模拟数据提示
- 新建映射入口
- 刷新按钮
- 页面加载自动同步 rclone remotes
- 列表与表单联动
- 本地路径目录选择弹窗

- [ ] **Step 3: 实现新建/编辑表单**

表单支持：
- 创建模式
- 编辑模式
- 动态增删远端绑定
- 本地路径通过目录选择器写入
- 提交后刷新列表
- 取消编辑后回到创建模式

- [ ] **Step 4: 运行前端构建验证**

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`
Expected: PASS

### Task 4: 云盘页补容量编辑

**Files:**
- Modify: `frontend/src/pages/CloudRemotesPage.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 接入容量编辑表单**

要求：
- 支持总容量输入
- 支持预留容量输入
- 已用容量为只读展示
- 保存后刷新对应卡片

- [ ] **Step 2: 运行前端构建验证**

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`
Expected: PASS

### Task 5: 设置页改为环境变量说明

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`
- Modify: `frontend/src/lib/mock-data.ts`

- [ ] **Step 1: 调整 rclone rcd 设置展示**

要求：
- 用户名/密码显示为环境变量来源说明
- 不再要求用户输入认证信息

- [ ] **Step 2: 运行前端构建验证**

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`
Expected: PASS

### Task 6: 最终验证

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/MappingTasksPage.tsx`
- Modify: `frontend/src/pages/CloudRemotesPage.tsx`
- Modify: `src/modules/local-path/local-path.service.ts`

- [ ] **Step 1: 运行后端相关测试**

Run: `npm --prefix /home/ubuntu/everDrive test -- tests/local-path-browser.api.test.ts tests/frontend-mapping-api.test.ts tests/frontend-remote-capacity-api.test.ts`
Expected: PASS

- [ ] **Step 2: 运行前端构建**

Run: `npm --prefix /home/ubuntu/everDrive/frontend run build`
Expected: PASS

- [ ] **Step 3: 记录剩余风险**

检查：
- 目录浏览白名单是否覆盖实际数据目录
- remote 自动同步会依赖 rclone rcd 在线
- 当前前端仍缺完整组件级自动化测试

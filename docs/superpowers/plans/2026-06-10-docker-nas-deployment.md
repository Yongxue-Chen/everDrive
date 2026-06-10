# Docker/NAS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make everDrive's Compose stack usable and safer on clean Docker hosts and NAS systems.

**Architecture:** Mount the same read-only host data directory into backend and rclone, and share a dedicated temporary volume for encrypted uploads. Keep internal service ports loopback-bound, add health-based startup ordering, and document the NAS deployment contract.

**Tech Stack:** Docker Compose, Vitest, Node.js 20, rclone, MySQL, Nginx

---

### Task 1: Complete The Compose Deployment Contract

**Files:**
- Modify: `tests/docker-compose.test.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [x] **Step 1: Extend the failing Compose contract test**

Add assertions requiring a relative clean-host data default, a pinned rclone image, health checks for rclone/backend/frontend, and health-based application startup conditions.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/docker-compose.test.ts`

Expected: FAIL because the existing Compose file still uses `/data`, `rclone/rclone:latest`, and has no application health checks.

- [x] **Step 3: Implement the minimal Compose changes**

Update the data mount default to `./data`, pin the rclone image, add health checks, and add health-based application startup dependencies. Keep `/data` as the shared path inside both containers and `/var/lib/everdrive/tmp` as the shared encrypted-upload work path.

- [x] **Step 4: Run the focused test and Compose parser**

Run: `npm test -- tests/docker-compose.test.ts`

Expected: PASS.

Run: `docker compose config`

Expected: exit code 0.

### Task 2: Complete Docker And fnOS Documentation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`

- [x] **Step 1: Document clean-host and NAS prerequisites**

Document creating the data directory, setting `DATA_ROOT`, using `/data/...` mapping paths, configuring rclone inside the container, and preserving the MySQL/rclone volumes.

- [x] **Step 2: Add fnOS/Portainer deployment instructions**

Document Compose deployment through fnOS Docker/Portainer, bind-mount selection, permissions, CPU architecture checks, and the warning that the frontend has no application login yet.

- [x] **Step 3: Check documentation and environment consistency**

Run: `rg -n "DATA_ROOT|DOCKER_RCLONE_RCD_URL|fnOS|飞牛|everdrive_tmp" README.md DEPLOYMENT.md .env.example`

Expected: all deployment variables and NAS-specific instructions are discoverable.

### Task 3: Full Verification

**Files:**
- Verify: all changed files

- [x] **Step 1: Run full tests**

Run: `npm test`

Expected: all tests pass.

- [x] **Step 2: Build backend and frontend**

Run: `npm run build`

Expected: exit code 0.

Run: `npm --prefix frontend run build`

Expected: exit code 0.

- [x] **Step 3: Validate Compose and diff**

Run: `docker compose config`

Expected: exit code 0 with shared data/work mounts, pinned rclone image, loopback internal ports, and health checks.

Run: `git diff --check`

Expected: exit code 0.

# Operations Web Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add complete Web workflows for cloud migration, redundancy recovery, operation logs, and system metrics.

**Architecture:** Reuse existing backend APIs, adding only list/detail metadata needed by forms. Build four focused React pages and expose them through an Operations navigation group.

**Tech Stack:** React, TypeScript, TanStack Query, Express, Vitest, Vite.

---

### Task 1: Frontend API contracts
- [ ] Write failing frontend API tests for migration, redundancy, audit, and metrics calls.
- [ ] Add response/payload types and API functions.
- [ ] Run focused frontend API tests.

### Task 2: Cloud migration page
- [ ] Add migration form using mappings and business remotes.
- [ ] Require explicit confirmation for source-replica removal.
- [ ] Display queued job and errors.

### Task 3: Redundancy recovery page
- [ ] Display protection level and per-remote counts for selected mappings.
- [ ] Add failed-replica retry and result summary.

### Task 4: Logs and metrics pages
- [ ] Add audit filters, result table, and metadata detail.
- [ ] Add metric cards and recent failure table.

### Task 5: Navigation, tests, and docs
- [ ] Add routes and Operations navigation links.
- [ ] Add route/API tests and update bilingual guides.
- [ ] Run backend tests and frontend build.

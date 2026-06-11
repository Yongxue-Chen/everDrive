# rclone Configuration Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add controlled Web management for rclone remotes without arbitrary shell execution.

**Architecture:** Extend the existing typed rclone RC client with a fixed whitelist, expose validated configuration endpoints through a dedicated service/router, and add a focused frontend page driven by provider metadata. Bound remotes cannot be deleted, sensitive values are masked, and interactive OAuth remains a documented container-console fallback.

**Tech Stack:** TypeScript, Express, Zod, React, TanStack Query, Vitest, rclone RC

---

### Task 1: rclone RC client whitelist
- [x] Add failing tests for get/create/update/delete/test calls.
- [x] Implement typed RC client wrappers using fixed method names.
- [x] Run `npm test -- tests/rclone-client.test.ts`.

### Task 2: Backend configuration API
- [x] Add failing service and API tests for listing, masking, mutations, validation, and bound deletion protection.
- [x] Implement DTO, service, controller, and server wiring under `/api/rclone-config`.
- [x] Run focused backend tests.

### Task 3: Frontend configuration center
- [x] Add frontend API types and request tests.
- [x] Add `/rclone-config` navigation and provider-driven configuration page.
- [x] Add concise styles and OAuth/container-console guidance.
- [x] Run frontend tests and build.

### Task 4: Verification
- [x] Run `npm test`.
- [x] Run `npm run build` and `npm --prefix frontend run build`.
- [x] Run `git diff --check` and stop the temporary rclone container.

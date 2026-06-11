# Read-only rclone Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add strictly read-only SMB/SFTP rclone sources to mapping tasks, including safe mirror scans and optional staged encryption.

**Architecture:** Add explicit source fields to mapping tasks and isolate source-side rclone calls behind a read-only service. Reuse existing scan/planning/target logic while selecting local or rclone implementations at runtime.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, rclone RC, Vitest, React.

---

### Task 1: Source data model and validation
- [ ] Write failing mapping-task tests for local and rclone source payloads.
- [ ] Add Prisma source enum/fields and migration with local defaults.
- [ ] Update mapping DTO, repository, service, and API serialization.
- [ ] Run mapping tests and Prisma validation.

### Task 2: Read-only rclone source API
- [ ] Write failing rclone client/source-service tests for recursive listing, browsing, provider validation, and connection errors.
- [ ] Add typed list/stat/copy-from operations without any source mutation methods.
- [ ] Add source browse/test endpoints.
- [ ] Run focused rclone/source tests.

### Task 3: Remote scan safety
- [ ] Write failing scan tests for successful remote scans, failed scans preserving records, and abnormal-drop deletion blocking.
- [ ] Add source-aware scanner and fingerprints with metadata fallback.
- [ ] Persist scan completeness/deletion-block information and prevent missing marking when unsafe.
- [ ] Run scan, planner, and executor tests.

### Task 4: Remote transfer and encryption
- [ ] Write failing executor tests for direct remote copy and staged encrypted upload cleanup.
- [ ] Select direct copy for unencrypted remote sources.
- [ ] Add controlled temporary download, free-space check, encryption, upload, and cleanup flow.
- [ ] Run sync/redundancy tests.

### Task 5: Mapping source UI and docs
- [ ] Write failing frontend API/type tests for source fields and browse/test calls.
- [ ] Add source controls and safety messaging to mapping page.
- [ ] Update bilingual guides and deployment temporary-directory notes.
- [ ] Run backend tests and both builds.

# Cloud Trash for Mirror Sync

## Goal

Add an optional cloud-side trash mechanism for `mirror` sync mode so that files which would normally be deleted from remotes are moved into an everDrive-managed trash area and later purged automatically on a fixed schedule.

This design explicitly does **not** integrate with provider-native trash APIs. If a cloud provider offers a native recycle bin, users may enable and use it themselves outside everDrive.

## Scope

In scope:
- Apply only to `mirror` mode deletions
- Global settings for cloud trash behavior
- Move-to-trash instead of direct delete when enabled
- Scheduled cleanup of expired trash items
- Logging and audit coverage
- Manual cleanup endpoint for maintenance/debugging

Out of scope:
- Provider-native trash API support
- Per-remote or per-mapping-task trash policy
- Capacity-based eviction
- Trash browsing or restore UI in this iteration

## Product Decisions

### Behavior
- `archive` mode remains unchanged and never deletes cloud copies
- `mirror` mode currently deletes cloud files when local files are deleted and grace conditions are met
- When cloud trash is enabled, those delete actions become remote move actions into an everDrive-managed trash path
- When cloud trash is disabled, behavior remains direct delete
- If move-to-trash fails, the file is marked as a deletion failure; the system must not silently fall back to direct delete

### Trash Path Convention

Trash path format:

```text
.everdrive-trash/YYYY/MM/DD/<mappingTaskId>/<original-relative-path>
```

Example:

```text
.everdrive-trash/2026/03/27/42/photos/2024/raw/a.jpg
```

Rationale:
- keeps cleanup date-oriented
- makes operator inspection straightforward
- avoids putting all trash objects into one flat namespace
- preserves original relative path for traceability

### Policy Model

Global settings only:
- `cloudTrash.enabled`
- `cloudTrash.retentionDays`
- `cloudTrash.cleanupIntervalHours`
- `cloudTrash.basePath`
- `cloudTrash.maxDeleteBatchPerRun`

Recommended defaults:
- `enabled = false`
- `retentionDays = 30`
- `cleanupIntervalHours = 24`
- `basePath = ".everdrive-trash"`
- `maxDeleteBatchPerRun = 1000`

## Architecture

## Sync Planner / Executor

Current behavior in `mirror` mode produces delete actions after grace checks.

New behavior:
- planner can continue to produce logical delete actions
- executor decides whether each delete action becomes:
  - direct remote delete, or
  - move-to-trash
- executor builds the destination trash path using execution date, mapping task id, and original relative path

Why executor instead of planner:
- trash target path depends on execution date/time
- avoids expanding the plan format with operational timestamps unless needed
- keeps policy decision close to the remote operation implementation

## Settings

Extend the settings DTO / repository / service with a new `cloudTrash` section.

Example shape:

```json
{
  "cloudTrash": {
    "enabled": false,
    "retentionDays": 30,
    "cleanupIntervalHours": 24,
    "basePath": ".everdrive-trash",
    "maxDeleteBatchPerRun": 1000
  }
}
```

Validation rules:
- `retentionDays >= 1`
- `cleanupIntervalHours >= 1`
- `maxDeleteBatchPerRun >= 1`
- `basePath` must be non-empty and normalized to a relative remote path segment

Hot-reload behavior:
- may be applied through the settings service in-memory, matching current settings architecture where possible
- if implementation simplicity requires restart semantics for some fields, return that clearly via existing hot-update metadata

## Cleanup Scheduler

Add a new scheduled background capability for cloud trash cleanup.

Execution model:
- enqueue a `cloud_trash_cleanup` job on the existing job queue
- run at the configured global interval, default every 24 hours
- each run scans active remotes for trash content under `cloudTrash.basePath`
- delete only entries older than `retentionDays`
- stop after `maxDeleteBatchPerRun` deletions for a single run

Deletion basis:
- age is derived from the trash folder date path (`YYYY/MM/DD`)
- items in malformed paths are skipped and logged, not deleted automatically

Failure handling:
- per-remote failures do not abort the whole cleanup run
- job result contains summary counts and representative failures

## API

Reuse settings endpoints:
- `GET /api/settings`
- `PUT /api/settings`

Add optional maintenance endpoint:
- `POST /api/maintenance/cloud-trash/cleanup`

Purpose of the manual endpoint:
- operator-triggered cleanup for debugging
- safe verification without waiting for the scheduler

The endpoint should enqueue a cleanup job or trigger the same cleanup service path behind the queue, depending on how existing maintenance patterns are structured. Queue-backed execution is preferred for consistency.

## Data Flow

### Mirror Delete With Cloud Trash Enabled
1. planner identifies a remote delete action
2. executor loads current cloud trash settings
3. executor builds trash destination path
4. executor issues remote move from original path to trash path
5. success is recorded as a protected deletion action
6. failure is recorded as a deletion failure without direct-delete fallback

### Scheduled Cleanup
1. scheduler interval elapses
2. queue receives `cloud_trash_cleanup`
3. cleanup service lists trash roots on active remotes
4. service determines expired dated paths
5. service deletes expired entries up to batch limit
6. service writes logs/audit summary

## Observability

Add structured logging for:
- trash move requested
- trash move succeeded
- trash move failed
- cleanup run started
- cleanup run summary
- malformed trash path skipped
- cleanup delete failure

Add audit coverage for:
- settings updates to `cloudTrash.*`
- manual cleanup trigger
- cleanup run summary if audit volume remains reasonable

## Edge Cases

- Path collision in trash: add an execution timestamp suffix only if the target path already exists; do not preemptively randomize paths
- Disabled remote: cleanup skips inactive remotes
- Missing trash root: treated as empty, not an error
- Malformed dated subdirectory: skip and log for manual inspection
- Large trash volume: respect `maxDeleteBatchPerRun` and rely on repeated runs

## Testing Strategy

Unit tests:
- `mirror` + cloud trash enabled => delete becomes move
- `archive` unaffected
- cloud trash disabled => direct delete remains
- trash destination path matches `.everdrive-trash/YYYY/MM/DD/<mappingTaskId>/<original-relative-path>`
- move failure does not degrade to direct delete
- cleanup deletes only expired items
- cleanup respects batch limit
- malformed paths are skipped

Integration/API tests:
- settings endpoints round-trip `cloudTrash` values
- manual cleanup endpoint enqueues or triggers the expected job path
- cleanup summary surfaces expected counts

## Rollout Notes

Recommended rollout:
1. ship settings + executor support first
2. ship cleanup job and manual cleanup endpoint in the same feature branch
3. enable in one environment with `enabled=false` by default
4. turn on only after verifying move paths and cleanup summaries

## Open Questions Resolved

- Native provider recycle bin support: no
- Policy scope: global only
- Retention model: fixed days only
- Cleanup frequency default: daily
- Trash path format: dated path with mapping task and original relative path preserved

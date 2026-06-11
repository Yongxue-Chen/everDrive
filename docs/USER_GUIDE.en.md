# everDrive User Guide

[简体中文](USER_GUIDE.md) | [English](USER_GUIDE.en.md)

## 1. What everDrive Is

everDrive is a local-directory-to-multi-cloud synchronization and management service designed for NAS devices and servers.

It uses rclone for cloud storage operations and adds local file scanning, hash verification, automatic synchronization, mirror deletion protection, multi-cloud redundancy, capacity-based placement, cloud-to-cloud migration, a task queue, and a Web management interface.

Typical uses include:

- Archiving NAS photos, videos, or documents to cloud storage.
- Keeping the same file on multiple cloud providers to reduce single-provider risk.
- Distributing files across several cloud accounts based on available capacity.
- Moving cloud files after local renames instead of uploading them again when possible.
- Migrating existing cloud files between rclone remotes.

The current service is designed for a trusted internal-network, single-user environment. It has no application login and must not be exposed directly to the public Internet.

## 2. System Components

| Component | Purpose |
| --- | --- |
| Frontend | React management interface, default port `43117` |
| Backend | Scanning, planning, task scheduling, and API, default port `43107` |
| MySQL | Stores mapping tasks, file indexes, cloud locations, and operation records |
| rclone rcd | Performs uploads, moves, deletions, migrations, and remote configuration |

The backend does not store file contents in MySQL. MySQL mainly stores paths, sizes, hashes, synchronization states, and task records.

## 3. Three Core Concepts

### 3.1 rclone Remote

An rclone remote is rclone's cloud connection configuration, such as `gdrive:`, `onedrive:`, or `s3backup:`.

The Web “rclone Configuration” page can create, edit, delete, and test remotes. OAuth providers that require browser interaction will usually still need the rclone container console:

```bash
docker compose exec rclone rclone config
```

### 3.2 Business Remote

A business remote is everDrive's management record bound to an rclone remote. It adds:

- A display name
- Total and reserved capacity
- A capacity warning threshold
- A remote root path
- Cloud trash enablement
- A cloud trash path

One rclone remote can currently be bound to only one business remote.

### 3.3 Mapping Task

A mapping task defines which local directory is synchronized, which rules are used, and which business remotes receive the files. Main settings include:

- Local directory
- `archive` or `mirror` synchronization mode
- Encryption
- Redundancy
- Capacity-based split placement
- Bound business remotes and their remote subdirectories

## 4. Currently Supported Features

### 4.1 Local File Scanning and Verification

- Recursively scans regular files under a mapped directory.
- Skips symbolic links and special files.
- Records file size, modification time, MD5, and SHA1.
- Detects new, changed, and locally deleted files.
- Uses hashes and file size to identify possible renames.

Scanning currently reads complete files and calculates both MD5 and SHA1. The first scan of many large files may take significant time.

### 4.2 Automatic and Manual Synchronization

- The backend automatically schedules tasks using the configured interval.
- The Web “Mapping Tasks” page can trigger synchronization manually.
- A manual run queues scanning, rename detection, and synchronization in sequence.
- Conflicting jobs for the same mapping task do not run simultaneously.
- Long-job, short-job, and per-remote concurrency can be limited.

The current task queue is stored in backend memory. Queued jobs and in-memory task state do not survive a backend restart.

### 4.3 Archive Mode

Archive mode is intended for backup and long-term retention:

- New local files are uploaded.
- Changed local files update cloud replicas.
- Local deletion does not delete cloud copies.
- After a local rename, everDrive attempts to move the cloud file to its new path.

### 4.4 Mirror Mode

Mirror mode attempts to keep cloud state aligned with local state:

- New and changed local files are synchronized.
- Local deletion deletes cloud replicas after a deletion grace period.
- If cloud trash is enabled for a business remote, deletion moves files into trash.
- Without cloud trash, cloud files are deleted directly.

Mirror mode has real deletion risk. Start with a test directory and enable cloud trash.

### 4.5 Multi-Cloud Redundancy

With redundancy enabled, each file is uploaded to every bound active business remote:

- The first binding is shown as the primary remote; the others are backup remotes.
- A failure on one remote does not stop uploads to the remaining remotes.
- Backend APIs expose redundancy status and failed-replica retry operations.

Redundancy status and retry operations do not yet have a complete dedicated Web page and are mainly available through the backend API.

### 4.6 Capacity-Based Split Placement

With split placement enabled, each file is stored on only one business remote:

- Selection considers capacity, reserved space, warning thresholds, and priority.
- everDrive prefers a remote that can hold the file without crossing its warning threshold.
- When an already placed file changes, its existing remote is updated.
- An estimated total data size can be supplied when creating a task to validate aggregate capacity.

Split placement does not split an individual file into chunks. Each file remains complete on one remote.

### 4.7 Upload Encryption

With encryption enabled:

- The backend derives an AES-256-GCM key from `ENCRYPTION_MASTER_KEY`.
- A temporary encrypted file is generated before upload.
- Cloud paths are generated as unreadable hashes based on original relative paths.
- Docker deployments use a shared temporary volume so rclone can upload encrypted output.

Important limitation: everDrive currently has no built-in decryption download or restore workflow. Keep `ENCRYPTION_MASTER_KEY` safe permanently; encrypted data cannot be recovered if the key is lost.

### 4.8 Rename Detection

The system matches recently missing and newly present paths using MD5, SHA1, and file size:

- A successful match preserves the original file identity record.
- The synchronization stage attempts a cloud move or rename first.
- Unreliable matches are handled as separate additions and deletions.

### 4.9 Cloud Trash

Cloud trash can be enabled separately for each business remote:

- It is used only for local deletions processed in `mirror` mode.
- The default trash path is `.everdrive-trash`.
- Files are organized by date and mapping task.
- The backend can periodically clean items older than the retention period.
- Retention days, cleanup interval, and per-run cleanup limits can be adjusted on the Settings page.

### 4.10 Cloud Capacity and Health Checks

- Uses rclone `operations/about` for providers that expose real capacity.
- Total capacity can be maintained manually for providers without that API.
- Supports reserved capacity and warning thresholds.
- Periodically checks whether bound rclone remotes still exist.
- The dashboard shows health, usage, and warning states.

### 4.11 Cloud-to-Cloud Migration

The backend migration API can copy files from one business remote to another:

- Supports limiting migration to a relative path scope.
- Supports a destination base path.
- Can remove the source replica after successful migration.
- Runs through the long-job queue.

Migration currently has no dedicated Web page and must be invoked through the API.

### 4.12 rclone Configuration Center

The Web “rclone Configuration” page supports:

- Listing configured remotes.
- Generating forms from provider metadata.
- Creating and editing remotes.
- Testing remote root access.
- Deleting remotes that are not bound to business remotes.
- Hiding sensitive configuration values.

The configuration center calls only fixed rclone RC APIs and does not expose arbitrary shell execution. Complex OAuth authorization still requires the container console.

### 4.13 Dashboard, Logs, and Metrics

- The dashboard shows mapping-task file counts, total size, and recent synchronization states.
- The dashboard shows business-remote capacity and health.
- Operation logs record selected mapping, business-remote, settings, and maintenance changes.
- `/health`, `/ready`, and metrics APIs are available.

## 5. Web Pages

| Page | Current Capabilities |
| --- | --- |
| Workspace | Mapping-task summaries, total indexed data, cloud warnings, and recent job states |
| Mapping Tasks | Create, edit, enable, disable, soft-delete, select directories, and trigger synchronization |
| Cloud Remotes | Create and maintain business remotes, capacity, root paths, and cloud trash |
| rclone Configuration | Manage underlying rclone remotes and test connectivity |
| Settings | Configure scheduling, concurrency, rclone behavior, logging, and trash cleanup |

The frontend supports `mock` and `live` data sources. Real usage requires “live backend”; mock operations are not written to the backend.

## 6. First-Time Workflow

1. Start the service using the [deployment guide](../DEPLOYMENT.md).
2. Confirm that `/ready` returns HTTP 200.
3. Open “rclone Configuration” and create or import at least one remote.
4. Test the remote; complete OAuth in the container when required.
5. Open “Cloud Remotes” and create a business remote bound to the rclone remote.
6. Configure capacity, reserved capacity, remote root path, and cloud-trash policy.
7. Open “Mapping Tasks” and select a local directory under `/data/...`.
8. For the first run, use `archive` mode and one test remote.
9. Create the task and click manual synchronization.
10. Observe scan and synchronization results, then verify the cloud files directly.

## 7. Common Configuration Examples

### Long-Term Photo Archive

- Mode: `archive`
- Remotes: one or more
- Redundancy: enable when multiple replicas are required
- Split placement: disabled
- Cloud trash: optional

Cloud copies remain when photos are accidentally deleted locally.

### NAS Directory Mirror

- Mode: `mirror`
- Remotes: one
- Cloud trash: strongly recommended
- First run: use a test directory

Local deletion eventually affects cloud data, so verify deletion behavior before normal use.

### Storage Pool from Several Small Cloud Accounts

- Mode: usually `archive`
- Split placement: enabled
- Redundancy: disabled
- Configure correct capacity and reserved capacity for every business remote

Each file is stored completely on one remote and is not divided into chunks.

## 8. Current Limitations

- No application login or multi-user permissions; trusted internal networks only.
- No built-in encrypted download, decryption, or disaster-recovery workflow.
- The in-memory task queue does not preserve queued jobs across backend restarts.
- Large directory scans may consume significant time and memory, and currently calculate both MD5 and SHA1.
- Cloud migration, redundancy recovery, operation logs, and metrics lack complete Web management pages.
- OAuth providers usually still require interactive `rclone config` authorization.
- Provider forms cannot represent every complex interactive rclone configuration flow.
- everDrive is not a bidirectional synchronization tool; its primary data flow is local directory to cloud.
- Existing cloud files that are not recorded in the database are not automatically imported as local files.

## 9. Data Safety Recommendations

- Start with `archive` mode and a test directory.
- Enable cloud trash and verify recovery before using `mirror` mode.
- Never casually change or lose `ENCRYPTION_MASTER_KEY`.
- Back up MySQL data and the `rclone_config` volume regularly.
- Do not run `docker compose down -v` unless deleting database and rclone configuration volumes is intended.
- Access the frontend only from a trusted LAN, VPN, or authenticated reverse proxy.
- Regularly review failed jobs, capacity warnings, and cloud connection status.

## 10. APIs and Additional Documentation

- Deployment and fnOS installation: [DEPLOYMENT.md](../DEPLOYMENT.md)
- Operations guidance: [OPS.md](../OPS.md)
- rclone client examples: [rclone-client-examples.md](rclone-client-examples.md)
- Mapping-task API examples: [manual-mapping-api-examples.md](manual-mapping-api-examples.md)
- Current development status: [EXECUTION_STATUS.md](EXECUTION_STATUS.md)

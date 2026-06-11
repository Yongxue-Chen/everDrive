# Read-only rclone Sources and Operations UI Design

## Goal

Extend everDrive into a LAN backup hub that can read SMB and SFTP folders through rclone, while keeping every source strictly read-only. Complete the currently API-only cloud migration, redundancy recovery, operation log, and metrics workflows with Web pages.

## Source model

A mapping task has one source:

- `local`: existing host/container directory behavior.
- `rclone`: an SMB or SFTP rclone remote plus a source subdirectory.

Existing mappings remain `local`. New rclone mappings store `sourceRemoteName` and `sourcePath`; `localPath` remains available for backward compatibility and display but is not interpreted as a host path for rclone sources.

The source remote is not a business cloud target and may be reused by multiple mappings. Only rclone remotes whose configured provider type is `smb` or `sftp` can be selected as sources.

## Read-only boundary

Source operations are exposed through a dedicated read-only source service. It may list, stat, download, or copy from a source. It does not expose move, delete, purge, mkdir, or sync-to-source methods. All destination-changing operations continue to use the existing target services.

Both `archive` and `mirror` are supported. Mirror affects target cloud replicas only and never changes the source.

## Scanning and deletion safety

Remote scanning uses recursive rclone listing and records relative path, size, modification time, and available hashes. When hashes are unavailable, change detection falls back to path, size, and modification time.

Missing-file marking is allowed only after a complete successful scan. A failed/offline/partial scan leaves previous records unchanged. For remote mirror mappings, target deletion is blocked when a completed scan reports an abnormal drop of more than 50 percent and at least 20 files, unless a later healthy scan confirms the state. Existing deletion grace periods and cloud trash behavior still apply.

## Transfer and encryption

Unencrypted remote-source files are copied directly from source remote to target remote using rclone remote-to-remote copy.

Encryption is supported but disabled by default. When enabled, everDrive downloads one source file to a controlled temporary directory, checks available space, encrypts it with the existing AES-256-GCM flow, uploads the encrypted file, and removes both plaintext and encrypted temporary files in a `finally` block.

## Web UI

The mapping form gains source type selection, source remote selection, remote path input/browser, connection test, read-only messaging, and encryption cost warning.

An Operations navigation area adds:

- Cloud Migration: submit migration jobs with explicit confirmation when removing source cloud replicas.
- Redundancy Recovery: inspect protection status per mapping and retry failed replicas.
- Operation Logs: filter and inspect audit entries.
- System Metrics: inspect queue/running/failure/capacity indicators and recent failed jobs.

## Error handling

Remote source connection/list failures fail the scan job without marking files missing. Direct-copy and encrypted staging failures mark target replicas failed and preserve source data. Temporary files are always cleaned up. UI actions surface backend error messages.

## Testing

Add focused tests for source validation, remote recursive listing, no missing-file marking on failed scans, abnormal-drop protection, remote-to-remote upload, encrypted staging cleanup, and each new frontend API/page route. Run backend tests, backend build, frontend build, and Prisma validation.

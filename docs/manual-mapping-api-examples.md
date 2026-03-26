# Manual Mapping API Examples

## 1) Create Mapping Task

```bash
curl -X POST http://localhost:3000/api/mapping-tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "photos-archive",
    "localPath": "/data/photos",
    "syncMode": "archive",
    "encryptionEnabled": true,
    "redundancyEnabled": true,
    "splitEnabled": false,
    "remoteBindings": [
      { "remoteId": "1", "priority": 100 },
      { "remoteId": "2", "priority": 200 }
    ]
  }'
```

## 2) List Mapping Tasks

```bash
curl "http://localhost:3000/api/mapping-tasks?status=active"
```

## 3) Get Mapping Task Detail

```bash
curl "http://localhost:3000/api/mapping-tasks/100"
```

## 4) Update Mapping Task

```bash
curl -X PATCH http://localhost:3000/api/mapping-tasks/100 \
  -H "Content-Type: application/json" \
  -d '{
    "syncMode": "mirror",
    "splitEnabled": true,
    "redundancyEnabled": false,
    "expectedDataSizeBytes": "5000000000",
    "remoteBindings": [
      { "remoteId": "1", "priority": 100 },
      { "remoteId": "3", "priority": 200 }
    ]
  }'
```

## 5) Enable / Disable Mapping Task

```bash
curl -X PATCH http://localhost:3000/api/mapping-tasks/100/active \
  -H "Content-Type: application/json" \
  -d '{ "isActive": false }'
```

## 6) Soft Delete (Default)

```bash
curl -X DELETE "http://localhost:3000/api/mapping-tasks/100"
```

## 7) Hard Delete

```bash
curl -X DELETE "http://localhost:3000/api/mapping-tasks/100?hardDelete=true"
```

## Strategy Semantics

- `encryptionEnabled=true`: pipeline should encrypt file/chunks before upload.
- `redundancyEnabled=true`: first remote is `primary`, others are `backup`.
- `splitEnabled=true`: all remotes are `shard`; split mode requires multi-remote and validates available capacity.
- `syncMode=archive`: append-only backup semantics (do not delete existing cloud history).
- `syncMode=mirror`: target should converge to source state (including delete propagation).

## Engine Integration Notes

- Scanner side: enumerate active mapping tasks (`status=active`), scan `local_path`, and attach `mapping_task_id`.
- Planner side: read task strategy (`sync_mode`, encryption/redundancy/split flags, remotes) to build execution graph.
- Executor side:
  - archive: schedule upload-only actions.
  - mirror: schedule upsert + delete actions.
  - redundancy: fan-out write to primary/backup remotes.
  - split: chunk + dispatch by shard policy.
- Tracker side: write sync lifecycle into `sync_jobs`; API auto exposes `last_sync_at` from latest successful `sync` job.

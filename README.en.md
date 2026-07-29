# everDrive

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20Noncommercial%201.0.0-orange.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)](package.json)
[![Docker Compose](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

[中文](README.md) | **English**

everDrive is a self-hosted "local folder → multi-cloud storage" sync and management system built on top of [rclone](https://rclone.org/). It turns hand-rolled cron jobs and rclone CLI scripts into a full application with a web UI, a job queue, automatic scheduling, multi-cloud redundancy, and client-side encryption.

## Positioning: local storage is primary, the cloud is just a backup

In everDrive's model, **the local directory is the primary copy of your data — the cloud remotes are only an off-site disaster-recovery backup**, there to protect you if the local disk fails, files get deleted by mistake, or the NAS itself has a problem.

- For day-to-day access and file syncing, we recommend reaching the local directory directly over a LAN or a mesh network like [Tailscale](https://tailscale.com/), rather than routing through the cloud — lower latency, and no dependency on a cloud provider's bandwidth or throttling.
- The cloud copies only really matter when the local directory has a problem: everDrive's redundancy recovery, encrypted-file recovery, and data recovery pages restore the cloud-held copies back to local disk, preserving the original directory layout.
- Because of this positioning, everDrive is best installed directly on a **NAS**, or on a dedicated **management server** that connects to the local directories of other devices on the LAN (another NAS, an SMB/SFTP source, etc.) and backs all of them up to the cloud — not as a cloud-first drive client.

## Why everDrive

- **More than a sync script**: manage cloud remotes, mapping tasks, capacity thresholds, job status, and system settings from a web UI — no need to memorize CLI flags.
- **Multi-cloud, not single-cloud**: replicate the same data redundantly across multiple cloud remotes, or shard large collections across clouds by capacity.
- **Encrypt before upload**: files can be encrypted with AES-256-GCM before they leave your server, so cloud providers never see plaintext.
- **archive vs. mirror**: a clear distinction between "append-only archive" and "local deletes propagate to the cloud," so you don't accidentally wipe cloud copies.
- **Fully self-hosted**: your data stays on your own server and in cloud accounts you control — no third-party relay.

## Screens

The frontend ships pages for cloud remote listing, mapping task management, the job queue, capacity/health monitoring, an rclone remote configuration center, redundancy recovery, and encrypted-file recovery. For full screenshots and walkthroughs, see the [User Guide](docs/USER_GUIDE.en.md).

## Feature overview

| Capability | Status |
| --- | --- |
| Local directory scanning with MD5/SHA1 checksums | Supported |
| Read-only SMB/SFTP LAN sources | Supported; direct transfer, mirror only affects the destination cloud |
| Automatic and manual sync | Supported |
| Archive mode | Supported; local deletes don't remove cloud copies |
| Mirror mode | Supported; can pair with a built-in cloud recycle bin |
| Multi-cloud redundant backup | Supported; dedicated redundancy recovery page |
| Multi-cloud capacity sharding | Supported; each file is stored whole on one cloud remote |
| AES-256-GCM encryption before upload | Supported; dedicated encrypted-file recovery page |
| Local rename detection with cloud-side move | Supported |
| Cloud remote capacity, health checks, and alerts | Supported |
| Cloud-to-cloud migration | Supported; dedicated web page |
| rclone remote configuration center | Supported; complex OAuth flows may still need container CLI |
| Docker, NAS, and Feiniu (fnOS) deployment | Supported |
| Application login / multi-user permissions | Not yet supported — trusted internal networks only |

## Architecture

```
Browser ──▶ Frontend (React + Vite)
              │  /api
              ▼
         Backend (Node.js + TypeScript + Express + Prisma)
              │                       │
              ▼                       ▼
      Remote MySQL 8+          rclone rcd (HTTP API) ──▶ cloud remotes
```

Default ports: frontend `43117`, backend `43107`, `rclone rcd` `5572`, MySQL usually `3306` on your remote database.

Backend health checks:

```bash
curl http://127.0.0.1:43107/health   # is the service alive
curl http://127.0.0.1:43107/ready    # 200 only when MySQL and rclone rcd are both reachable
```

## Quick start (Docker)

Requires Docker and Docker Compose, plus a reachable remote MySQL 8+ instance (recommended; the repo also ships a local `mysql` service for testing).

```bash
git clone https://github.com/Yongxue-Chen/everDrive.git
cd everDrive
cp .env.example .env
# Edit .env: at minimum set DATABASE_URL, RCLONE_RCD_USER/PASS, ENCRYPTION_MASTER_KEY

docker compose up -d rclone
docker compose exec rclone rclone config          # configure at least one working cloud remote

docker compose build
docker compose up -d backend frontend
```

Open `http://127.0.0.1:43117`, confirm the data source is set to "live backend" in system settings, then add a cloud remote under "Cloud Remotes" and create a sync task under "Mapping Tasks".

> The web UI currently has no application login or multi-user permissions. Only run it behind a trusted LAN, VPN (e.g. Tailscale), or an authenticated reverse proxy — never expose it directly to the public internet.

For running without Docker (local / systemd), and for NAS or Feiniu (fnOS) deployment, see the [Deployment Guide](DEPLOYMENT.md) (Chinese; commands are directly runnable).

## Documentation

- [User Guide](docs/USER_GUIDE.en.md) (English) / [用户手册](docs/USER_GUIDE.md) (Chinese) — core concepts, first-sync walkthrough, current limitations
- [Deployment Guide](DEPLOYMENT.md) — local deployment, Docker, NAS, Feiniu fnOS, production recommendations
- [Operations Guide](OPS.md) — monitoring/alerting, backups, capacity governance, incident response
- [rclone client examples](docs/rclone-client-examples.md)
- [Mapping task API examples](docs/manual-mapping-api-examples.md)

## Common development commands

```bash
npm run dev                    # backend dev mode
npm test                       # backend tests
npm run build                  # backend build

cd frontend && npm run dev     # frontend dev mode
cd frontend && npm run build   # frontend build

npm run docker:build           # build Docker images
docker compose up -d rclone backend frontend
npm run docker:logs
npm run docker:down
```

## Security notes

- The web UI has no application login or multi-user permissions today. Do not expose the frontend, backend, or `rclone rcd` ports directly to the public internet — only use them behind a trusted LAN, VPN, or an authenticated reverse proxy.
- `.env`, real secrets, and `ENCRYPTION_MASTER_KEY` must never be committed. The repo only ships a `.env.example` template.
- If you discover a security vulnerability, please do not open a public issue. Report it privately through the contact information on the repository owner's GitHub profile.

## Contributing

Issues and pull requests are welcome. Before submitting code, make sure this passes:

```bash
npm test
cd frontend && npm run build
```

For feature-sized changes, please open an issue to discuss the approach before sending a PR.

## License

This project's source is available under the [PolyForm Noncommercial License 1.0.0](LICENSE).

Plain-language summary (not legal advice — the [LICENSE](LICENSE) text governs):

- Free to use, modify, and distribute for **noncommercial purposes**: personal use, study, research, testing, and hobby projects.
- Charitable organizations, educational institutions, public research institutions, and other nonprofit/public bodies are also covered as noncommercial use.
- **Commercial use of any kind is prohibited.** Contact the author for a separate commercial license if you need one.
- Anyone you distribute the software (or a modified version) to must also receive the full LICENSE text and the `Required Notice` copyright line within it.
- Provided with no warranty; the author is not liable for any damages from using this software.
- This is not an OSI/FSF-approved "open source" license — it's a source-available license.

# everDrive Docker/NAS Deployment Design

## Goal

Make the existing Docker Compose deployment usable on a clean Docker host and NAS systems such as fnOS, while keeping the change focused on deployment reliability.

This phase does not add application authentication or Web-based rclone remote management.

## Deployment Model

The deployment runs four services:

- `mysql` stores everDrive application state.
- `rclone` owns cloud-provider configuration and executes file transfers.
- `backend` scans local files, plans synchronization, and calls rclone RC.
- `frontend` serves the management UI and proxies `/api` requests to the backend.

The host data directory is mounted read-only at `/data` in both `backend` and `rclone`. Using the same container path is required because the backend sends local source paths to rclone RC.

A named volume is mounted at `/work` in both `backend` and `rclone`. The backend uses `/work/tmp` for encrypted temporary files so rclone can read them before upload.

## Configuration

The Compose deployment accepts:

- `DATA_ROOT`: host or NAS directory exposed to everDrive, default `./data`.
- `EVERDRIVE_WORK_ROOT`: backend temporary-work directory, default `/work/tmp`.
- Existing database, rclone, port, and concurrency settings.

`LOCAL_PATH_ALLOWED_ROOTS` defaults to `/data` in Docker instead of `/`.

The rclone image uses a fixed version rather than `latest`.

## Network Exposure

Only the frontend is exposed on all host interfaces by default.

MySQL, backend, and rclone RC bind to `127.0.0.1` when host port publishing is needed. Containers continue to communicate over the private Compose network.

This does not replace application authentication. Users must still avoid exposing the frontend to untrusted networks until authentication is implemented.

## Health And Startup

Add health checks for rclone, backend, and frontend. Backend waits for healthy MySQL and rclone services before starting. Frontend waits for a healthy backend.

Database migrations remain in the backend entrypoint and retain retry behavior.

## Documentation

Update the environment template and deployment documentation with:

- Clean-host Docker installation flow.
- Shared-directory requirements.
- rclone initial configuration flow.
- fnOS/Portainer deployment notes.
- Permission and architecture considerations.
- A warning that encrypted uploads require the shared work volume.

## Verification

Add a test that parses the rendered Compose configuration and verifies:

- Shared `/data` mounts exist on backend and rclone.
- Shared `/work` mounts exist on backend and rclone.
- Docker local-path browsing is restricted to `/data`.
- Internal service ports bind to loopback by default.
- The rclone image is pinned.
- Health checks and startup dependencies are present.

Run the full backend test suite, backend build, frontend build, and `docker compose config`.

# everDrive User Guide Documentation Design

## Goal

Provide an accurate user-facing explanation of what everDrive currently does, how its concepts fit together, how to complete a first sync, and which capabilities are limited to APIs or are not yet implemented.

## Documentation Structure

Create `docs/USER_GUIDE.md` as the primary functional manual. Keep `README.md` focused on project introduction and setup, and add a concise feature summary plus a prominent link to the user guide.

The guide covers service positioning, architecture, core concepts, supported workflows, page-by-page behavior, sync modes, redundancy, split placement, encryption, migration, recovery, task queue behavior, safety warnings, limitations, and examples.

## Accuracy Rules

- Distinguish Web UI capabilities from API-only capabilities.
- Describe behavior from current code, not roadmap intentions.
- State that the job queue is in memory and queued jobs do not survive backend restarts.
- State that encryption protects uploaded content and paths, but no built-in decrypt/restore workflow currently exists.
- State that interactive OAuth may still require `rclone config` in the container.
- State that there is no application login and deployment is intended for trusted internal networks.

## Verification

Cross-check the manual against routers, frontend routes, sync planner behavior, Docker documentation, and current tests. Run markdown consistency searches and `git diff --check`.

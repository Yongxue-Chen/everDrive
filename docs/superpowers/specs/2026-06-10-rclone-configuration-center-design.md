# everDrive rclone Configuration Center Design

## Goal

Add a controlled Web interface for managing rclone remotes on trusted internal networks without exposing arbitrary shell execution.

## Scope

The configuration center supports listing configured remotes and providers, inspecting a remote, creating or updating a remote, deleting an unbound remote, and testing remote connectivity. It does not expose `core/command`, arbitrary RC methods, or a browser OAuth callback service.

Complex OAuth providers remain supported through an explicit instruction to run `docker compose exec rclone rclone config` when interactive authorization is required.

## Backend Architecture

Extend `IRcloneClient` with typed wrappers around the rclone RC whitelist:

- `config/listremotes`
- `config/providers`
- `config/get`
- `config/create`
- `config/update`
- `config/delete`
- `operations/list` for connection testing

Create a dedicated configuration service and router under `/api/rclone-config`. Input is validated with Zod. Remote names must use a conservative name format, provider types must be non-empty, and configuration values must be strings, booleans, or numbers.

Deleting a remote that is bound to an everDrive business remote returns a conflict response. Secrets returned by `config/get` are never exposed directly; the API returns provider configuration with password-like fields masked or omitted.

## Frontend Architecture

Add an rclone configuration section to the existing cloud-remotes page. It shows configured remotes, allows creating and editing remote configuration, provides connection-test and delete actions, and refreshes both rclone and business-remote lists after mutations.

Provider metadata from `config/providers` drives the editable fields. Advanced or OAuth-heavy providers display a warning that container-based `rclone config` may still be required.

## Error Handling And Safety

All operations use explicit backend endpoints and confirmation for deletion. The backend rejects unknown payload shapes and never accepts an RC method name from the browser. rclone errors are mapped through the existing application error handler.

## Testing

Add client tests for the new RC calls, service tests for masking and bound-remote deletion protection, API tests for validation and responses, and frontend API/format tests for the new calls. Run the complete backend tests and both production builds.

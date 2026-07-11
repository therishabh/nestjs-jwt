# Documentation Index

This folder is the developer documentation for the Nest JWT Auth API. If you're new to the project, **start with [new-developer-guide.md](./new-developer-guide.md)** — everything else here is reference material you'll come back to as needed.

| Document                                                       | What it covers                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [new-developer-guide.md](./new-developer-guide.md)             | First stop: setup, running the app, learning order, common mistakes, debugging |
| [project-structure.md](./project-structure.md)                 | What lives in each folder, and what shouldn't                                  |
| [architecture.md](./architecture.md)                           | Layers (controller/service/schema/guard/etc.), how they connect, module graph  |
| [request-lifecycle.md](./request-lifecycle.md)                 | What happens to an HTTP request from socket to response                        |
| [authentication-flow.md](./authentication-flow.md)             | End-to-end map of every auth endpoint                                          |
| [registration-flow.md](./registration-flow.md)                 | `POST /auth/register` step by step                                             |
| [login-flow.md](./login-flow.md)                               | `POST /auth/login` step by step, including lockout                             |
| [jwt-token-flow.md](./jwt-token-flow.md)                       | What a JWT is, this project's payload, signing/verification                    |
| [refresh-token-flow.md](./refresh-token-flow.md)               | Why refresh tokens exist, hashing, rotation, reuse detection                   |
| [password-management.md](./password-management.md)             | Change / forgot / reset password flows                                         |
| [authorization-and-roles.md](./authorization-and-roles.md)     | `@Public()`, `@Roles()`, `JwtAuthGuard`, `RolesGuard`                          |
| [profile-flow.md](./profile-flow.md)                           | `GET/PUT /profile`                                                             |
| [database-and-schema.md](./database-and-schema.md)             | The `User` schema, field by field                                              |
| [error-handling.md](./error-handling.md)                       | Exception filter, response envelope, custom exceptions                         |
| [security.md](./security.md)                                   | Every security decision and where it's implemented                             |
| [environment-configuration.md](./environment-configuration.md) | Every env var, config module structure, validation                             |
| [api-flow.md](./api-flow.md)                                   | Full endpoint reference table                                                  |

All diagrams are Mermaid and render directly on GitHub. All file paths mentioned are relative to the repository root and were verified to exist at the time of writing.

# Project Structure

```
src/
├── main.ts                    Application bootstrap: global pipes, security middleware, Swagger, graceful shutdown
├── app.module.ts               Root module: wires config, database, feature modules, and global guards/interceptors/filters
├── config/                     Typed, validated environment configuration
├── database/                   MongoDB connection setup + the admin seed script
├── logger/                     Structured logging (AppLogger)
├── mail/                       Mail-sending abstraction (currently a logging stub)
├── auth/                       Authentication: registration, login, tokens, password flows
├── users/                      The User resource: schema, data access, profile & admin endpoints
├── health/                     Liveness/readiness endpoint
└── common/                     Cross-cutting building blocks shared by every feature module
    ├── constants/
    ├── decorators/
    ├── dto/
    ├── enums/
    ├── exceptions/
    ├── filters/
    ├── guards/
    ├── interceptors/
    ├── interfaces/
    ├── middlewares/
    └── utils/
```

## `src/config/`

Environment configuration, split into small per-topic files rather than one large object.

- `env.validation.ts` — declares every required environment variable and its validation rules (`class-validator`). `ConfigModule` calls this once at boot; an invalid or missing variable stops the app from starting.
- `app.config.ts`, `database.config.ts`, `jwt.config.ts`, `security.config.ts`, `mail.config.ts` — each registers one **namespace** (`registerAs('jwt', ...)` etc.) so a module that only needs JWT settings injects just that slice instead of a monolithic config object.
- `index.ts` — barrel file exporting all namespaces as a `configurations` array, passed to `ConfigModule.forRoot({ load: configurations })`.

**Belongs here:** anything read from `process.env`.
**Should NOT go here:** business logic, or constants that aren't actually configurable per environment (those belong in `common/constants/`).

## `src/database/`

- `database.module.ts` — configures the Mongoose connection (`MongooseModule.forRootAsync`) using the URI from `ConfigService`, and logs connection lifecycle events.
- `seeds/seed-admin.ts` — a standalone script (run via `npm run seed:admin`) that creates the first `ADMIN` user. There is intentionally no HTTP endpoint for this.

## `src/logger/`

- `app-logger.service.ts` — `AppLogger`, a custom implementation of Nest's `LoggerService` interface. Used everywhere instead of `new Logger()` so all logging goes through one place (and one redaction rule for sensitive fields).
- `logger.module.ts` — marks `LoggerModule` `@Global()` so `AppLogger` doesn't need to be imported into every feature module.

## `src/mail/`

- `mail.service.ts` — the interface every part of the app uses to "send an email." Currently a stub that logs what it would send instead of using a real provider (see [security.md](./security.md) and the root README for how to wire up a real provider later).
- `mail.module.ts` — exports `MailService`.

## `src/auth/`

Owns **authentication**: proving who a user is and issuing/rotating tokens. Does not own the user resource itself (see `src/users/`).

- `auth.controller.ts` — HTTP routes: register, login, refresh, logout, change/forgot/reset-password, verify-email, resend-verification.
- `auth.service.ts` — all authentication business logic (see [authentication-flow.md](./authentication-flow.md)).
- `auth.module.ts` — wires `JwtModule`, `PassportModule`, `UsersModule`, `MailModule`, and the `JwtStrategy` together.
- `strategies/jwt.strategy.ts` — the Passport strategy that verifies access tokens on every protected request.
- `dto/` — one file per request body shape (`RegisterDto`, `LoginDto`, `ChangePasswordDto`, etc.), each annotated with `class-validator` decorators.

**Belongs here:** anything about proving identity or managing tokens/sessions.
**Should NOT go here:** user-profile CRUD, or role-based route restriction logic (that's `common/guards/roles.guard.ts` + `users/`).

## `src/users/`

Owns the **user resource**, once a caller is already authenticated.

- `schemas/user.schema.ts` — the Mongoose schema; see [database-and-schema.md](./database-and-schema.md) for a full field reference.
- `users.service.ts` — the only place in the codebase that queries the `User` model directly (repository pattern). Every other module goes through this service.
- `profile.controller.ts` — `GET /profile`, `PUT /profile` (self-service, any authenticated user).
- `users.controller.ts` — `GET /users`, `DELETE /users/:id` (admin-only, gated by `RolesGuard`).
- `users.module.ts` — registers the Mongoose model and both controllers.
- `dto/update-profile.dto.ts` — the whitelist of fields a user may self-update (deliberately excludes email/password/role).

## `src/health/`

- `health.controller.ts` — `GET /health`, using `@nestjs/terminus` to actually ping MongoDB rather than returning a static 200. Marked `@Public()` (no orchestrator has a JWT) and `@RawResponse()` (skips the `{ success, message, data }` envelope, since health-check tooling expects Terminus's native shape).

## `src/common/`

Everything here is a cross-cutting concern used by more than one feature module. If a file is specific to auth or users business logic, it belongs in `src/auth/` or `src/users/` instead — `common/` is for the plumbing those modules stand on.

- **`constants/`** — metadata keys used by decorators/guards (`IS_PUBLIC_KEY`, `ROLES_KEY`, `RAW_RESPONSE_KEY`) and the shared password-strength regex. Anything that would otherwise be a magic string repeated in multiple files.
- **`decorators/`** — `@Public()`, `@Roles()`, `@CurrentUser()`, `@RawResponse()`. See [authorization-and-roles.md](./authorization-and-roles.md).
- **`dto/`** — DTOs shared across more than one feature (currently just `PaginationQueryDto`).
- **`enums/`** — `Role` (`USER`/`ADMIN`), `TokenType`.
- **`exceptions/`** — domain-specific `HttpException` subclasses (`InvalidCredentialsException`, `AccountLockedException`, etc.) so a failure reason has a distinct, greppable class instead of a bare string.
- **`filters/`** — `AllExceptionsFilter`, the global exception handler. See [error-handling.md](./error-handling.md).
- **`guards/`** — `JwtAuthGuard` (global, required auth by default), `RolesGuard` (per-controller, role restriction).
- **`interceptors/`** — `ResponseInterceptor` (response envelope), `LoggingInterceptor` (per-request log line).
- **`interfaces/`** — shared TypeScript shapes: `JwtPayload`, `AuthenticatedUser`, `ApiSuccessResponse`/`ApiErrorResponse`.
- **`middlewares/`** — `RequestIdMiddleware` (tags every request with a UUID), `MongoSanitizeMiddleware` (strips NoSQL-injection payloads).
- **`utils/`** — pure functions: `password.util.ts` (bcrypt wrapper), `crypto.util.ts` (secure token generation/hashing), `pagination.util.ts` (skip/limit + search-filter helpers).

## `test/`

- `auth.e2e-spec.ts` — full HTTP-level test of the auth flow against a real (in-memory) MongoDB instance via `supertest`.
- `utils/test-app.setup.ts` — boots the actual `AppModule` (not a trimmed-down test module) against `mongodb-memory-server`, applying the same global pipes `main.ts` does.
- Unit tests live next to the code they test (`*.spec.ts` in `src/`), e.g. `src/auth/auth.service.spec.ts`.

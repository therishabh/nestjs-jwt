# Nest JWT Auth API

A production-style authentication service built with NestJS, MongoDB (Mongoose), and JWT. Implements registration, login, refresh-token rotation, logout, change/forgot/reset password, email verification, role-based authorization, and account lockout — with the surrounding infrastructure (config validation, structured logging, global error handling, rate limiting, Swagger docs, Docker) that a real deployment needs.

## Architecture

```
src/
  config/         Typed, validated environment configuration (per-namespace: app, database, jwt, security, mail)
  common/         Cross-cutting building blocks shared by every feature module
    constants/    Metadata keys, regex patterns — no magic strings/numbers scattered around
    decorators/   @Public, @Roles, @CurrentUser, @RawResponse
    dto/          Shared DTOs (pagination)
    enums/        Role, TokenType
    exceptions/   Domain-specific HttpException subclasses
    filters/      Global exception filter -> { success, message, errors } envelope
    guards/       JwtAuthGuard (global), RolesGuard
    interceptors/ Response envelope, request logging
    interfaces/   JwtPayload, AuthenticatedUser, ApiResponse shapes
    middlewares/  Request-ID tagging, NoSQL-injection sanitization
    utils/        Password hashing, secure token generation, pagination helpers
  database/       Mongoose connection setup + admin seed script
  logger/         Structured AppLogger (implements Nest's LoggerService)
  mail/           Mail service (stub transport — see "Email" below)
  users/          User schema/service + Profile and admin Users controllers
  auth/           Registration, login, tokens, password flows, JWT strategy
  health/         Liveness/readiness endpoint (Terminus + MongoDB ping)
```

**Why this shape:** `AuthModule` owns *authentication* (proving identity, issuing/rotating tokens); `UsersModule` owns the *user resource* (profile, admin user list) via a repository-style `UsersService` that is the only code talking to the Mongoose model directly. Cross-cutting concerns (logging, error formatting, response envelope, config) live in `common/`, `logger/`, and `config/` so feature modules stay focused on business logic.

## Request pipeline

Every request passes through, in order:

1. **RequestIdMiddleware** — tags the request with a UUID (`X-Request-Id`), for tracing one request across logs.
2. **MongoSanitizeMiddleware** — strips `$`/`.`-prefixed keys from body/params/query to block NoSQL operator injection.
3. **ThrottlerGuard** (global) — rate limits by IP, thresholds from `THROTTLE_TTL`/`THROTTLE_LIMIT`.
4. **JwtAuthGuard** (global) — requires a valid access token unless the route is `@Public()`.
5. **RolesGuard** (per-controller, e.g. `UsersController`) — restricts to specific `@Roles(...)`.
6. **ValidationPipe** (global) — validates/transforms the body against its DTO; rejects unknown properties.
7. **LoggingInterceptor** → **ResponseInterceptor** — logs the request, then wraps the result as `{ success: true, message, data }` (or lets it through raw if `@RawResponse()`, e.g. `/health`).
8. **AllExceptionsFilter** (global) — catches everything else and formats it as `{ success: false, message, errors }`, logging the real detail server-side without leaking it to the client.

## Setup

```bash
npm install
cp .env.example .env          # fill in a real MONGODB_URI and generate secrets:
openssl rand -base64 48       # run twice, for JWT_ACCESS_SECRET and JWT_REFRESH_SECRET
```

`.env`, `.env.development`, `.env.production` are gitignored — only `.env.example` is committed. The app **refuses to start** if any required variable is missing or invalid (see `src/config/env.validation.ts`); this is deliberate — a misconfigured deployment should fail at boot, not mid-request.

```bash
npm run start:dev     # watch mode
npm run build && npm run start:prod
```

Swagger UI is served at `/docs` in non-production environments (`NODE_ENV=production` disables it). API routes are versioned under `/api/v1` (configurable via `API_PREFIX`).

### Creating the first admin

There is no API endpoint that creates ADMIN users — an unauthenticated "make me an admin" endpoint would be a privilege-escalation hole. Instead:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='Str0ng!AdminPW' npm run seed:admin
```

## Testing

```bash
npm test              # unit tests (mocked dependencies)
npm run test:e2e      # e2e tests against an in-memory MongoDB (mongodb-memory-server) — no real DB needed
npm run test:cov      # coverage
```

## Docker

```bash
# create a .env with JWT_ACCESS_SECRET / JWT_REFRESH_SECRET before running
docker compose up --build
```

Runs the API alongside a bundled MongoDB container, for local use. Point `MONGODB_URI` at MongoDB Atlas instead for anything beyond local development.

> Docker was not available in the environment this project was built in, so the `Dockerfile`/`docker-compose.yml` are written to the documented multi-stage/non-root/healthcheck conventions but have not been build-tested here — verify with `docker compose up --build` before relying on them.

## Security notes

- Passwords hashed with bcrypt (`BCRYPT_SALT_ROUNDS`, tune per environment).
- Refresh, password-reset, and email-verification tokens are never stored raw — only their SHA-256 hash, so a database leak alone doesn't yield usable tokens.
- Refresh tokens rotate on every use; reusing an already-rotated token revokes the entire session (treated as possible theft), not just that one token.
- Accounts lock for `ACCOUNT_LOCK_DURATION_MINUTES` after `ACCOUNT_LOCK_MAX_ATTEMPTS` failed logins.
- `forgot-password` responds identically whether or not the email exists, to prevent account enumeration.
- `helmet()`, `compression()`, and CORS are applied in `main.ts`; rate limiting is global and configurable.

## Email

No real email provider is wired up — `MailService` logs what it would send (see `src/mail/mail.service.ts`). Swap its two `deliver`-calling methods for a real provider (SMTP/SendGrid/SES) when one is chosen; every caller (registration, forgot-password) already depends only on `MailService`'s interface.

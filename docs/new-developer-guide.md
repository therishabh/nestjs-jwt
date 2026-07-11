# New Developer Guide

Read this first. Everything else in `docs/` is reference material you'll come back to as you work — this page gets you running and oriented.

## 1. Project overview

A production-style authentication API built with NestJS, MongoDB (via Mongoose), and JWT. It provides registration, login, refresh-token rotation, logout, change/forgot/reset password, email verification, and role-based authorization (`USER`/`ADMIN`) — plus the infrastructure a real deployment needs: validated configuration, structured logging, a consistent error/response format, rate limiting, account lockout, Swagger docs, health checks, and Docker support.

## 2. Prerequisites

- **Node.js 22** (LTS) — matches the version used in `Dockerfile` (`node:22-alpine`) and the `@types/node` major version in `package.json`.
- **npm** (comes with Node).
- **A MongoDB instance** — MongoDB Atlas for real use, or nothing at all for running tests (the e2e suite spins up its own in-memory MongoDB via `mongodb-memory-server`; no external database is required just to run tests).
- No other tools are required. Docker is optional (see the root `README.md`).

## 3. Installation

```bash
git clone <this repository>
cd nest-jwt
npm install
```

## 4. Environment setup

```bash
cp .env.example .env
```

Then edit `.env` and fill in, at minimum:

- `MONGODB_URI` — your MongoDB Atlas (or local) connection string.
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — two **different** random strings, at least 32 characters each. Generate them with `openssl rand -base64 48`.

Every other variable in `.env.example` has a sensible default and is documented in [environment-configuration.md](./environment-configuration.md). The app **will not start** if a required variable is missing or invalid — that's intentional (see that doc for why).

`.env`, `.env.development`, and `.env.production` are gitignored. Never commit real secrets — only `.env.example` (placeholder values) is tracked.

## 5. Running the application

```bash
npm run start:dev     # watch mode — restarts on file changes (use this day to day)
npm run start:debug   # watch mode + Node debugger attached
npm run build && npm run start:prod   # compiled, production-mode run
```

The API listens on `PORT` (default `3000`) under the prefix `API_PREFIX` (default `/api/v1`) — e.g. `http://localhost:3000/api/v1/health`.

## 6. Running tests

```bash
npm test          # unit tests — mocked dependencies, no database needed
npm run test:cov  # unit tests with coverage report
npm run test:e2e  # end-to-end tests — spins up an in-memory MongoDB automatically
```

Unit tests live next to the code they test (`src/**/*.spec.ts`). The e2e suite (`test/auth.e2e-spec.ts`) drives the real `AppModule` through actual HTTP requests via `supertest`, covering the full register → login → profile → refresh-rotation → logout → password-reset → account-lockout flow.

## 7. Swagger / API documentation

With the app running (and `NODE_ENV` not set to `production`), open **`http://localhost:3000/docs`** for interactive Swagger UI — every endpoint, its request/response shape, and a "Try it out" button that accepts a Bearer token (click **Authorize** at the top and paste an access token from a login response).

## 8. First code to read, in order

Read these files in this order to build a mental model before making changes:

```
src/main.ts                         → how the app boots: pipes, security middleware, Swagger, shutdown
src/app.module.ts                   → how everything is wired together (global guards/interceptors/filters)
src/auth/auth.module.ts             → how the auth feature module is assembled
src/auth/auth.controller.ts         → the HTTP surface for authentication
src/auth/auth.service.ts            → all authentication business logic (read this closely)
src/auth/strategies/jwt.strategy.ts → how an access token is verified on every request
src/common/guards/jwt-auth.guard.ts → how that strategy gets invoked, and how @Public() opts out
src/users/users.service.ts          → the only code that talks to the User model directly
src/users/schemas/user.schema.ts    → what a "user" actually is in this system
```

Then read [architecture.md](./architecture.md) and [authentication-flow.md](./authentication-flow.md) for the full map with diagrams.

## 9. How login works, briefly

`POST /auth/login` with `{ email, password }` → `AuthService.login()` fetches the user (with the password hash, which is normally hidden), checks it isn't locked/inactive, compares the password with bcrypt, and — on success — signs a new access token (short-lived, ~15 min) and refresh token (long-lived, ~7 days), storing only a hash of the refresh token. On failure, it increments a failed-attempt counter that locks the account after too many tries. Full detail: [login-flow.md](./login-flow.md).

## 10. How protected APIs work, briefly

Every route requires a valid `Authorization: Bearer <accessToken>` header **by default** — a global guard (`JwtAuthGuard`) enforces this. A route opts out with the `@Public()` decorator (used for register/login/refresh/health, etc.). Once a token is verified, `@CurrentUser()` lets a controller read who's making the request. Some routes additionally require a specific role (`@Roles(Role.ADMIN)` + `RolesGuard`), currently only the admin user-management endpoints. Full detail: [authorization-and-roles.md](./authorization-and-roles.md).

## 11. How to add a new protected endpoint

Follow the pattern in `src/users/profile.controller.ts`:

1. Add a method to the relevant controller (or a new one). No `@Public()` needed — protection is the default.
2. Accept input via a DTO (create one in that module's `dto/` folder, annotated with `class-validator` decorators) — never a bare `@Body() body: any`.
3. Read the caller's identity with `@CurrentUser('userId') userId: string` (or `@CurrentUser() user: AuthenticatedUser` for the full object) rather than `@Req()`.
4. Delegate to a service method — don't put business logic or database calls in the controller.
5. Return `{ message: 'Something happened', data: result }` — the global `ResponseInterceptor` wraps this automatically; don't build the `{ success, ... }` envelope by hand.
6. If the endpoint should be restricted by role, add `@UseGuards(RolesGuard)` and `@Roles(Role.ADMIN)` on the controller or method (see `src/users/users.controller.ts` for a working example).

## 12. How to add a new module

Follow the shape of `src/users/` or `src/auth/`:

- One `<name>.module.ts` per feature, registering its controllers/providers and importing whatever it depends on (e.g. `MongooseModule.forFeature(...)` if it has its own schema).
- Put the schema (if any) in `<module>/schemas/`, DTOs in `<module>/dto/`, and keep all data-access behind one service — don't let controllers or other modules import a Mongoose model directly.
- Import the new module into `src/app.module.ts`'s `imports` array.
- Cross-cutting things (used by more than one feature module) go in `src/common/`, not inside a feature module.

## 13. Common mistakes

- **Bypassing `UsersService` to query the `User` model directly from another module.** Every user query goes through `UsersService` so the soft-delete filter (`isDeleted: false`) and the hidden-field conventions stay consistent. See [database-and-schema.md](./database-and-schema.md).
- **Forgetting a field is `select: false`.** If you add a new sensitive field to the schema, mark it `select: false` and add it to the `toJSON` transform's strip list — otherwise it can leak into a response.
- **Using `$set: { field: undefined }` to clear a MongoDB field.** MongoDB's driver silently drops `undefined` values from an update document, so this is a no-op. Use `$unset` instead (see `UsersService.setRefreshTokenHash` for the pattern — this exact mistake was found and fixed once already in this codebase).
- **Adding a new DTO field without a `class-validator` decorator.** The global `ValidationPipe` uses `whitelist: true`, which silently strips any undecorated property — it won't error, it just won't do what you expect.
- **Assuming a route is public by default.** It isn't — `JwtAuthGuard` is global. A new route needs `@Public()` explicitly if it should be reachable without a token.
- **Comparing a raw token against a stored value with `===` after forgetting to hash it first.** Refresh/reset/verification tokens are stored as SHA-256 hashes (`hashToken()`), never raw — always hash the incoming raw token before comparing.

## 14. Debugging guide

| Symptom                                                                   | Where to look                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App won't start, error mentions "Environment variable validation failed"  | `src/config/env.validation.ts` — the message names the offending variable. Check your `.env`.                                                                                                                                                                                 |
| MongoDB connection fails / times out                                      | Check `MONGODB_URI` in `.env`; check `src/database/database.module.ts`'s logged connection events; confirm your IP is allow-listed in Atlas.                                                                                                                                  |
| `Login` always returns "Invalid email or password"                        | Confirm the account exists and isn't locked (`lockUntil` field) or inactive (`isActive`); check `AuthService.login` in `src/auth/auth.service.ts`.                                                                                                                            |
| A protected route returns 401                                             | The access token is missing, expired, malformed, or the account was deactivated/deleted since the token was issued — see `JwtStrategy.validate()` in `src/auth/strategies/jwt.strategy.ts`. Try logging in again to get a fresh token.                                        |
| A route returns 403                                                       | You're authenticated but lack the required role — check `@Roles(...)` on that controller/route and the token's `role` claim. See [authorization-and-roles.md](./authorization-and-roles.md).                                                                                  |
| A request body is rejected with "property X should not exist"             | The `ValidationPipe`'s `forbidNonWhitelisted` caught a field not declared on the DTO — check the relevant `dto/*.ts` file.                                                                                                                                                    |
| A request body is rejected with a validation message you don't understand | Check the DTO's `class-validator` decorators for that field, and the shared rules in `src/common/constants/validation.constants.ts` (password strength).                                                                                                                      |
| Refresh token requests fail with 401 right after a successful refresh     | Expected if you're reusing an already-rotated-out token — see [refresh-token-flow.md](./refresh-token-flow.md) for why this revokes the whole session rather than just failing once.                                                                                          |
| Tests fail with a MongoDB-related error                                   | `test/utils/test-app.setup.ts` spins up `mongodb-memory-server` automatically — no external MongoDB should be needed for `npm test`/`npm run test:e2e`. If it's timing out, check available disk space/memory (the in-memory server downloads a MongoDB binary on first run). |

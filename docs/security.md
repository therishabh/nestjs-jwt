# Security

Every security-relevant decision in this codebase, what problem it solves, how it works, and where it lives.

## Password hashing

**Problem:** storing passwords in plaintext (or with a fast, reversible hash) means a database leak instantly compromises every account.
**How:** bcrypt, via `src/common/utils/password.util.ts` (`hashValue`/`compareValue`). Bcrypt is deliberately slow and includes a per-hash salt, making both brute-force and rainbow-table attacks impractical.
**Where:** `AuthService.register`, `changePassword`, `resetPassword` (hashing); `AuthService.login`, `changePassword` (comparison). Cost factor is `BCRYPT_SALT_ROUNDS` (env-configurable, not a hard-coded magic number).

## JWT secrets

**Problem:** a weak or hard-coded signing secret lets an attacker forge valid tokens.
**How:** `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are required environment variables, validated to be **at least 32 characters** by `src/config/env.validation.ts` — the app refuses to start otherwise. Two separate secrets mean a leaked access-token secret can't be used to forge a refresh token.
**Where:** `src/config/jwt.config.ts`, `src/config/env.validation.ts`, consumed in `src/auth/auth.module.ts` and `src/auth/strategies/jwt.strategy.ts`.

## Refresh token hashing

**Problem:** storing refresh tokens raw means a database leak hands out working, long-lived (7-day) sessions for every user.
**How:** only a SHA-256 hash of each refresh token is persisted (`refreshTokenHash` on `User`); the raw token exists only in the JWT itself, never in the database. See [refresh-token-flow.md](./refresh-token-flow.md) for the full reasoning (including why SHA-256, not bcrypt, is the right choice here).
**Where:** `src/common/utils/crypto.util.ts` (`hashToken`), `src/auth/auth.service.ts` (`issueTokenPair`, `refreshTokens`).

## Refresh token rotation + reuse detection

**Problem:** a refresh token valid for its entire 7-day life, if stolen, gives an attacker a week of access.
**How:** every refresh call issues a new refresh token and invalidates the old one. Reuse of an already-rotated token is treated as a signal of possible theft and revokes the _entire_ session, not just that one request.
**Where:** `AuthService.refreshTokens` — see [refresh-token-flow.md](./refresh-token-flow.md) for the full mechanism and a sequence diagram.

## Secure password-reset / email-verification tokens

**Problem:** a predictable or storable-in-plaintext reset token could be guessed or stolen from a database leak.
**How:** `crypto.randomBytes(32)` (256 bits of entropy) via `generateSecureToken()`, hashed with SHA-256 before storage, with a server-side expiry enforced directly in the lookup query (so an expired token is indistinguishable from an unknown one).
**Where:** `src/common/utils/crypto.util.ts`; `AuthService.forgotPassword/resetPassword/verifyEmail`; `passwordResetTokenHash`/`emailVerificationTokenHash` fields on `User`.

## Account lockout

**Problem:** without a limit, an attacker can brute-force a password with unlimited attempts.
**How:** `failedLoginAttempts` increments on each wrong password; at `ACCOUNT_LOCK_MAX_ATTEMPTS` (default 5) the account is locked for `ACCOUNT_LOCK_DURATION_MINUTES` (default 15). Independent of IP-based rate limiting, so distributing attempts across IPs doesn't bypass it.
**Where:** `UsersService.registerFailedLoginAttempt`, checked in `AuthService.login`.

## Rate limiting

**Problem:** without a limit, any single client (or botnet) can flood the API.
**How:** `@nestjs/throttler`'s `ThrottlerGuard`, registered globally, limiting requests per IP within a rolling window (`THROTTLE_TTL`/`THROTTLE_LIMIT`, env-configurable). Runs before the authentication guard, so excess requests are rejected before any database lookup.
**Where:** `src/app.module.ts` (`ThrottlerModule.forRootAsync`, `APP_GUARD`).

## DTO validation, whitelisting

**Problem:** trusting client input directly risks malformed data, injection, or a client setting fields it shouldn't be able to (e.g. `role`).
**How:** every request body is validated against a `class-validator`-annotated DTO by the global `ValidationPipe`. `whitelist: true` strips undeclared properties; `forbidNonWhitelisted: true` rejects the request outright if one was present, rather than silently dropping it.
**Where:** `src/main.ts` (pipe configuration); every file in `src/**/dto/`.

## Environment validation

**Problem:** a misconfigured deployment (missing secret, malformed URI) should fail loudly at startup, not mysteriously mid-request in production.
**How:** `src/config/env.validation.ts` declares every required variable and its constraints; `ConfigModule.forRoot({ validate })` runs it once at boot and throws if anything is invalid.
**Where:** `src/config/env.validation.ts`, wired in `src/app.module.ts`.

## MongoDB / NoSQL injection protection

**Problem:** a client-controlled object like `{ "email": { "$gt": "" } }` could be interpreted by Mongoose as a query operator instead of a literal value, potentially bypassing intended query logic.
**How:** `MongoSanitizeMiddleware` recursively strips any key starting with `$` or containing `.` from `req.body`/`req.params`/`req.query`, applied globally.
**Where:** `src/common/middlewares/mongo-sanitize.middleware.ts`. (Note: this project wrote a custom version rather than using the `express-mongo-sanitize` package, because that package reassigns `req.query` wholesale, which throws under Express 5 — used by Nest 11 — since `req.query` is a getter-only accessor there.)

## Sensitive-field exclusion

**Problem:** a careless query or `return user` could leak a password hash or token hash in an API response.
**How:** two layers — `select: false` on the schema (so a plain query never fetches these fields), plus a `toJSON` transform that strips them from serialization regardless of how the document was fetched. See [database-and-schema.md](./database-and-schema.md).
**Where:** `src/users/schemas/user.schema.ts`.

## No password/secrets in logs

**Problem:** logging a raw request or error object could accidentally include a password, token, or secret.
**How:** `AppLogger.auth()` runs every `meta` object through a `sanitize()` step that redacts known-sensitive keys (`password`, `newPassword`, `oldPassword`, `refreshToken`, `accessToken`, `token`) before logging.
**Where:** `src/logger/app-logger.service.ts`.

## Security HTTP headers, CORS, compression

**Problem:** missing security headers (CSP, HSTS, X-Frame-Options, etc.) leave common browser-based attacks (clickjacking, MIME sniffing) unmitigated; unrestricted CORS lets any origin call the API from a browser.
**How:** `helmet()` sets a standard battery of security headers; `app.enableCors({ origin: corsOrigin, credentials: true })` restricts allowed origins to the configured `CORS_ORIGIN`; `compression()` reduces response size (a performance measure, included here since it's applied at the same point in `main.ts`).
**Where:** `src/main.ts`.

## Non-root Docker user

**Problem:** a compromised process running as root inside a container hands an attacker root within that container.
**How:** the `Dockerfile`'s final stage creates and switches to a dedicated non-root user (`nestjs`) before running the app.
**Where:** `Dockerfile`.

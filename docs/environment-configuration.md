# Environment Configuration

## How configuration is loaded

`src/app.module.ts` calls:

```ts
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
  load: configurations,
  validate,
});
```

- **`isGlobal: true`** — `ConfigService` is injectable anywhere without re-importing `ConfigModule` in every feature module.
- **`envFilePath`** — tries `.env.development` (or `.env.production`, etc., based on `NODE_ENV`) first, then falls back to `.env`. The _first_ file's values win over later ones, and real process environment variables (e.g. injected by a hosting platform) always win over anything in these files.
- **`load: configurations`** — an array of small, namespaced config factories (see below), from `src/config/index.ts`.
- **`validate`** — see the next section. Runs once, at boot.

## Validation — the app refuses to start if misconfigured

`src/config/env.validation.ts` declares every required environment variable using `class-validator` decorators on a plain class, then `plainToInstance` + `validateSync` check the actual environment against it. If anything is missing or invalid, `ConfigModule.forRoot` throws — the process never finishes starting.

This is deliberate: a missing `JWT_ACCESS_SECRET`, for example, would otherwise only surface the first time someone tries to log in — possibly in production, mid-incident. Failing at boot means a misconfigured deployment is caught immediately, not discovered under load.

## Namespaced config files

Rather than one large configuration object, `src/config/` has one file per topic, each using `registerAs(name, factory)`:

| File                 | Namespace  | Contains                                                                                                                                                                                   |
| -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.config.ts`      | `app`      | `nodeEnv`, `port`, `apiPrefix`, `corsOrigin`, `frontendUrl`                                                                                                                                |
| `database.config.ts` | `database` | `uri`                                                                                                                                                                                      |
| `jwt.config.ts`      | `jwt`      | `accessSecret`, `accessExpiration`, `refreshSecret`, `refreshExpiration`                                                                                                                   |
| `security.config.ts` | `security` | `bcryptSaltRounds`, `throttleTtl`, `throttleLimit`, `resetPasswordTokenExpirationMinutes`, `emailVerificationTokenExpirationHours`, `accountLockMaxAttempts`, `accountLockDurationMinutes` |
| `mail.config.ts`     | `mail`     | `host`, `port`, `user`, `password`, `from`                                                                                                                                                 |

A module that only cares about JWT settings injects just `jwt.KEY`'s type (`ConfigType<typeof jwtConfig>`) via `configService.get('jwt')`, rather than depending on one giant object that also happens to contain mail settings. `src/config/index.ts` exports all of them as a `configurations` array for `ConfigModule.forRoot({ load: configurations })`.

## All environment variables

Source of truth: `.env.example` (committed, no real secrets) and `src/config/env.validation.ts` (enforced). Copy `.env.example` to `.env` (or `.env.development`/`.env.production`) and fill in real values — those three files are gitignored.

| Variable                                                  | Required | Example                 | Purpose                                                                        |
| --------------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`                                                | yes      | `development`           | `development` \| `production` \| `test`. Also picks which `.env.*` file loads. |
| `PORT`                                                    | yes      | `3000`                  | HTTP port the app listens on                                                   |
| `API_PREFIX`                                              | yes      | `api/v1`                | Global route prefix (`app.setGlobalPrefix`)                                    |
| `CORS_ORIGIN`                                             | yes      | `http://localhost:3000` | Allowed CORS origin(s), comma-separated, or `*` (avoid `*` in production)      |
| `MONGODB_URI`                                             | yes      | `mongodb+srv://...`     | MongoDB Atlas (or any MongoDB) connection string                               |
| `JWT_ACCESS_SECRET`                                       | yes      | 32+ random chars        | Signs access tokens. Generate with `openssl rand -base64 48`.                  |
| `JWT_ACCESS_EXPIRATION`                                   | yes      | `15m`                   | Access token lifetime                                                          |
| `JWT_REFRESH_SECRET`                                      | yes      | 32+ random chars        | Signs refresh tokens (must differ from the access secret)                      |
| `JWT_REFRESH_EXPIRATION`                                  | yes      | `7d`                    | Refresh token lifetime                                                         |
| `BCRYPT_SALT_ROUNDS`                                      | yes      | `12`                    | bcrypt cost factor for password hashing                                        |
| `THROTTLE_TTL`                                            | yes      | `60`                    | Rate-limit window, in seconds                                                  |
| `THROTTLE_LIMIT`                                          | yes      | `20`                    | Max requests per `THROTTLE_TTL` window, per IP                                 |
| `RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES`                 | yes      | `15`                    | Password-reset token lifetime                                                  |
| `EMAIL_VERIFICATION_TOKEN_EXPIRATION_HOURS`               | yes      | `24`                    | Email-verification token lifetime                                              |
| `ACCOUNT_LOCK_MAX_ATTEMPTS`                               | yes      | `5`                     | Failed logins before lockout                                                   |
| `ACCOUNT_LOCK_DURATION_MINUTES`                           | yes      | `15`                    | Lockout duration                                                               |
| `FRONTEND_URL`                                            | yes      | `http://localhost:5173` | Used to build reset-password/verify-email links                                |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASSWORD` | no       | —                       | Reserved for a real mail provider; unused by the current stub `MailService`    |
| `MAIL_FROM`                                               | no       | `no-reply@example.com`  | "From" address the stub logs                                                   |

Never commit real values for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, or `MONGODB_URI` — only `.env.example` (with placeholder values) is tracked in git.

# API Reference

All routes are prefixed with `API_PREFIX` (default `/api/v1`). Interactive documentation (request/response examples, "Try it out") is available at `/docs` when `NODE_ENV` is not `production` (Swagger UI, configured in `src/main.ts`).

| Method | Path                        | Auth                  | Body (DTO)                      | Notes                                                                                                     |
| ------ | --------------------------- | --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| POST   | `/auth/register`            | Public                | `RegisterDto`                   | See [registration-flow.md](./registration-flow.md)                                                        |
| POST   | `/auth/login`               | Public                | `LoginDto`                      | Returns `TokenPair`. See [login-flow.md](./login-flow.md)                                                 |
| POST   | `/auth/refresh`             | Public                | `RefreshTokenDto`               | Rotates the refresh token. See [refresh-token-flow.md](./refresh-token-flow.md)                           |
| POST   | `/auth/logout`              | Bearer                | —                               | Revokes the current refresh token                                                                         |
| POST   | `/auth/change-password`     | Bearer                | `ChangePasswordDto`             | Also revokes the refresh token (forces re-login elsewhere)                                                |
| POST   | `/auth/forgot-password`     | Public                | `ForgotPasswordDto`             | Always returns the same message, regardless of whether the email exists                                   |
| POST   | `/auth/reset-password`      | Public                | `ResetPasswordDto`              | Consumes the reset token                                                                                  |
| POST   | `/auth/verify-email`        | Public                | `VerifyEmailDto`                | Consumes the verification token                                                                           |
| POST   | `/auth/resend-verification` | Bearer                | —                               | No-op if already verified                                                                                 |
| GET    | `/profile`                  | Bearer                | —                               | Returns the current user. See [profile-flow.md](./profile-flow.md)                                        |
| PUT    | `/profile`                  | Bearer                | `UpdateProfileDto`              | firstName/lastName/phoneNumber/avatar only                                                                |
| GET    | `/users`                    | Bearer + `ADMIN` role | — (query: `PaginationQueryDto`) | Paginated, searchable user list                                                                           |
| DELETE | `/users/:id`                | Bearer + `ADMIN` role | —                               | Soft-deletes a user                                                                                       |
| GET    | `/health`                   | Public                | —                               | Liveness/readiness check; pings MongoDB. Not wrapped in the standard response envelope (`@RawResponse()`) |

"Bearer" means the request must include `Authorization: Bearer <accessToken>`. "Bearer + `ADMIN` role" additionally requires the authenticated user's `role` to be `ADMIN` (see [authorization-and-roles.md](./authorization-and-roles.md)).

## Response shapes

Every endpoint except `/health` returns one of:

```json
{ "success": true, "message": "...", "data": { ... } }
{ "success": false, "message": "...", "errors": ["..."] }
```

See [error-handling.md](./error-handling.md) for exactly how errors are mapped to HTTP statuses, and [request-lifecycle.md](./request-lifecycle.md) for how the envelope is applied.

## Where each route is defined

| Controller        | File                              |
| ----------------- | --------------------------------- |
| Auth routes       | `src/auth/auth.controller.ts`     |
| Profile routes    | `src/users/profile.controller.ts` |
| Admin user routes | `src/users/users.controller.ts`   |
| Health route      | `src/health/health.controller.ts` |

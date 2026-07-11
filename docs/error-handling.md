# Error Handling

## Response envelope

Every response from this API follows one of two shapes:

```json
// success
{ "success": true, "message": "...", "data": { ... } }

// error
{ "success": false, "message": "...", "errors": ["..."] }
```

Controllers never build either shape by hand. They just return `{ message, data }` (or, for errors, throw); the global infrastructure below does the wrapping.

## Success path: `ResponseInterceptor`

`src/common/interceptors/response.interceptor.ts`, registered globally (`APP_INTERCEPTOR` in `app.module.ts`). Wraps whatever a controller returns into `{ success: true, message, data }`. If a controller returns plain data with no `message`/`data` keys, it's wrapped with a default message ("Request successful").

Routes marked `@RawResponse()` (currently only `GET /health`) skip this wrapping entirely — health-check tooling expects Terminus's native response shape, not this project's envelope.

## Failure path: `AllExceptionsFilter`

`src/common/filters/all-exceptions.filter.ts`, registered globally (`APP_FILTER`). `@Catch()` with no argument means it catches **everything** thrown anywhere in the request pipeline — a thrown `HttpException`, an unexpected bug, a database error, anything.

It maps what it catches to an HTTP status + safe message, in this order:

| Exception type                                                                                                                                 | HTTP status                | Client sees                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `HttpException` (Nest's base class, and everything extending it — including custom exceptions below and `class-validator`'s validation errors) | The exception's own status | Its own message, or the array of validation messages from the `ValidationPipe` |
| `Mongoose.Error.ValidationError`                                                                                                               | 400                        | "Validation failed" + the individual field errors                              |
| `Mongoose.Error.CastError` (e.g. an invalid ObjectId in a route param)                                                                         | 400                        | "Invalid identifier supplied"                                                  |
| MongoDB duplicate-key error (code `11000`)                                                                                                     | 409                        | "Duplicate value violates a unique constraint"                                 |
| Anything else (a genuine bug)                                                                                                                  | 500                        | "Internal server error" — **never** the real error message                     |

That last row is deliberate: an unrecognized exception is treated as a bug, not user error, and its actual message/stack is never echoed to the client — only logged server-side (via `AppLogger`, tagged with the request's `X-Request-Id` for tracing — see below). This prevents accidentally leaking internal details (file paths, library internals, sometimes even connection strings in a driver error) to an API caller.

## Custom exceptions

`src/common/exceptions/app.exceptions.ts` — domain-specific subclasses of Nest's built-in `HttpException` types, so each failure has a distinct, greppable class name instead of a generic `throw new UnauthorizedException('some string')` repeated with slightly different wording across the codebase:

| Exception                           | Extends                       | Used when                                                                       |
| ----------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `EmailAlreadyExistsException`       | `ConflictException` (409)     | Registering with an email already in use                                        |
| `InvalidCredentialsException`       | `UnauthorizedException` (401) | Login with an unknown email or wrong password                                   |
| `AccountLockedException`            | `UnauthorizedException` (401) | Login attempt on a locked account                                               |
| `AccountInactiveException`          | `UnauthorizedException` (401) | Login attempt on a deactivated account                                          |
| `InvalidRefreshTokenException`      | `UnauthorizedException` (401) | Refresh token fails verification, hash mismatch, or belongs to an inactive user |
| `InvalidResetTokenException`        | `UnauthorizedException` (401) | Password-reset token is unknown/expired                                         |
| `InvalidVerificationTokenException` | `UnauthorizedException` (401) | Email-verification token is unknown/expired                                     |
| `IncorrectPasswordException`        | `UnauthorizedException` (401) | Wrong current password on change-password                                       |

## Validation errors

The global `ValidationPipe` (`src/main.ts`) runs `class-validator` against every DTO. A validation failure throws a `BadRequestException` (400) whose response body is an array of human-readable messages (e.g. `"Password must be at least 8 characters long and include..."`) — `AllExceptionsFilter` surfaces these as the `errors` array in the response, with the top-level `message` set to a general "Validation failed" when there are multiple.

`forbidNonWhitelisted: true` means an unexpected property (e.g. `role` in a profile-update body) also produces a 400 with a message like `"property role should not exist"`, rather than being silently dropped.

## Tracing an error back to its request

`RequestIdMiddleware` (`src/common/middlewares/request-id.middleware.ts`) tags every request with a UUID (`req.id`), echoed as the `X-Request-Id` response header. `AllExceptionsFilter` includes that same id in its server-side log line. If a client reports "this call failed," the request ID they got back (or that a load balancer/APM logged) pinpoints the exact log line — no need to correlate by timestamp across concurrent requests.

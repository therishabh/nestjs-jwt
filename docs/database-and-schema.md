# Database and User Schema

The application uses **MongoDB** via **Mongoose**, Nest's officially-recommended ODM (Object-Document Mapper) for MongoDB. There is currently one schema: `User` (`src/users/schemas/user.schema.ts`).

## Connection setup

`src/database/database.module.ts` configures the connection via `MongooseModule.forRootAsync`, reading the URI from `ConfigService` (never hard-coded — see [environment-configuration.md](./environment-configuration.md)). It also wires up connection-lifecycle logging (connected/disconnected/reconnected/error) through `AppLogger`, and sets `serverSelectionTimeoutMS: 10000` so the underlying MongoDB driver retries the initial connection instead of crashing the process the moment Atlas is briefly unreachable.

## `User` schema fields

| Field                        | Type                                             | Required | Default | Sensitive (hidden from queries/responses) | Description                                                                                     |
| ---------------------------- | ------------------------------------------------ | -------- | ------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `_id`                        | ObjectId                                         | auto     | —       | no                                        | MongoDB's document id                                                                           |
| `firstName`                  | string                                           | yes      | —       | no                                        | Trimmed                                                                                         |
| `lastName`                   | string                                           | yes      | —       | no                                        | Trimmed                                                                                         |
| `email`                      | string                                           | yes      | —       | no                                        | Lowercased + trimmed; **unique index** at the DB level                                          |
| `password`                   | string                                           | yes      | —       | **yes** (`select: false`)                 | bcrypt hash, never plaintext                                                                    |
| `phoneNumber`                | string                                           | no       | —       | no                                        | Optional                                                                                        |
| `avatar`                     | string                                           | no       | —       | no                                        | Optional URL                                                                                    |
| `role`                       | `Role` enum                                      | no       | `USER`  | no                                        | `USER` or `ADMIN`                                                                               |
| `isEmailVerified`            | boolean                                          | no       | `false` | no                                        | Set by the email-verification flow                                                              |
| `isActive`                   | boolean                                          | no       | `true`  | no                                        | Deactivated accounts fail login and lose valid tokens immediately (checked in `JwtStrategy`)    |
| `refreshTokenHash`           | string                                           | no       | —       | **yes** (`select: false`)                 | SHA-256 hash of the current refresh token; see [refresh-token-flow.md](./refresh-token-flow.md) |
| `passwordResetTokenHash`     | string                                           | no       | —       | **yes** (`select: false`)                 | SHA-256 hash of an active password-reset token                                                  |
| `passwordResetExpires`       | Date                                             | no       | —       | **yes** (`select: false`)                 | Expiry for the reset token                                                                      |
| `emailVerificationTokenHash` | string                                           | no       | —       | **yes** (`select: false`)                 | SHA-256 hash of an active verification token                                                    |
| `emailVerificationExpires`   | Date                                             | no       | —       | **yes** (`select: false`)                 | Expiry for the verification token                                                               |
| `failedLoginAttempts`        | number                                           | no       | `0`     | no                                        | Reset to 0 on successful login                                                                  |
| `lockUntil`                  | Date                                             | no       | —       | no                                        | Present + in the future ⇒ account locked; see [login-flow.md](./login-flow.md)                  |
| `lastLogin`                  | Date                                             | no       | —       | no                                        | Timestamp of the most recent successful login                                                   |
| `loginCount`                 | number                                           | no       | `0`     | no                                        | Incremented on every successful login                                                           |
| `loginHistory`               | array of `{ timestamp, ipAddress?, userAgent? }` | no       | `[]`    | no                                        | Capped at the most recent 20 entries                                                            |
| `isDeleted`                  | boolean                                          | no       | `false` | no                                        | Soft-delete flag — see below                                                                    |
| `deletedAt`                  | Date                                             | no       | —       | no                                        | Set when soft-deleted                                                                           |
| `createdAt`                  | Date                                             | auto     | —       | no                                        | Managed by Mongoose (`timestamps: true`)                                                        |
| `updatedAt`                  | Date                                             | auto     | —       | no                                        | Managed by Mongoose (`timestamps: true`)                                                        |

## Email normalization

Enforced twice: the schema declares `lowercase: true, trim: true` on the `email` field, and `UsersService.create()` also lowercases/trims before insert. Every lookup method in `UsersService` (`findByEmail`, `findByEmailWithSecrets`) normalizes its input the same way, so `Jane@Example.com` reliably matches a record stored as `jane@example.com`.

## Unique index

`@Prop({ unique: true, ... })` on `email` creates a unique index at the MongoDB level. This is the real guarantee against duplicate accounts — `UsersService.findByEmail()` is checked first (for a friendly 409 error), but a database-level constraint is what actually prevents a race condition where two concurrent registrations with the same email both pass that check before either insert completes.

## Password hashing

Never stored in plaintext. `AuthService` hashes with bcrypt (`src/common/utils/password.util.ts`, salt rounds from `BCRYPT_SALT_ROUNDS`) before calling `UsersService.create()`/`updatePassword()`.

## Sensitive-field exclusion — two layers

1. **`select: false`** on the schema (password, all token hashes) — a plain `findOne`/`find` never fetches these fields at all. Code that genuinely needs one (e.g. `AuthService.login()` needs the password hash) explicitly opts back in with `.select('+password')` (see `UsersService.findByEmailWithSecrets`).
2. **`toJSON` transform** (bottom of `user.schema.ts`) — strips those same fields (plus `__v`) from _any_ document being serialized, even one that was explicitly `.select()`-ed with them. This is the last line of defense: if a query ever re-selects `password` and the resulting document reaches a response without this transform, the field would leak. It doesn't, because every response goes through `toJSON()`.

## Soft delete

`isDeleted`/`deletedAt` — `UsersService.softDelete()` only ever sets these flags; it never issues a physical `deleteOne`. Every read method in `UsersService` filters `isDeleted: false`. This preserves referential integrity and an audit trail, and makes a deletion reversible (by manually clearing the flag, since there's currently no "undelete" endpoint). An index on `isDeleted` (`UserSchema.index({ isDeleted: 1 })`) keeps that filter fast as the collection grows.

## Account status and locking

- `isActive` — checked both at login (`AuthService.login`) and on every subsequent authenticated request (`JwtStrategy.validate`), so deactivating an account takes effect immediately rather than waiting for the current access token to expire.
- `failedLoginAttempts` / `lockUntil` — see [login-flow.md](./login-flow.md) for the full lockout mechanism.

## Login history

`loginHistory` is an embedded array (a Mongoose sub-schema, `LoginHistoryEntry`, defined in the same file with `{ _id: false }` since each entry doesn't need its own id). Capped at 20 entries via MongoDB's `$slice: -20` on every push, so it can't grow the document unboundedly over a long account lifetime.

## Email verification / password reset fields

Both follow the identical pattern: a SHA-256 **hash** of a randomly-generated token (never the raw token) plus an expiry timestamp, both `select: false`. See [refresh-token-flow.md](./refresh-token-flow.md) for why hashing (not encryption or plaintext) is used, and [password-management.md](./password-management.md) for the full reset flow.

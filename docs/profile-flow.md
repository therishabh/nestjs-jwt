# Profile Flow

Both endpoints live in `src/users/profile.controller.ts`, protected by the global `JwtAuthGuard` (no `@Public()` — every request must carry a valid access token). Separate from `AuthController` on purpose: `AuthController` owns _authentication_ (proving identity, issuing tokens); `ProfileController` owns the _user resource_ once you're already authenticated.

## `GET /profile`

```
Client (authenticated)
  ↓
GET /profile
  ↓
ProfileController.getProfile()  — userId from @CurrentUser('userId')
  ↓
UsersService.findActiveByIdOrThrow(userId)
  ↓
Response: { message: "Profile fetched successfully", data: <user> }
```

Returns the full user document (minus password/token-hash fields, stripped by the schema's `toJSON` transform — see [database-and-schema.md](./database-and-schema.md)). Throws a 404 (`NotFoundException`) if the account was soft-deleted since the token was issued.

## `PUT /profile`

```
Client (authenticated)
  ↓
PUT /profile  { firstName?, lastName?, phoneNumber?, avatar? }
  ↓
UpdateProfileDto validation
  ↓
ProfileController.updateProfile()
  ↓
UsersService.updateProfile(userId, dto)
  ↓
Response: { message: "Profile updated successfully", data: <updated user> }
```

## Why `email`, `password`, and `role` can't be changed here

`UpdateProfileDto` (`src/users/dto/update-profile.dto.ts`) only declares `firstName`, `lastName`, `phoneNumber`, `avatar`. Combined with the global `ValidationPipe`'s `forbidNonWhitelisted: true` (configured in `src/main.ts`), sending `{ "email": "new@example.com" }` to this endpoint returns a **400 Bad Request** — the request is rejected outright, not silently ignored. This is verified by the e2e test `rejects attempts to change email/role through the profile endpoint`.

Those three fields have their own, more carefully guarded paths instead:

- `email` — no update path exists at all in this codebase (changing an account's primary identifier has implications this project doesn't currently handle, such as re-verification).
- `password` — via `POST /auth/change-password` (requires the _current_ password; see [password-management.md](./password-management.md)).
- `role` — no self-service path exists; only the seed script (`npm run seed:admin`) can create an `ADMIN` account.

## Files involved

| Concern             | File                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| Routes              | `src/users/profile.controller.ts`                                       |
| Update whitelist    | `src/users/dto/update-profile.dto.ts`                                   |
| Data access         | `src/users/users.service.ts` (`findActiveByIdOrThrow`, `updateProfile`) |
| Identity resolution | `src/common/decorators/current-user.decorator.ts`                       |

# Authorization and Roles

## Roles in this project

Defined in `src/common/enums/role.enum.ts`:

```ts
export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',
}
```

Every user has exactly one role, stored on the `User` schema (default `USER` — see `src/users/schemas/user.schema.ts`). There is no self-service way to become `ADMIN`: no registration field, no profile-update field. The only way an `ADMIN` account is created is the seed script (`src/database/seeds/seed-admin.ts`, run via `npm run seed:admin`) — see the root README. This is deliberate: an unauthenticated (or even authenticated-but-unprivileged) "make me an admin" pathway would be a privilege-escalation hole.

## Two independent mechanisms: authentication vs. authorization

It's easy to conflate these, so this project keeps them as two separate guards:

- **`JwtAuthGuard`** (`src/common/guards/jwt-auth.guard.ts`) answers _"is this a valid, currently-usable token?"_ — authentication. It's global (`APP_GUARD` in `app.module.ts`), so every route requires a valid access token by default.
- **`RolesGuard`** (`src/common/guards/roles.guard.ts`) answers _"is this authenticated user's role allowed here?"_ — authorization. It's **not** global; it only runs on controllers that explicitly apply it.

## `@Public()` — opting out of authentication

```ts
// src/common/decorators/public.decorator.ts
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`JwtAuthGuard.canActivate()` checks for this metadata first, and returns `true` immediately (skipping the JWT check entirely) if present:

```ts
canActivate(context: ExecutionContext) {
  const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (isPublic) return true;
  return super.canActivate(context);
}
```

Routes marked `@Public()` in this codebase: `register`, `login`, `refresh`, `forgot-password`, `reset-password`, `verify-email` (all in `AuthController`), and `health` (`HealthController` — an orchestrator's health check has no JWT to send).

## `@Roles(...)` and `RolesGuard` — restricting by role

```ts
// src/common/decorators/roles.decorator.ts
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

```ts
// src/common/guards/roles.guard.ts (simplified)
canActivate(context: ExecutionContext): boolean {
  const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [...]);
  if (!requiredRoles || requiredRoles.length === 0) return true;   // no restriction declared
  const { user } = context.switchToHttp().getRequest();
  return !!user && requiredRoles.includes(user.role);
}
```

A route with no `@Roles(...)` metadata is allowed through by `RolesGuard` — role restriction is opt-in per controller/route, layered on top of the (separate, mandatory) authentication check.

**Where it's actually used:** `UsersController` (`src/users/users.controller.ts`) is the only controller that applies it:

```ts
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController { ... }
```

This makes `GET /users` (list users) and `DELETE /users/:id` (soft-delete a user) accessible only to `ADMIN` accounts. A `USER`-role token gets a 403 from these routes (verified by the e2e test `denies a regular user access to the admin-only users list` in `test/auth.e2e-spec.ts`).

## `@CurrentUser()` — reading the authenticated identity

```ts
// src/common/decorators/current-user.decorator.ts
export const CurrentUser = createParamDecorator((property, ctx) => {
  const request = ctx.switchToHttp().getRequest();
  return property ? request.user?.[property] : request.user;
});
```

Lets a controller write `@CurrentUser() user: AuthenticatedUser` (the full `{ userId, email, role }`) or `@CurrentUser('userId') userId: string` (just one field), instead of manually reaching into `@Req() request.user` and casting it. `request.user` is populated by `JwtStrategy.validate()` — see [jwt-token-flow.md](./jwt-token-flow.md).

## Order guards run in

For a request to `GET /users`: `ThrottlerGuard` → `JwtAuthGuard` (global) → `RolesGuard` (this controller only). `RolesGuard` depends on `request.user` already being set by `JwtAuthGuard`/`JwtStrategy` — it would have nothing to check if it ran first, which is why guard registration order matters (see [request-lifecycle.md](./request-lifecycle.md)).

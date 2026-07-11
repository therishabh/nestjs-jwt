# JWT Token Flow

## What is a JWT?

A JSON Web Token (JWT) is a compact, signed string that encodes a set of claims (a JSON payload) plus a cryptographic signature. It has three dot-separated parts: `header.payload.signature`. Anyone can _read_ the payload (it's only base64-encoded, not encrypted) — but nobody can _modify_ it without knowing the secret used to sign it, because the server verifies the signature on every request. That's what makes it trustworthy: the server doesn't need to look anything up to know the payload hasn't been tampered with, only to check the signature.

## Why this application uses JWTs

Because JWTs are self-contained and stateless, the server doesn't need a session store to know who's making a request — it just verifies the signature and expiry. This project issues **two** tokens per login: a short-lived **access token** for authenticating API calls, and a longer-lived **refresh token** used only to obtain a new access token (see [refresh-token-flow.md](./refresh-token-flow.md) for why they're split).

## This project's JWT payload

Defined in `src/common/interfaces/jwt-payload.interface.ts`:

```ts
interface JwtPayload {
  sub: string; // the user's MongoDB _id
  email: string;
  role: Role; // 'USER' | 'ADMIN'
}
```

This is deliberately minimal. It carries just enough for `JwtStrategy` and `RolesGuard` to work without a database round-trip on _every_ request — but nothing sensitive (no password hash, no phone number). `sub` ("subject") is the standard JWT claim name for "who this token is about."

Both the access token and the refresh token use this same payload shape — they're signed with different secrets and different expiries (see below), not different content.

## Signing

Done in `AuthService.issueTokenPair()` (private method, called from `register`... actually from `login` and `refreshTokens` — see `src/auth/auth.service.ts`):

```ts
const [accessToken, refreshToken] = await Promise.all([
  this.jwtService.signAsync(payload, {
    secret: this.jwt.accessSecret,
    expiresIn: this.jwt.accessExpiration, // e.g. '15m'
  }),
  this.jwtService.signAsync(payload, {
    secret: this.jwt.refreshSecret,
    expiresIn: this.jwt.refreshExpiration, // e.g. '7d'
  }),
]);
```

`this.jwtService` is Nest's `JwtService` (from `@nestjs/jwt`), configured in `AuthModule` (`JwtModule.registerAsync(...)`) with the access-token secret/expiry as the default. The refresh token is signed with an _explicit different secret_ passed per-call — using two separate secrets means a leaked access-token secret alone can't be used to forge a refresh token, and vice versa.

Both secrets come from environment variables (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`), validated to be at least 32 characters long by `src/config/env.validation.ts` — the app refuses to start otherwise.

`expiresIn` in the `TokenPair` returned to the client (`{ accessToken, refreshToken, expiresIn, tokenType }`) is _not_ re-parsed from the `JWT_ACCESS_EXPIRATION` string — it's derived by decoding the just-signed access token's own `iat`/`exp` claims, so it can never drift from what was actually signed:

```ts
const decoded = this.jwtService.decode<{ iat: number; exp: number }>(
  accessToken,
);
const expiresIn = decoded.exp - decoded.iat;
```

## Verification (on every protected request)

The client sends the access token in the `Authorization` header: `Authorization: Bearer <accessToken>`. This is the standard **Bearer token** scheme — "bearer" meaning whoever holds (bears) the token is treated as authenticated, no additional proof required.

`JwtStrategy` (`src/auth/strategies/jwt.strategy.ts`) is a Passport strategy configured to:

```ts
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: accessSecret,
});
```

Passport (via `passport-jwt`) extracts the token from the header, verifies its signature against `accessSecret`, and checks it hasn't expired — all _before_ any of this project's code runs. Only if that succeeds does Passport call `JwtStrategy.validate(payload)`:

```ts
async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
  const user = await this.usersService.findActiveById(payload.sub);
  if (!user || !user.isActive) {
    throw new UnauthorizedException('User no longer exists or is inactive');
  }
  return { userId: payload.sub, email: payload.email, role: payload.role };
}
```

This extra database check matters: a JWT is valid until it _expires_, regardless of what happens to the account in the meantime. Without re-checking `isActive` here, a token issued just before an account was deactivated would keep working for its full remaining lifetime (up to 15 minutes by default). This check makes deactivation effectively immediate.

The object `validate()` returns becomes `request.user` — that's what `@CurrentUser()` (`src/common/decorators/current-user.decorator.ts`) reads, and what `RolesGuard` checks `.role` on.

## Where the Guard fits in

`JwtAuthGuard` (`src/common/guards/jwt-auth.guard.ts`) is what actually triggers all of the above — it extends Passport's `AuthGuard('jwt')`, which runs the strategy described above. It's registered globally (`APP_GUARD` in `app.module.ts`), so every route requires a valid access token **unless** decorated with `@Public()`. See [authorization-and-roles.md](./authorization-and-roles.md) for the full guard/decorator picture.

## Token expiry summary

| Token         | Default lifetime | Env var                  | Signed with          |
| ------------- | ---------------- | ------------------------ | -------------------- |
| Access token  | 15 minutes       | `JWT_ACCESS_EXPIRATION`  | `JWT_ACCESS_SECRET`  |
| Refresh token | 7 days           | `JWT_REFRESH_EXPIRATION` | `JWT_REFRESH_SECRET` |

Short access-token life limits how long a stolen access token is useful. The refresh token exists precisely so the user doesn't have to log in again every 15 minutes — see [refresh-token-flow.md](./refresh-token-flow.md) for the mechanics and security model of that token.

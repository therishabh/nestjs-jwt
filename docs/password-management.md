# Password Management

Three separate flows, all in `src/auth/auth.service.ts` and routed through `src/auth/auth.controller.ts`.

## Change password — `POST /auth/change-password` (requires a valid access token)

```
Client (authenticated)
  ↓
POST /auth/change-password  { oldPassword, newPassword }
  ↓
AuthController.changePassword()  — userId comes from @CurrentUser(), not the body
  ↓
ChangePasswordDto validation (newPassword must satisfy STRONG_PASSWORD_REGEX)
  ↓
AuthService.changePassword()
  ↓
UsersService.findByIdWithSecrets()      — fetch WITH password hash
  ↓
compareValue(oldPassword, user.password) → IncorrectPasswordException if it doesn't match
  ↓
hashValue(newPassword, bcryptSaltRounds)
  ↓
UsersService.updatePassword()           — sets new hash AND unsets refreshTokenHash
  ↓
Response: { message: "Password changed successfully" }
```

**Why it also revokes the refresh token:** `UsersService.updatePassword()` clears `refreshTokenHash` in the same update as the new password:

```ts
async updatePassword(id: string, hashedPassword: string): Promise<void> {
  await this.userModel.updateOne(
    { _id: id },
    { $set: { password: hashedPassword }, $unset: { refreshTokenHash: '' } },
  ).exec();
}
```

Changing a password is a standard signal that every _other_ active session should be forced to re-authenticate — not just the device that made this request.

## Forgot password — `POST /auth/forgot-password` (public)

```
Client
  ↓
POST /auth/forgot-password  { email }
  ↓
AuthService.forgotPassword()
  ↓
UsersService.findByEmail()
  ↓
   found?                          not found?
     ↓                                  ↓
generateSecureToken() + hashToken()   (do nothing)
     ↓                                  ↓
setPasswordResetToken(hash, expiry)     |
     ↓                                  |
sendPasswordResetEmail(rawToken)        |
     ↓                                  ↓
Response (always identical): { message: "If that email exists, a password reset link has been sent" }
```

**Why the response never varies:** `AuthService.forgotPassword()` returns the same success message whether or not the email exists. An endpoint that responds differently for "known email" vs. "unknown email" is a classic account-enumeration bug — it would let an attacker check which addresses have accounts on this system just by calling this endpoint repeatedly.

**Token security:** identical pattern to refresh tokens (see [refresh-token-flow.md](./refresh-token-flow.md)) — a random token is generated (`generateSecureToken`, `src/common/utils/crypto.util.ts`), only its SHA-256 hash is persisted (`passwordResetTokenHash`), and it carries an expiry (`passwordResetExpires`, `RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES`, default 15 minutes).

## Reset password — `POST /auth/reset-password` (public)

```
Client
  ↓
POST /auth/reset-password  { token, newPassword }
  ↓
AuthService.resetPassword()
  ↓
UsersService.findByPasswordResetTokenHash(hashToken(token))
  — query itself requires passwordResetExpires > now, so
    an expired token behaves identically to an unknown one
  ↓ (found)
hashValue(newPassword) → UsersService.updatePassword()
  ↓
UsersService.clearPasswordResetToken()  — burn the token so it can't be reused
  ↓
Response: { message: "Password reset successful" }
```

`InvalidResetTokenException` (401) covers both "token doesn't exist" and "token expired" — the query in `findByPasswordResetTokenHash` folds the expiry check directly into the MongoDB filter (`passwordResetExpires: { $gt: new Date() }`), so there's no separate code path to keep in sync.

## Files involved

| Concern                  | File                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes                   | `src/auth/auth.controller.ts` (`changePassword`, `forgotPassword`, `resetPassword`)                                                                        |
| DTOs                     | `src/auth/dto/change-password.dto.ts`, `forgot-password.dto.ts`, `reset-password.dto.ts`                                                                   |
| Business logic           | `src/auth/auth.service.ts`                                                                                                                                 |
| Password hashing         | `src/common/utils/password.util.ts`                                                                                                                        |
| Token generation/hashing | `src/common/utils/crypto.util.ts`                                                                                                                          |
| Data access              | `src/users/users.service.ts` (`findByIdWithSecrets`, `updatePassword`, `setPasswordResetToken`, `findByPasswordResetTokenHash`, `clearPasswordResetToken`) |
| Custom exceptions        | `src/common/exceptions/app.exceptions.ts` (`IncorrectPasswordException`, `InvalidResetTokenException`)                                                     |
| Email (stub)             | `src/mail/mail.service.ts` (`sendPasswordResetEmail`)                                                                                                      |

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService, ConfigType } from '@nestjs/config';
import jwtConfig from '../config/jwt.config';
import securityConfig from '../config/security.config';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AppLogger } from '../logger/app-logger.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { hashValue, compareValue } from '../common/utils/password.util';
import { generateSecureToken, hashToken } from '../common/utils/crypto.util';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { UserDocument } from '../users/schemas/user.schema';
import {
  AccountInactiveException,
  AccountLockedException,
  EmailAlreadyExistsException,
  IncorrectPasswordException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
  InvalidResetTokenException,
  InvalidVerificationTokenException,
} from '../common/exceptions/app.exceptions';

/** Shape returned by every token-issuing endpoint (login, refresh) — matches the spec's `{ accessToken, refreshToken, expiresIn, tokenType }` contract. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, derived from the signed token's `exp - iat`. */
  expiresIn: number;
  tokenType: 'Bearer';
}

/** Request context captured at login time and appended to the user's `loginHistory`. */
export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Owns every authentication flow: registration, login, token issuance and
 * rotation, logout, and all password/email-verification flows.
 *
 * Kept separate from {@link UsersService} on purpose: UsersService is a
 * plain data-access layer for the User collection, while AuthService is
 * business logic (hashing, tokens, lockout policy, orchestrating the mail
 * service). Mixing the two would make UsersService — which other modules
 * may reasonably depend on for simple lookups — implicitly carry
 * authentication concerns.
 *
 * Security considerations:
 * - Passwords are hashed with bcrypt before storage (see `password.util.ts`).
 * - Refresh/reset/verification tokens are never persisted raw — only their
 *   SHA-256 hash (see `crypto.util.ts`) — so a database leak alone cannot
 *   produce a usable token.
 * - Refresh tokens rotate on every use, and reuse of an already-rotated
 *   token revokes the entire session (see {@link refreshTokens}).
 */
@Injectable()
export class AuthService {
  private readonly jwt: ConfigType<typeof jwtConfig>;
  private readonly security: ConfigType<typeof securityConfig>;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(AuthService.name);
    this.jwt = this.configService.get<ConfigType<typeof jwtConfig>>('jwt')!;
    this.security =
      this.configService.get<ConfigType<typeof securityConfig>>('security')!;
  }

  /**
   * Creates a new user account and kicks off the email-verification flow.
   *
   * The account is created with `isEmailVerified: false` — registration
   * does not require a verified email up front (that would block anyone
   * without instant email access), but downstream features can check
   * `isEmailVerified` if they need to gate on it.
   *
   * @param dto - Validated registration payload (see `RegisterDto`).
   * @returns The created user document (password/token hashes are stripped
   *   by the schema's `toJSON` transform before this ever reaches a response).
   * @throws EmailAlreadyExistsException When the (normalized) email is already registered.
   */
  async register(dto: RegisterDto): Promise<UserDocument> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new EmailAlreadyExistsException();

    const hashedPassword = await hashValue(
      dto.password,
      this.security.bcryptSaltRounds,
    );

    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      hashedPassword,
    });

    await this.issueEmailVerificationToken(user);
    this.logger.auth('User registered', { userId: user.id, email: user.email });
    return user;
  }

  /**
   * Authenticates a user by email/password and issues a fresh access +
   * refresh token pair on success.
   *
   * Order of checks matters here: lock status and active status are
   * checked *before* the password comparison so that a locked or
   * deactivated account never reaches bcrypt (cheaper failure path), and
   * so the error message can be specific (locked vs. inactive vs. wrong
   * credentials) without leaking whether the email itself exists — the
   * "invalid email or password" wording is deliberately identical whether
   * the email is unknown or the password is wrong.
   *
   * A wrong password increments `failedLoginAttempts` and, once it
   * reaches `ACCOUNT_LOCK_MAX_ATTEMPTS`, locks the account for
   * `ACCOUNT_LOCK_DURATION_MINUTES` (see `UsersService.registerFailedLoginAttempt`).
   *
   * @param dto - Validated `{ email, password }` payload.
   * @param meta - Request metadata (IP/user-agent) recorded in login history on success.
   * @returns A new access/refresh token pair.
   * @throws InvalidCredentialsException When the email doesn't exist or the password is wrong.
   * @throws AccountLockedException When the account is currently locked out.
   * @throws AccountInactiveException When the account has been deactivated.
   */
  async login(dto: LoginDto, meta: RequestMetadata): Promise<TokenPair> {
    const user = await this.usersService.findByEmailWithSecrets(dto.email);
    if (!user) throw new InvalidCredentialsException();

    if (user.lockUntil && user.lockUntil > new Date()) {
      throw new AccountLockedException(user.lockUntil);
    }

    if (!user.isActive) throw new AccountInactiveException();

    const passwordMatches = await compareValue(dto.password, user.password);
    if (!passwordMatches) {
      const { locked, lockUntil } =
        await this.usersService.registerFailedLoginAttempt(
          user.id,
          this.security.accountLockMaxAttempts,
          this.security.accountLockDurationMinutes,
        );
      this.logger.auth('Failed login attempt', {
        userId: user.id,
        email: user.email,
      });
      if (locked && lockUntil) throw new AccountLockedException(lockUntil);
      throw new InvalidCredentialsException();
    }

    const tokens = await this.issueTokenPair(user);
    await this.usersService.recordSuccessfulLogin(user.id, meta);
    this.logger.auth('User logged in', { userId: user.id, email: user.email });
    return tokens;
  }

  /**
   * Validates a refresh token and performs token rotation: the supplied
   * refresh token is single-use — a successful call immediately issues and
   * persists a *new* access/refresh pair, invalidating the one just used.
   *
   * Rotation is what makes refresh-token theft detectable: if a stolen
   * token is replayed after the legitimate client already rotated it, the
   * hash comparison below fails, and the whole session is revoked rather
   * than just rejecting that one request — treating a hash mismatch on an
   * otherwise-valid, unexpired JWT as a signal of possible token theft.
   *
   * @param refreshToken - The raw refresh token JWT presented by the client.
   * @returns A newly issued access/refresh token pair.
   * @throws InvalidRefreshTokenException When the token fails signature/expiry
   *   verification, the user no longer exists/is inactive, or the token's hash
   *   doesn't match the currently-stored one (reuse of a rotated-out token).
   */
  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.jwt.refreshSecret,
      });
    } catch {
      throw new InvalidRefreshTokenException();
    }

    const user = await this.usersService.findByIdWithSecrets(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new InvalidRefreshTokenException();
    }

    // Comparing the hash (not the raw token) means a leaked database alone
    // never yields a usable refresh token — this mirrors why passwords are
    // never stored in plaintext.
    if (hashToken(refreshToken) !== user.refreshTokenHash) {
      // A mismatch on an otherwise-valid, unexpired JWT most likely means
      // this token was already rotated out — treat it as possible token
      // theft and revoke the whole session rather than silently failing.
      await this.usersService.setRefreshTokenHash(user.id, null);
      throw new InvalidRefreshTokenException();
    }

    const tokens = await this.issueTokenPair(user);
    this.logger.auth('Refresh token rotated', { userId: user.id });
    return tokens;
  }

  /**
   * Ends the current session by clearing the stored refresh-token hash.
   *
   * There is nothing to "invalidate" on the access token itself — JWTs are
   * stateless and remain technically valid until they expire (typically
   * ~15 minutes, `JWT_ACCESS_EXPIRATION`). Logout's real effect is
   * preventing that access token from being renewed: once
   * `refreshTokenHash` is cleared, {@link refreshTokens} has nothing to
   * match against and any future refresh attempt fails.
   *
   * @param userId - The authenticated user's id (`sub` claim from the access token).
   */
  async logout(userId: string): Promise<void> {
    await this.usersService.setRefreshTokenHash(userId, null);
    this.logger.auth('User logged out', { userId });
  }

  /**
   * Changes the current user's password after verifying the old one.
   *
   * Also revokes the refresh token (see `UsersService.updatePassword`),
   * which forces every other active session to re-authenticate — the
   * standard expectation after a password change is that old sessions
   * stop working, not just the device that changed it.
   *
   * @param userId - The authenticated user's id.
   * @param dto - `{ oldPassword, newPassword }`.
   * @throws IncorrectPasswordException When `oldPassword` doesn't match the stored hash.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.usersService.findByIdWithSecrets(userId);
    if (!user) throw new InvalidCredentialsException();

    const oldPasswordMatches = await compareValue(
      dto.oldPassword,
      user.password,
    );
    if (!oldPasswordMatches) throw new IncorrectPasswordException();

    const hashedPassword = await hashValue(
      dto.newPassword,
      this.security.bcryptSaltRounds,
    );
    // Also clears refreshTokenHash: changing your password should log out
    // every existing session, not just the one making this request.
    await this.usersService.updatePassword(userId, hashedPassword);
    this.logger.auth('Password changed', { userId });
  }

  /**
   * Starts the password-reset flow by emailing a one-time reset link.
   *
   * Deliberately returns the same result (silently, no error) whether or
   * not the email belongs to an account — an endpoint that responds
   * differently for "email exists" vs. "email doesn't exist" is a classic
   * account-enumeration vulnerability. The reset token is stored only as a
   * hash (`hashToken`), the same pattern used for refresh tokens.
   *
   * @param email - The email address to send a reset link to, if it exists.
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    // Always behave the same whether or not the email exists, so this
    // endpoint can't be used to enumerate which addresses have accounts.
    if (!user) return;

    const rawToken = generateSecureToken();
    const expiresAt = new Date(
      Date.now() + this.security.resetPasswordTokenExpirationMinutes * 60_000,
    );
    await this.usersService.setPasswordResetToken(
      user.id,
      hashToken(rawToken),
      expiresAt,
    );
    await this.mailService.sendPasswordResetEmail(user.email, rawToken);
    this.logger.auth('Password reset requested', { userId: user.id });
  }

  /**
   * Completes the password-reset flow: verifies the raw token against its
   * stored hash (and expiry, enforced by the query in
   * `UsersService.findByPasswordResetTokenHash`), then sets the new
   * password and burns the token so it cannot be reused.
   *
   * @param token - The raw reset token from the emailed link.
   * @param newPassword - The new password (already validated by `ResetPasswordDto`).
   * @throws InvalidResetTokenException When the token is unknown, already used, or expired.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const user = await this.usersService.findByPasswordResetTokenHash(
      hashToken(token),
    );
    if (!user) throw new InvalidResetTokenException();

    const hashedPassword = await hashValue(
      newPassword,
      this.security.bcryptSaltRounds,
    );
    await this.usersService.updatePassword(user.id, hashedPassword);
    await this.usersService.clearPasswordResetToken(user.id);
    this.logger.auth('Password reset completed', { userId: user.id });
  }

  /**
   * Marks the current user's email as verified using the token sent by
   * {@link issueEmailVerificationToken} (called from `register` and
   * `resendVerificationEmail`). Follows the same hash-and-expire pattern as
   * password reset tokens.
   *
   * @param token - The raw verification token from the emailed link.
   * @throws InvalidVerificationTokenException When the token is unknown, already used, or expired.
   */
  async verifyEmail(token: string): Promise<void> {
    const user = await this.usersService.findByEmailVerificationTokenHash(
      hashToken(token),
    );
    if (!user) throw new InvalidVerificationTokenException();

    await this.usersService.markEmailVerified(user.id);
    this.logger.auth('Email verified', { userId: user.id });
  }

  /**
   * Re-sends the verification email for a still-unverified account. A
   * no-op for accounts that are already verified, so calling it
   * repeatedly is always safe.
   *
   * @param userId - The authenticated user's id.
   */
  async resendVerificationEmail(userId: string): Promise<void> {
    const user = await this.usersService.findActiveByIdOrThrow(userId);
    if (user.isEmailVerified) return;
    await this.issueEmailVerificationToken(user);
  }

  /** Generates, hashes, and persists a fresh email-verification token, then emails the raw one. */
  private async issueEmailVerificationToken(user: UserDocument): Promise<void> {
    const rawToken = generateSecureToken();
    const expiresAt = new Date(
      Date.now() +
        this.security.emailVerificationTokenExpirationHours * 3_600_000,
    );
    await this.usersService.setEmailVerificationToken(
      user.id,
      hashToken(rawToken),
      expiresAt,
    );
    await this.mailService.sendEmailVerificationEmail(user.email, rawToken);
  }

  /**
   * Signs a fresh access/refresh JWT pair for a user and persists the new
   * refresh token's hash (overwriting/rotating out any previous one).
   *
   * The JWT payload (`JwtPayload`) intentionally carries only `sub`
   * (user id), `email`, and `role` — enough for {@link JwtStrategy} and
   * `RolesGuard` to work without a database round-trip on every request,
   * but nothing sensitive. `expiresIn` in the returned pair is derived by
   * decoding the just-signed access token's `iat`/`exp` claims rather than
   * re-parsing the `JWT_ACCESS_EXPIRATION` string, so it can never drift
   * from what was actually signed.
   */
  private async issueTokenPair(user: UserDocument): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwt.accessSecret,
        expiresIn: this.jwt.accessExpiration,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.jwt.refreshSecret,
        expiresIn: this.jwt.refreshExpiration,
      }),
    ]);

    await this.usersService.setRefreshTokenHash(
      user.id,
      hashToken(refreshToken),
    );

    const decoded = this.jwtService.decode<{ iat: number; exp: number }>(
      accessToken,
    );
    const expiresIn = decoded.exp - decoded.iat;

    return { accessToken, refreshToken, expiresIn, tokenType: 'Bearer' };
  }
}

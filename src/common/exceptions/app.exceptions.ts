import { ConflictException, UnauthorizedException } from '@nestjs/common';

/**
 * Domain-specific exceptions. Extending Nest's built-in HttpException
 * subclasses keeps the correct HTTP status codes for free while giving each
 * failure a distinct, greppable class name instead of a generic
 * `throw new UnauthorizedException('...')` scattered with slightly
 * different strings across the codebase.
 */
export class EmailAlreadyExistsException extends ConflictException {
  constructor() {
    super('An account with this email already exists');
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid email or password');
  }
}

export class AccountLockedException extends UnauthorizedException {
  constructor(unlockAt: Date) {
    super(
      `Account locked due to too many failed login attempts. Try again after ${unlockAt.toISOString()}`,
    );
  }
}

export class AccountInactiveException extends UnauthorizedException {
  constructor() {
    super('This account has been deactivated');
  }
}

export class InvalidRefreshTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired refresh token');
  }
}

export class InvalidResetTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired password reset token');
  }
}

export class InvalidVerificationTokenException extends UnauthorizedException {
  constructor() {
    super('Invalid or expired email verification token');
  }
}

export class IncorrectPasswordException extends UnauthorizedException {
  constructor() {
    super('Current password is incorrect');
  }
}

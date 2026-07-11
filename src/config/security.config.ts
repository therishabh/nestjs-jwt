import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
  throttleTtl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
  throttleLimit: parseInt(process.env.THROTTLE_LIMIT ?? '20', 10),
  resetPasswordTokenExpirationMinutes: parseInt(
    process.env.RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES ?? '15',
    10,
  ),
  emailVerificationTokenExpirationHours: parseInt(
    process.env.EMAIL_VERIFICATION_TOKEN_EXPIRATION_HOURS ?? '24',
    10,
  ),
  accountLockMaxAttempts: parseInt(
    process.env.ACCOUNT_LOCK_MAX_ATTEMPTS ?? '5',
    10,
  ),
  accountLockDurationMinutes: parseInt(
    process.env.ACCOUNT_LOCK_DURATION_MINUTES ?? '15',
    10,
  ),
}));

import { randomBytes, createHash } from 'crypto';

/**
 * Used for refresh tokens, password-reset tokens, and email-verification
 * tokens: generate a random value, hand the raw value to the user (email
 * link / response body), but only ever persist its SHA-256 hash. If the
 * database ever leaks, the stored hashes are useless to an attacker without
 * also reversing SHA-256 — the same principle as bcrypt for passwords, just
 * with a cheaper hash since these tokens are already high-entropy random
 * data (unlike passwords, which need bcrypt's deliberate slowness).
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

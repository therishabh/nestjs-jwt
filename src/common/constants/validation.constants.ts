/**
 * At least one lowercase letter, one uppercase letter, one digit, and one
 * special character, 8+ characters total. Centralized so registration and
 * password-reset can't drift into accepting different strength rules.
 */
export const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const STRONG_PASSWORD_MESSAGE =
  'Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a number, and a special character';

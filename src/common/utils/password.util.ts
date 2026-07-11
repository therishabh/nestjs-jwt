import * as bcrypt from 'bcrypt';

/**
 * Thin wrapper around bcrypt so every call site configures salt rounds the
 * same way (from config, not a magic number) and so swapping the hashing
 * algorithm later means changing one file instead of every place that calls
 * `bcrypt.hash` directly.
 */
export async function hashValue(
  value: string,
  saltRounds: number,
): Promise<string> {
  return bcrypt.hash(value, saltRounds);
}

export async function compareValue(
  value: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(value, hash);
}

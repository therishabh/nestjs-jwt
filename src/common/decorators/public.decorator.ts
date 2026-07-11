import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';

/**
 * Marks a route as not requiring authentication. Since the global
 * JwtAuthGuard (Step 6) protects every route by default — the safer
 * default for an app whose whole purpose is auth — this decorator is the
 * explicit opt-out for endpoints like /auth/login or /health that must
 * stay reachable without a token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

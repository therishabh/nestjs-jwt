import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../constants/auth.constants';

/**
 * Registered as the global guard (see AppModule) so every route requires a
 * valid access token by default — "secure by default" instead of relying on
 * developers to remember to protect each new route. `@Public()` is the
 * explicit, greppable exception for the handful of routes that must stay
 * open (login, register, health check).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * A Nest Guard's `canActivate` decides, before the route handler runs,
   * whether the request is allowed through — returning `false` (or
   * throwing) short-circuits the request with a 401/403 and the
   * controller method never executes. `AuthGuard('jwt')` (from
   * `@nestjs/passport`) already implements this by running
   * {@link JwtStrategy} under the hood; this override just adds the
   * `@Public()` bypass in front of that default behavior.
   */
  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

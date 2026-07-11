import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/auth.constants';
import { Role } from '../enums/role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Runs after JwtAuthGuard (so `request.user` is already populated) and
 * checks the roles attached by @Roles(...). Routes with no @Roles()
 * metadata are allowed through — role restriction is opt-in per route,
 * separate from the opt-out @Public() authentication check.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();

    return !!user && requiredRoles.includes(user.role);
  }
}

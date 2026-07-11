import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService, ConfigType } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import jwtConfig from '../../config/jwt.config';
import { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UsersService } from '../../users/users.service';

/**
 * Passport strategies are how Nest plugs into the wider Passport.js
 * ecosystem: this class tells Passport how to pull a JWT out of a request
 * (the Authorization header) and how to verify it (the access-token
 * secret). `validate()` runs only after the signature/expiry check already
 * passed; its return value becomes `request.user`, which is what
 * @CurrentUser() and RolesGuard read later.
 *
 * We re-check `isActive`/`isDeleted` here (not just at login) so a token
 * issued before an account was deactivated stops working immediately,
 * rather than remaining valid until it naturally expires.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const { accessSecret } =
      configService.get<ConfigType<typeof jwtConfig>>('jwt')!;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User no longer exists or is inactive');
    }
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}

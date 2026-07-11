import { Role } from '../enums/role.enum';

/** Shape encoded inside both access and refresh JWTs. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

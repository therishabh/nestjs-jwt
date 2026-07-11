import { Role } from '../enums/role.enum';

/** What JwtStrategy.validate() returns; Passport attaches this as `request.user`. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: Role;
}

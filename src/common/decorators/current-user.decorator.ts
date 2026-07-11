import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Lets a controller write `@CurrentUser() user: AuthenticatedUser` instead
 * of reaching into `@Req() request.user` and casting it by hand everywhere.
 * A `property` argument (e.g. `@CurrentUser('userId')`) returns just that
 * field when a handler only needs the id, not the whole payload.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: AuthenticatedUser }>();
    return property ? request.user?.[property] : request.user;
  },
);

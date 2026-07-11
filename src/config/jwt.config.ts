import { registerAs } from '@nestjs/config';
import type { StringValue } from 'ms';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  accessExpiration: (process.env.JWT_ACCESS_EXPIRATION ?? '15m') as StringValue,
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,
  refreshExpiration: (process.env.JWT_REFRESH_EXPIRATION ??
    '7d') as StringValue,
}));

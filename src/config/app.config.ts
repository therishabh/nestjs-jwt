import { registerAs } from '@nestjs/config';

/**
 * `registerAs` creates a "namespaced" config factory. Instead of one giant
 * object, each feature area (app, database, jwt, security, mail) owns its own
 * slice. Modules that only care about JWT settings inject just that slice
 * (via jwtConfig.KEY) instead of the entire configuration — this keeps
 * modules decoupled from unrelated settings and makes each config file
 * independently testable.
 */
export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV,
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  frontendUrl: process.env.FRONTEND_URL,
}));

import appConfig from './app.config';
import databaseConfig from './database.config';
import jwtConfig from './jwt.config';
import securityConfig from './security.config';
import mailConfig from './mail.config';

export { appConfig, databaseConfig, jwtConfig, securityConfig, mailConfig };

/** Passed as ConfigModule's `load` array — one factory per namespace. */
export const configurations = [
  appConfig,
  databaseConfig,
  jwtConfig,
  securityConfig,
  mailConfig,
];

export * from './env.validation';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AppModule } from '../../src/app.module';

/**
 * Boots the real AppModule (not a trimmed-down test module) against an
 * ephemeral in-memory MongoDB instance, and applies the same global
 * pipes/prefix main.ts applies — so e2e tests exercise the actual request
 * pipeline (validation, guards, filters, interceptors), not a stand-in.
 */
export async function createTestApp(): Promise<{
  app: INestApplication;
  mongod: MongoMemoryServer;
}> {
  const mongod = await MongoMemoryServer.create();

  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongod.getUri('nest-jwt-e2e');
  process.env.PORT = '0';
  process.env.API_PREFIX = 'api/v1';
  process.env.CORS_ORIGIN = '*';
  process.env.JWT_ACCESS_SECRET =
    'e2e-test-access-secret-at-least-32-chars-long';
  process.env.JWT_ACCESS_EXPIRATION = '15m';
  process.env.JWT_REFRESH_SECRET =
    'e2e-test-refresh-secret-at-least-32-chars-long';
  process.env.JWT_REFRESH_EXPIRATION = '7d';
  process.env.BCRYPT_SALT_ROUNDS = '4'; // low cost factor keeps tests fast
  process.env.THROTTLE_TTL = '60';
  process.env.THROTTLE_LIMIT = '1000'; // rate limiting is tested separately
  process.env.RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES = '15';
  process.env.EMAIL_VERIFICATION_TOKEN_EXPIRATION_HOURS = '24';
  process.env.ACCOUNT_LOCK_MAX_ATTEMPTS = '5';
  process.env.ACCOUNT_LOCK_DURATION_MINUTES = '15';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  return { app, mongod };
}

export async function closeTestApp(
  app: INestApplication,
  mongod: MongoMemoryServer,
) {
  await app.close();
  await mongod.stop();
}

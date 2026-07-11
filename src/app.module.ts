import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { configurations, validate } from './config';
import securityConfig from './config/security.config';
import { LoggerModule } from './logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { MongoSanitizeMiddleware } from './common/middlewares/mongo-sanitize.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Available in every module without re-importing ConfigModule everywhere.
      isGlobal: true,
      // .env.development / .env.production is loaded based on NODE_ENV; .env
      // is the fallback for local development. Later paths do NOT override
      // variables already set by earlier paths or by the real process env,
      // so real environment variables (e.g. injected by a hosting platform)
      // always win over anything in these files.
      envFilePath: [`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'],
      load: configurations,
      validate,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { throttleTtl, throttleLimit } =
          configService.get<ConfigType<typeof securityConfig>>('security')!;
        return [{ ttl: throttleTtl * 1000, limit: throttleLimit }];
      },
    }),
    LoggerModule,
    DatabaseModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    // Order matters: rate-limiting runs before authentication so a flood of
    // requests is rejected cheaply, before any DB lookup for the user.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Protects every route by default; individual routes opt out with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Runs for every request/response — one place to enforce the API's
    // response envelope and structured logging instead of per-controller.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // Catches everything the rest of the pipeline doesn't handle.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, MongoSanitizeMiddleware).forRoutes('*');
  }
}

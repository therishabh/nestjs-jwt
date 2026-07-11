import { NestFactory } from '@nestjs/core';
import { ConfigService, ConfigType } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import appConfig from './config/app.config';
import { AppLogger } from './logger/app-logger.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Route all of Nest's internal logging (and anything using the injected
  // Logger) through our structured AppLogger instead of the default
  // console logger. AppLogger is transient-scoped (each injecting class
  // gets its own instance/context), so it must be fetched with `resolve()`
  // rather than `get()`, which only works for singleton providers.
  app.useLogger(await app.resolve(AppLogger));

  const configService = app.get(ConfigService);
  const { port, apiPrefix, corsOrigin, nodeEnv } =
    configService.get<ConfigType<typeof appConfig>>('app')!;

  app.setGlobalPrefix(apiPrefix);

  // Sets a battery of security-related HTTP headers (CSP, X-Frame-Options,
  // HSTS, etc.) that are easy to get wrong by hand and easy to forget.
  app.use(helmet());
  // Compresses response bodies — meaningful bandwidth/latency savings for
  // JSON APIs at near-zero cost.
  app.use(compression());

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    credentials: true,
  });

  // Global ValidationPipe enforces every DTO's class-validator decorators
  // on every route automatically — no controller needs to call `validate()`
  // itself. `whitelist` strips properties with no decorator, `forbidNonWhitelisted`
  // rejects the request outright if it sent one, and `transform` turns the
  // plain JSON body into an actual instance of the DTO class (so
  // `@Type(() => Number)`-style coercions run).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Nest JWT Auth API')
      .setDescription('Production-style authentication API built with NestJS')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // Lets Nest call onModuleDestroy/beforeApplicationShutdown hooks (e.g.
  // Mongoose closing its connection pool) when the process receives
  // SIGTERM/SIGINT, instead of the connection being dropped mid-write.
  app.enableShutdownHooks();

  await app.listen(port);
}
void bootstrap();

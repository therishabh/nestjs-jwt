import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import databaseConfig from '../config/database.config';
import { AppLogger } from '../logger/app-logger.service';

/**
 * Wraps MongooseModule.forRootAsync so the connection string comes from
 * ConfigService (never hard-coded) and so connection lifecycle events are
 * logged. `forRootAsync` (vs `forRoot`) is required here because the URI
 * isn't known until ConfigModule has parsed the environment — the factory
 * function receives dependencies through Nest's DI just like a provider.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, AppLogger],
      useFactory: (configService: ConfigService, logger: AppLogger) => {
        logger.setContext('DatabaseModule');
        const { uri } =
          configService.get<ConfigType<typeof databaseConfig>>('database')!;

        return {
          uri,
          // Mongoose's own driver retries the initial connection with
          // exponential backoff instead of crashing the process the moment
          // Atlas is briefly unreachable (e.g. during a rolling upgrade).
          serverSelectionTimeoutMS: 10000,
          connectionFactory: (connection: Connection) => {
            connection.on('connected', () =>
              logger.log('MongoDB connection established'),
            );
            connection.on('disconnected', () =>
              logger.warn('MongoDB connection lost'),
            );
            connection.on('reconnected', () =>
              logger.log('MongoDB reconnected'),
            );
            connection.on('error', (error: Error) =>
              logger.error('MongoDB connection error', error.stack),
            );
            return connection;
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}

import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  MinLength,
  IsOptional,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Declares every environment variable the application needs, along with the
 * validation rules for each one. class-validator decorators do the checking;
 * class-transformer turns the raw `process.env` object (all strings) into an
 * instance of this class so numeric/enum fields are actually typed.
 */
class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  API_PREFIX: string;

  @IsString()
  CORS_ORIGIN: string;

  @IsString()
  MONGODB_URI: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET must be at least 32 characters long',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_ACCESS_EXPIRATION: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be at least 32 characters long',
  })
  JWT_REFRESH_SECRET: string;

  @IsString()
  JWT_REFRESH_EXPIRATION: string;

  @IsNumber()
  BCRYPT_SALT_ROUNDS: number;

  @IsNumber()
  THROTTLE_TTL: number;

  @IsNumber()
  THROTTLE_LIMIT: number;

  @IsNumber()
  RESET_PASSWORD_TOKEN_EXPIRATION_MINUTES: number;

  @IsNumber()
  EMAIL_VERIFICATION_TOKEN_EXPIRATION_HOURS: number;

  @IsNumber()
  ACCOUNT_LOCK_MAX_ATTEMPTS: number;

  @IsNumber()
  ACCOUNT_LOCK_DURATION_MINUTES: number;

  @IsString()
  FRONTEND_URL: string;

  @IsOptional()
  @IsString()
  MAIL_HOST?: string;

  @IsOptional()
  @IsNumber()
  MAIL_PORT?: number;

  @IsOptional()
  @IsString()
  MAIL_USER?: string;

  @IsOptional()
  @IsString()
  MAIL_PASSWORD?: string;

  @IsOptional()
  @IsString()
  MAIL_FROM?: string;
}

/**
 * Passed to ConfigModule.forRoot({ validate }). NestJS calls this once, at
 * bootstrap, with the raw env object. Throwing here means a misconfigured
 * deployment fails immediately on startup instead of failing later, in
 * production, in the middle of handling a request.
 */
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment variable validation failed: ${messages}`);
  }

  return validatedConfig;
}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import jwtConfig from '../config/jwt.config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    // Registered async (rather than a static secret) because the signing
    // secret for access tokens comes from ConfigService, which itself only
    // becomes available once ConfigModule has resolved the environment.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { accessSecret, accessExpiration } =
          configService.get<ConfigType<typeof jwtConfig>>('jwt')!;
        return {
          secret: accessSecret,
          signOptions: { expiresIn: accessExpiration },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

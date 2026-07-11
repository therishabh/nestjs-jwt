import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Headers,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';

/**
 * HTTP surface for every authentication flow. Deliberately thin: each
 * handler validates input (via DTOs + the global ValidationPipe), delegates
 * to {@link AuthService} for all business logic, and shapes the result as
 * `{ message, data }` — the global `ResponseInterceptor` (see
 * `src/common/interceptors/response.interceptor.ts`) wraps that into the
 * project-wide `{ success, message, data }` envelope, so handlers never
 * build the envelope themselves.
 *
 * Routes are protected by the global `JwtAuthGuard` by default; `@Public()`
 * opts out for the handful of routes that must work without a token
 * (register, login, refresh, forgot/reset-password, verify-email).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return {
      message:
        'Registration successful. Please check your email to verify your account.',
      data: user,
    };
  }

  @Public()
  // Login is a prime brute-force target; it relies on the global,
  // env-configurable rate limit (AppModule) plus per-account lockout after
  // repeated failed attempts (AuthService) rather than a second,
  // hard-coded threshold that would fight with the configurable one.
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive access/refresh tokens' })
  async login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    const tokens = await this.authService.login(dto, {
      ipAddress: ip,
      userAgent,
    });
    return { message: 'Login successful', data: tokens };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate a refresh token for a new token pair' })
  async refresh(@Body() dto: RefreshTokenDto) {
    const tokens = await this.authService.refreshTokens(dto.refreshToken);
    return { message: 'Token refreshed', data: tokens };
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke the current refresh token' })
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId);
    return { message: 'Logout successful', data: null };
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the current password' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(user.userId, dto);
    return { message: 'Password changed successfully', data: null };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return {
      message: 'If that email exists, a password reset link has been sent',
      data: null,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset the password using a reset token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password reset successful', data: null };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify an email address using a verification token',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.token);
    return { message: 'Email verified successfully', data: null };
  }

  @ApiBearerAuth()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email verification link' })
  async resendVerification(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.resendVerificationEmail(user.userId);
    return { message: 'Verification email sent', data: null };
  }
}

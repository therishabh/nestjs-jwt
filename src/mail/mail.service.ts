import { Injectable } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import mailConfig from '../config/mail.config';
import { AppLogger } from '../logger/app-logger.service';

/**
 * No real email provider is configured yet — wiring up SMTP/SendGrid/SES is
 * an infrastructure decision for later, not a reason to block the rest of
 * the auth flow. Every place that needs to "send an email" (reset password,
 * verify email) already depends on this interface; swapping the stub below
 * for a real provider means changing only this file's method bodies.
 */
@Injectable()
export class MailService {
  private readonly mailConfig: ConfigType<typeof mailConfig>;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(MailService.name);
    this.mailConfig =
      this.configService.get<ConfigType<typeof mailConfig>>('mail')!;
  }

  // Not `async`/`await` on purpose: this stub has nothing to await. A real
  // provider integration (SMTP/SendGrid/SES) would `await` its API call
  // here; the `Promise<void>` return type is kept so callers don't need to
  // change when that swap happens.
  sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    const resetUrl = `${this.getFrontendUrl()}/reset-password?token=${resetToken}`;
    this.deliver(to, 'Reset your password', `Reset link: ${resetUrl}`);
    return Promise.resolve();
  }

  sendEmailVerificationEmail(
    to: string,
    verificationToken: string,
  ): Promise<void> {
    const verifyUrl = `${this.getFrontendUrl()}/verify-email?token=${verificationToken}`;
    this.deliver(
      to,
      'Verify your email address',
      `Verification link: ${verifyUrl}`,
    );
    return Promise.resolve();
  }

  private getFrontendUrl(): string {
    return this.configService.get<string>('app.frontendUrl') ?? '';
  }

  /** Stand-in "transport": logs the email instead of sending it. Replace with a real provider call. */
  private deliver(to: string, subject: string, body: string): void {
    this.logger.log(
      `[stub email] to=${to} subject="${subject}" from=${this.mailConfig.from} body="${body}"`,
    );
  }
}

import { registerAs } from '@nestjs/config';

/**
 * No email provider is wired up yet (see Step 10). This namespace exists now
 * so the rest of the app (and its tests) can depend on a stable shape —
 * MailService will read from here once a provider (SMTP/SendGrid/SES) is
 * chosen, without any other module needing to change.
 */
export default registerAs('mail', () => ({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT ? parseInt(process.env.MAIL_PORT, 10) : undefined,
  user: process.env.MAIL_USER,
  password: process.env.MAIL_PASSWORD,
  from: process.env.MAIL_FROM ?? 'no-reply@example.com',
}));

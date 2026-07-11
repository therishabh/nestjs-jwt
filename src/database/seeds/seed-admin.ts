import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../app.module';
import { UsersService } from '../../users/users.service';
import { Role } from '../../common/enums/role.enum';
import { hashValue } from '../../common/utils/password.util';

/**
 * Run once per environment to bootstrap the first ADMIN account — there is
 * no API endpoint that creates admins (by design: an unauthenticated
 * "create me an admin" endpoint would be a privilege-escalation hole), so
 * this script is the intended, deliberate way to create one.
 *
 * `NestFactory.createApplicationContext` boots the full DI graph (config,
 * database connection, services) without starting an HTTP server — the
 * right tool for one-off scripts that need the same services as the app.
 */
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const usersService = app.get(UsersService);
    const configService = app.get(ConfigService);

    const email =
      configService.get<string>('ADMIN_EMAIL') ?? 'admin@example.com';
    const password = configService.get<string>('ADMIN_PASSWORD');

    if (!password) {
      throw new Error(
        'Set ADMIN_PASSWORD (and optionally ADMIN_EMAIL) before running the seed script',
      );
    }

    const existing = await usersService.findByEmail(email);
    if (existing) {
      console.log(`Admin user already exists: ${email}`);
      return;
    }

    const hashedPassword = await hashValue(password, 12);
    await usersService.create({
      firstName: 'Admin',
      lastName: 'User',
      email,
      hashedPassword,
      role: Role.ADMIN,
    });

    console.log(`Admin user created: ${email}`);
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});

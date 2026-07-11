import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../../users/users.service';
import { Role } from '../../common/enums/role.enum';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn().mockReturnValue({ accessSecret: 'test-secret' }),
  } as unknown as ConfigService;

  it('returns the authenticated user when the user is active', async () => {
    const usersService = {
      findActiveById: jest.fn().mockResolvedValue({
        id: 'user-1',
        isActive: true,
      }),
    } as unknown as UsersService;

    const strategy = new JwtStrategy(configService, usersService);
    const result = await strategy.validate({
      sub: 'user-1',
      email: 'jane@example.com',
      role: Role.USER,
    });

    expect(result).toEqual({
      userId: 'user-1',
      email: 'jane@example.com',
      role: Role.USER,
    });
  });

  it('rejects when the user no longer exists', async () => {
    const usersService = {
      findActiveById: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;

    const strategy = new JwtStrategy(configService, usersService);

    await expect(
      strategy.validate({
        sub: 'gone',
        email: 'x@example.com',
        role: Role.USER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user has been deactivated', async () => {
    const usersService = {
      findActiveById: jest
        .fn()
        .mockResolvedValue({ id: 'user-1', isActive: false }),
    } as unknown as UsersService;

    const strategy = new JwtStrategy(configService, usersService);

    await expect(
      strategy.validate({
        sub: 'user-1',
        email: 'jane@example.com',
        role: Role.USER,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

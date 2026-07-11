import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { AppLogger } from '../logger/app-logger.service';
import { Role } from '../common/enums/role.enum';
import {
  AccountLockedException,
  EmailAlreadyExistsException,
  InvalidCredentialsException,
  InvalidRefreshTokenException,
} from '../common/exceptions/app.exceptions';
import { hashValue } from '../common/utils/password.util';
import { hashToken } from '../common/utils/crypto.util';

describe('AuthService', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;
  let mailService: jest.Mocked<MailService>;

  const CONFIG = {
    jwt: {
      accessSecret: 'access-secret',
      accessExpiration: '15m',
      refreshSecret: 'refresh-secret',
      refreshExpiration: '7d',
    },
    security: {
      bcryptSaltRounds: 4,
      throttleTtl: 60,
      throttleLimit: 20,
      resetPasswordTokenExpirationMinutes: 15,
      emailVerificationTokenExpirationHours: 24,
      accountLockMaxAttempts: 5,
      accountLockDurationMinutes: 15,
    },
  };

  const baseUser = {
    id: 'user-1',
    email: 'jane@example.com',
    role: Role.USER,
    isActive: true,
    failedLoginAttempts: 0,
    lockUntil: undefined as Date | undefined,
    refreshTokenHash: undefined as string | undefined,
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findByEmailWithSecrets: jest.fn(),
            findByIdWithSecrets: jest.fn(),
            findActiveByIdOrThrow: jest.fn(),
            create: jest.fn(),
            registerFailedLoginAttempt: jest.fn(),
            recordSuccessfulLogin: jest.fn(),
            setRefreshTokenHash: jest.fn(),
            updatePassword: jest.fn(),
            setEmailVerificationToken: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verifyAsync: jest.fn(),
            decode: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendPasswordResetEmail: jest.fn(),
            sendEmailVerificationEmail: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => CONFIG[key as keyof typeof CONFIG]),
          },
        },
        {
          provide: AppLogger,
          useValue: {
            setContext: jest.fn(),
            auth: jest.fn(),
            log: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
    usersService = moduleRef.get(UsersService);
    jwtService = moduleRef.get(JwtService);
    mailService = moduleRef.get(MailService);

    jwtService.signAsync.mockResolvedValue('signed.jwt.token');
    jwtService.decode.mockReturnValue({ iat: 1000, exp: 1900 });
  });

  describe('register', () => {
    it('throws when the email is already taken', async () => {
      usersService.findByEmail.mockResolvedValue({ id: 'existing' } as never);

      await expect(
        authService.register({
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'jane@example.com',
          password: 'Str0ng!Passw0rd',
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyExistsException);
    });

    it('creates the user with a hashed password and sends a verification email', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue({
        id: 'user-1',
        email: 'jane@example.com',
      } as never);

      await authService.register({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        password: 'Str0ng!Passw0rd',
      });

      const createArg = usersService.create.mock.calls[0][0];
      expect(createArg.hashedPassword).not.toBe('Str0ng!Passw0rd');
      expect(mailService.sendEmailVerificationEmail).toHaveBeenCalledWith(
        'jane@example.com',
        expect.any(String),
      );
    });
  });

  describe('login', () => {
    it('throws InvalidCredentialsException when the user does not exist', async () => {
      usersService.findByEmailWithSecrets.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'x' }, {}),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);
    });

    it('throws AccountLockedException when locked', async () => {
      const future = new Date(Date.now() + 60_000);
      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...baseUser,
        lockUntil: future,
        password: await hashValue('Str0ng!Passw0rd', 4),
      } as never);

      await expect(
        authService.login(
          { email: baseUser.email, password: 'Str0ng!Passw0rd' },
          {},
        ),
      ).rejects.toBeInstanceOf(AccountLockedException);
    });

    it('registers a failed attempt and throws on wrong password', async () => {
      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...baseUser,
        password: await hashValue('Str0ng!Passw0rd', 4),
      } as never);
      usersService.registerFailedLoginAttempt.mockResolvedValue({
        locked: false,
      });

      await expect(
        authService.login(
          { email: baseUser.email, password: 'WrongPassword1!' },
          {},
        ),
      ).rejects.toBeInstanceOf(InvalidCredentialsException);
      expect(usersService.registerFailedLoginAttempt).toHaveBeenCalled();
    });

    it('issues a token pair and records the login on success', async () => {
      usersService.findByEmailWithSecrets.mockResolvedValue({
        ...baseUser,
        password: await hashValue('Str0ng!Passw0rd', 4),
      } as never);

      const result = await authService.login(
        { email: baseUser.email, password: 'Str0ng!Passw0rd' },
        { ipAddress: '127.0.0.1' },
      );

      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(900);
      expect(usersService.recordSuccessfulLogin).toHaveBeenCalledWith(
        baseUser.id,
        { ipAddress: '127.0.0.1' },
      );
      expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('throws when the token fails signature/expiry verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid'));

      await expect(
        authService.refreshTokens('bad-token'),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
    });

    it('throws and revokes the session when the stored hash does not match (possible reuse)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: Role.USER,
      });
      usersService.findByIdWithSecrets.mockResolvedValue({
        ...baseUser,
        refreshTokenHash: hashToken('a-different-token'),
      } as never);

      await expect(
        authService.refreshTokens('stale-token'),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenException);
      expect(usersService.setRefreshTokenHash).toHaveBeenCalledWith(
        baseUser.id,
        null,
      );
    });

    it('rotates and returns a new token pair when the hash matches', async () => {
      const currentToken = 'current-refresh-token';
      jwtService.verifyAsync.mockResolvedValue({
        sub: baseUser.id,
        email: baseUser.email,
        role: Role.USER,
      });
      usersService.findByIdWithSecrets.mockResolvedValue({
        ...baseUser,
        refreshTokenHash: hashToken(currentToken),
      } as never);

      const result = await authService.refreshTokens(currentToken);
      expect(result.accessToken).toBeDefined();
      expect(usersService.setRefreshTokenHash).toHaveBeenCalled();
    });
  });
});

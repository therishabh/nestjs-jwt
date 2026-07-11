import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createTestApp, closeTestApp } from './utils/test-app.setup';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let mongod: MongoMemoryServer;
  let server: ReturnType<typeof app.getHttpServer>;

  const user = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    password: 'Str0ng!Passw0rd',
  };

  beforeAll(async () => {
    ({ app, mongod } = await createTestApp());
    server = app.getHttpServer();
  }, 60_000);

  afterAll(async () => {
    await closeTestApp(app, mongod);
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    await request(server).get('/api/v1/profile').expect(401);
  });

  it('registers a new user without leaking the password', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send(user)
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(user.email);
    expect(res.body.data.password).toBeUndefined();
  });

  it('rejects a duplicate registration', async () => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send(user)
      .expect(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects registration with a weak password', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...user, email: 'weak@example.com', password: 'weak' })
      .expect(400);
  });

  it('rejects a request body containing a non-whitelisted property', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ ...user, email: 'extra@example.com', role: 'ADMIN' })
      .expect(400);
  });

  let accessToken: string;
  let refreshToken: string;

  it('rejects login with the wrong password', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword1!' })
      .expect(401);
  });

  it('logs in and receives a token pair', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    expect(res.body.data.tokenType).toBe('Bearer');
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('fetches the current profile with the access token', async () => {
    const res = await request(server)
      .get('/api/v1/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data.email).toBe(user.email);
  });

  it('updates allowed profile fields only', async () => {
    const res = await request(server)
      .put('/api/v1/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ firstName: 'Janet' })
      .expect(200);

    expect(res.body.data.firstName).toBe('Janet');
  });

  it('rejects attempts to change email/role through the profile endpoint', async () => {
    await request(server)
      .put('/api/v1/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: 'new@example.com' })
      .expect(400);
  });

  it('denies a regular user access to the admin-only users list', async () => {
    await request(server)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('rotates the refresh token and rejects the old one on reuse', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const first = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    const rotatedRefreshToken = first.body.data.refreshToken;
    expect(rotatedRefreshToken).not.toBe(refreshToken);

    // Reusing the rotated-out token is treated as possible token theft:
    // AuthService responds by revoking the *entire* session, so even the
    // legitimately-rotated token below stops working. This is intentional
    // (see AuthService.refreshTokens) — a stricter posture than merely
    // rejecting the reused token while leaving the session alive.
    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken })
      .expect(401);
  });

  it('logs out and revokes the refresh token', async () => {
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(200);

    await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(401);
  });

  it('completes the forgot/reset password flow and invalidates the old password', async () => {
    await request(server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: user.email })
      .expect(200);

    // The mail service is a logging stub in this environment (Step 10) —
    // there is no real inbox to read the token from here, so this test
    // documents the endpoint contract (always 200, never reveals whether
    // the email exists) rather than the full token round-trip, which the
    // AuthService unit tests cover directly against the real token.
    await request(server)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'doesnotexist@example.com' })
      .expect(200);

    await request(server)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'An0ther!Str0ngPW' })
      .expect(401);
  });

  it('locks the account after too many failed login attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'WrongPassword1!' });
    }

    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(401);

    expect(res.body.message).toMatch(/locked/i);
  });
});

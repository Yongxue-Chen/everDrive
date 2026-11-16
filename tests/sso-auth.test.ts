import { createHmac } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app/create-app.js';
import { createSessionChecker, readCookie, ssoConfigFromEnv, verifySsoToken } from '../src/lib/sso.js';
import type { SsoConfig } from '../src/lib/sso.js';

const SECRET = 'test-secret-not-a-real-one';

function token(claims: Record<string, unknown> = {}, secret = SECRET, alg = 'HS256'): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg, typ: 'JWT' });
  const payload = encode({
    iss: 'evertravel',
    aud: 'ever-sso',
    sub: '7',
    email: 'owner@example.com',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims
  });
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

const config: SsoConfig = {
  secret: SECRET,
  loginUrl: 'https://id.example.com/auth/sso',
  logoutUrl: 'https://id.example.com/auth/sso/logout',
  checkUrl: '',
  allowedEmails: ['owner@example.com']
};

function app(sso?: Parameters<typeof createApp>[0]['sso']) {
  return createApp({ checkDb: async () => true, checkRclone: async () => true, sso });
}

describe('verifySsoToken', () => {
  it('accepts a correctly signed, unexpired token', () => {
    expect(verifySsoToken(token(), SECRET)?.email).toBe('owner@example.com');
  });

  it('rejects a wrong signature, issuer, audience, algorithm or an expired token', () => {
    expect(verifySsoToken(token({}, 'another-secret'), SECRET)).toBeNull();
    expect(verifySsoToken(token({ iss: 'someone-else' }), SECRET)).toBeNull();
    expect(verifySsoToken(token({ aud: 'other' }), SECRET)).toBeNull();
    expect(verifySsoToken(token({}, SECRET, 'none'), SECRET)).toBeNull();
    expect(verifySsoToken(token({ exp: Math.floor(Date.now() / 1000) - 1 }), SECRET)).toBeNull();
    expect(verifySsoToken('not-a-token', SECRET)).toBeNull();
    expect(verifySsoToken(undefined, SECRET)).toBeNull();
  });

  it('rejects a payload that was altered after signing', () => {
    const [header, , signature] = token().split('.');
    const forged = Buffer.from(
      JSON.stringify({ iss: 'evertravel', aud: 'ever-sso', email: 'attacker@example.com', exp: 9999999999 })
    ).toString('base64url');
    expect(verifySsoToken(`${header}.${forged}.${signature}`, SECRET)).toBeNull();
  });
});

describe('ssoConfigFromEnv and readCookie', () => {
  it('is off unless both the secret and the login URL are set', () => {
    expect(ssoConfigFromEnv({})).toBeNull();
    expect(ssoConfigFromEnv({ SSO_SECRET: 'x' })).toBeNull();
    expect(ssoConfigFromEnv({ SSO_SECRET: 'x', SSO_LOGIN_URL: 'https://id/', SSO_ALLOWED_EMAILS: ' A@b.c, ,d@e.f ' })?.allowedEmails).toEqual([
      'a@b.c',
      'd@e.f'
    ]);
  });

  it('finds one cookie among several', () => {
    expect(readCookie('a=1; ever_sso=abc.def.ghi; b=2', 'ever_sso')).toBe('abc.def.ghi');
    expect(readCookie('a=1', 'ever_sso')).toBeUndefined();
    expect(readCookie(undefined, 'ever_sso')).toBeUndefined();
  });
});

describe('SSO guard on the HTTP API', () => {
  it('leaves the API open when SSO is not configured', async () => {
    const response = await request(app()).get('/api/auth/session');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authEnabled: false, email: null, logoutUrl: null });
  });

  it('fails closed when SSO is required but not configured', async () => {
    const response = await request(app({ config: null, required: true })).get('/api/auth/session');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SSO_NOT_CONFIGURED');
  });

  it('keeps the health probes public', async () => {
    const guarded = app({ config, required: true });
    expect((await request(guarded).get('/health')).status).toBe(200);
    expect((await request(guarded).get('/ready')).status).toBe(200);
    expect((await request(app({ config: null, required: true })).get('/ready')).status).toBe(200);
  });

  it('answers 401 with the login URL when there is no valid cookie', async () => {
    const guarded = app({ config });
    for (const cookie of [undefined, 'ever_sso=garbage', `ever_sso=${token({}, 'another-secret')}`]) {
      const pending = request(guarded).get('/api/auth/session');
      const response = await (cookie ? pending.set('Cookie', cookie) : pending);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
      expect(response.body.loginUrl).toBe(config.loginUrl);
    }
  });

  it('guards routes that do not exist too, so nothing is disclosed before sign-in', async () => {
    expect((await request(app({ config })).get('/api/anything')).status).toBe(401);
    expect((await request(app({ config })).get('/')).status).toBe(401);
  });

  it('lets a signed-in user through and reports who they are', async () => {
    const response = await request(app({ config })).get('/api/auth/session').set('Cookie', `other=1; ever_sso=${token()}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ authEnabled: true, email: 'owner@example.com', logoutUrl: config.logoutUrl });
  });

  it('refuses a validly signed token for an email that is not allowed', async () => {
    const response = await request(app({ config }))
      .get('/api/auth/session')
      .set('Cookie', `ever_sso=${token({ email: 'stranger@example.com' })}`);
    expect(response.status).toBe(401);
  });

  it('refuses a token the issuer says is no longer valid', async () => {
    const response = await request(app({ config: { ...config, checkUrl: 'http://id/check' }, isStillValid: async () => false }))
      .get('/api/auth/session')
      .set('Cookie', `ever_sso=${token()}`);
    expect(response.status).toBe(401);
  });
});

describe('createSessionChecker', () => {
  const reply = (status: number) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;

  it('treats 401 as logged out, 2xx as valid, and caches both', async () => {
    const revoked = reply(401);
    const check = createSessionChecker(revoked);
    expect(await check('t1', 'http://id/check')).toBe(false);
    expect(await check('t1', 'http://id/check')).toBe(false);
    expect(revoked).toHaveBeenCalledTimes(1);

    expect(await createSessionChecker(reply(200))('t2', 'http://id/check')).toBe(true);
  });

  it('trusts the signature when the issuer is down or erroring, and when no check URL is set', async () => {
    const failing = vi.fn(async () => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    expect(await createSessionChecker(failing)('t', 'http://id/check')).toBe(true);
    expect(await createSessionChecker(reply(500))('t', 'http://id/check')).toBe(true);
    const unused = reply(200);
    expect(await createSessionChecker(unused)('t', '')).toBe(true);
    expect(unused).not.toHaveBeenCalled();
  });
});

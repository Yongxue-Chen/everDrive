// Optional single sign-on.
//
// everDrive has no user accounts of its own. When SSO is configured it trusts a login
// done elsewhere: an identity service (everTravel in the reference deployment) sets the
// `ever_sso` cookie on a shared parent domain. The cookie is an HS256 JWT signed with
// SSO_SECRET. We verify signature, issuer, audience and expiry, optionally restrict to
// SSO_ALLOWED_EMAILS, and optionally ask the issuer (SSO_CHECK_URL) whether the session
// is still valid, so logging out or changing the password there logs everDrive out too.
// That answer is cached for a few minutes; if the issuer is unreachable a correctly
// signed, unexpired token is accepted.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const SSO_COOKIE = 'ever_sso';
const SSO_ISSUER = 'evertravel';
const SSO_AUDIENCE = 'ever-sso';
const CHECK_TTL_MS = 5 * 60 * 1000;
const CHECK_TIMEOUT_MS = 3000;
const CHECK_CACHE_LIMIT = 500;

export type SsoConfig = {
  secret: string;
  loginUrl: string;
  logoutUrl: string;
  checkUrl: string;
  allowedEmails: string[];
};

export type SsoUser = {
  email: string;
  userId: string;
};

type SsoEnv = {
  SSO_SECRET?: string;
  SSO_LOGIN_URL?: string;
  SSO_LOGOUT_URL?: string;
  SSO_CHECK_URL?: string;
  SSO_ALLOWED_EMAILS?: string;
};

type SsoClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  sub?: unknown;
  email?: unknown;
};

export type SessionChecker = (token: string, checkUrl: string) => Promise<boolean>;

/** SSO is on only when both the signing secret and the login URL are set. */
export function ssoConfigFromEnv(env: SsoEnv): SsoConfig | null {
  const secret = env.SSO_SECRET ?? '';
  const loginUrl = env.SSO_LOGIN_URL ?? '';
  if (!secret || !loginUrl) {
    return null;
  }
  return {
    secret,
    loginUrl,
    logoutUrl: env.SSO_LOGOUT_URL ?? '',
    checkUrl: env.SSO_CHECK_URL ?? '',
    allowedEmails: String(env.SSO_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  };
}

function decodeJson(segment: string): unknown {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

/** Signature, issuer, audience and expiry. Returns the claims or null. */
export function verifySsoToken(token: string | undefined, secret: string, now = Date.now()): SsoClaims | null {
  if (!token || !secret) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  try {
    const header = decodeJson(headerPart) as { alg?: unknown };
    if (header.alg !== 'HS256') {
      return null;
    }
    const expected = createHmac('sha256', secret).update(`${headerPart}.${payloadPart}`).digest();
    const actual = Buffer.from(signaturePart, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    const claims = decodeJson(payloadPart) as SsoClaims;
    if (claims.iss !== SSO_ISSUER || claims.aud !== SSO_AUDIENCE) {
      return null;
    }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

/** Asks the issuer whether a token is still valid, caching the answer briefly. */
export function createSessionChecker(fetchImpl: typeof fetch = fetch): SessionChecker {
  const cache = new Map<string, { ok: boolean; until: number }>();

  return async (token, checkUrl) => {
    if (!checkUrl) {
      return true;
    }
    const cached = cache.get(token);
    if (cached && cached.until > Date.now()) {
      return cached.ok;
    }
    let ok: boolean;
    try {
      const response = await fetchImpl(checkUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
      });
      if (response.status === 401) {
        ok = false;
      } else if (response.ok) {
        ok = true;
      } else {
        return true; // issuer trouble: trust the signature, do not cache
      }
    } catch {
      return true;
    }
    if (cache.size > CHECK_CACHE_LIMIT) {
      cache.clear();
    }
    cache.set(token, { ok, until: Date.now() + CHECK_TTL_MS });
    return ok;
  };
}

/** The signed-in user for this token, or null. */
export async function readSsoUser(
  token: string | undefined,
  config: SsoConfig,
  isStillValid: SessionChecker
): Promise<SsoUser | null> {
  const claims = verifySsoToken(token, config.secret);
  if (!claims || !token) {
    return null;
  }
  const email = String(claims.email ?? '').toLowerCase();
  if (config.allowedEmails.length > 0 && !config.allowedEmails.includes(email)) {
    return null;
  }
  if (!(await isStillValid(token, config.checkUrl))) {
    return null;
  }
  return { email, userId: String(claims.sub ?? '') };
}

/** Reads one cookie from a Cookie request header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return undefined;
}

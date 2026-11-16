import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { SSO_COOKIE, createSessionChecker, readCookie, readSsoUser } from '../lib/sso.js';
import type { SessionChecker, SsoConfig } from '../lib/sso.js';

// Probes used by Docker and reverse proxies; they reveal nothing but up/down.
const PUBLIC_PATHS = new Set(['/health', '/ready']);

type SsoAuthOptions = {
  config: SsoConfig | null;
  /** Refuse every request when SSO is not configured, instead of running open. */
  required?: boolean;
  isStillValid?: SessionChecker;
};

/**
 * Guards every route except the health probes.
 *
 * - SSO configured: a valid `ever_sso` cookie is required; otherwise 401 with the login
 *   URL so the web UI can send the browser there.
 * - SSO not configured: requests pass through (the historical behaviour), unless
 *   `required` is set, in which case they get 503 so a misconfigured deployment fails
 *   closed.
 */
export function createSsoAuthMiddleware(options: SsoAuthOptions): RequestHandler {
  const { config, required = false } = options;
  const isStillValid = options.isStillValid ?? createSessionChecker();

  return (req: Request, res: Response, next: NextFunction): void => {
    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }

    const requestId = res.locals.requestId as string | undefined;

    if (!config) {
      if (!required) {
        next();
        return;
      }
      res.status(503).json({
        error: { code: 'SSO_NOT_CONFIGURED', message: 'Sign-in is required but SSO is not configured', requestId }
      });
      return;
    }

    readSsoUser(readCookie(req.headers.cookie, SSO_COOKIE), config, isStillValid)
      .then((user) => {
        if (user) {
          res.locals.user = user;
          next();
          return;
        }
        res.status(401).json({
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required', requestId },
          loginUrl: config.loginUrl
        });
      })
      .catch(next);
  };
}

/** Tells the web UI who is signed in and where to sign out. */
export function createSessionHandler(config: SsoConfig | null): RequestHandler {
  return (_req: Request, res: Response): void => {
    const user = res.locals.user as { email: string } | undefined;
    res.json({
      authEnabled: config !== null,
      email: user?.email ?? null,
      logoutUrl: config?.logoutUrl || null
    });
  };
}

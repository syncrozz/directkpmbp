/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — CLOUD RUN & EXPRESS CORS POLICY (SES v4.5)
 *
 * Enforces explicit origin allowlisting via ALLOWED_ORIGINS,
 * supports OPTIONS preflight (204), disallows wildcard '*',
 * and applies CORS headers consistently to success and error responses.
 */

import type { Request, Response, NextFunction } from 'express';

export const DEFAULT_ALLOWED_ORIGINS = [
  'https://directkpmbp.syncrozz.com',
  'https://syncrozz-platform.web.app',
  'https://syncrozz-platform.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
] as const;

/**
 * Parses comma-separated ALLOWED_ORIGINS into normalized origin strings.
 * Rejects wildcards ('*') and malformed URLs.
 */
export function parseAllowedOrigins(rawEnv?: string): {
  origins: Set<string>;
  isExplicitlyConfigured: boolean;
} {
  const trimmed = (rawEnv || '').trim();
  if (!trimmed) {
    return {
      origins: new Set(DEFAULT_ALLOWED_ORIGINS),
      isExplicitlyConfigured: false,
    };
  }

  const parsed = new Set<string>();
  for (const token of trimmed.split(',')) {
    const candidate = token.trim();
    if (!candidate || candidate === '*') continue;
    try {
      const u = new URL(candidate);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        parsed.add(u.origin);
      }
    } catch {
      // Ignore malformed origin entries
    }
  }

  return {
    origins: parsed,
    isExplicitlyConfigured: true,
  };
}

function isSameHostOrigin(origin: string, hostHeader?: string): boolean {
  if (!hostHeader) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.host.toLowerCase() === hostHeader.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function isOriginApproved(
  origin: string,
  allowedOrigins: Set<string>,
  options: { allowSameHost?: boolean; hostHeader?: string } = {}
): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (allowedOrigins.has(parsed.origin)) {
      return true;
    }
    if (options.allowSameHost && isSameHostOrigin(parsed.origin, options.hostHeader)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Express middleware enforcing strict origin-based CORS with OPTIONS 204 preflight.
 * Reads ALLOWED_ORIGINS dynamically (or uses explicit override for testing).
 */
export function createCorsMiddleware(explicitAllowedOriginsEnv?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const envRaw =
      explicitAllowedOriginsEnv !== undefined
        ? explicitAllowedOriginsEnv
        : process.env.ALLOWED_ORIGINS;
    const { origins, isExplicitlyConfigured } = parseAllowedOrigins(envRaw);

    res.setHeader('Vary', 'Origin');

    const rawOrigin = req.headers.origin;
    if (!rawOrigin) {
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      return next();
    }

    const originValue = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    const approved = isOriginApproved(originValue, origins, {
      allowSameHost: !isExplicitlyConfigured,
      hostHeader: req.headers.host,
    });

    if (!approved) {
      if (req.method === 'OPTIONS' || req.path.startsWith('/api/')) {
        return res.status(403).json({
          success: false,
          code: 'CORS_ORIGIN_FORBIDDEN',
          error: 'Origin permintaan tidak dibenarkan oleh dasar CORS pelayan.',
        });
      }
      return res.status(403).send('Forbidden Origin');
    }

    const normalizedOrigin = new URL(originValue).origin;
    const allowedMethods =
      req.path === '/api/platform/snapshot' ? 'POST, OPTIONS' : 'GET, POST, OPTIONS';

    res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
}

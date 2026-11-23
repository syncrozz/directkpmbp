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
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

function normalizeOriginCandidate(rawValue?: string): string | null {
  const candidate = (rawValue || '').trim();
  if (!candidate || candidate === '*') return null;
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.origin;
    }
  } catch {
    // Ignore invalid URL/host candidate
  }
  return null;
}

function buildFirebaseConfigOrigins(): string[] {
  const derived: string[] = [];
  const projectId = (firebaseConfig.projectId || '').trim();
  if (projectId) {
    derived.push(`https://${projectId}.web.app`, `https://${projectId}.firebaseapp.com`);
  }
  const authDomainOrigin = normalizeOriginCandidate(firebaseConfig.authDomain);
  if (authDomainOrigin) {
    derived.push(authDomainOrigin);
  }
  return derived;
}

export const DEFAULT_ALLOWED_ORIGINS = Array.from(
  new Set([
    'https://directkpmbp.syncrozz.com',
    'https://syncrozz-platform.web.app',
    'https://syncrozz-platform.firebaseapp.com',
    ...buildFirebaseConfigOrigins(),
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5173',
  ])
);

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

function extractFirstHeaderValue(value?: string | string[]): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw || '').split(',')[0].trim().toLowerCase();
}

function isSameHostOrigin(
  origin: string,
  hostHeader?: string | string[],
  forwardedHostHeader?: string | string[]
): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const originHost = parsed.host.toLowerCase();
    const directHost = extractFirstHeaderValue(hostHeader);
    const forwardedHost = extractFirstHeaderValue(forwardedHostHeader);
    return (
      (Boolean(directHost) && originHost === directHost) ||
      (Boolean(forwardedHost) && originHost === forwardedHost)
    );
  } catch {
    return false;
  }
}

function isTrustedHostingPreviewOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith('.scf.usercontent.goog') ||
      host.endsWith('.usercontent.goog') ||
      host.endsWith('.aistudio.google.com')
    );
  } catch {
    return false;
  }
}

export function isOriginApproved(
  origin: string,
  allowedOrigins: Set<string>,
  options: {
    allowSameHost?: boolean;
    isSameOriginFetch?: boolean;
    hostHeader?: string | string[];
    forwardedHostHeader?: string | string[];
  } = {}
): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (options.isSameOriginFetch) {
      return true;
    }
    if (allowedOrigins.has(parsed.origin)) {
      return true;
    }
    if (
      options.allowSameHost &&
      isSameHostOrigin(parsed.origin, options.hostHeader, options.forwardedHostHeader)
    ) {
      return true;
    }
    if (isTrustedHostingPreviewOrigin(parsed.origin)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Express middleware enforcing strict origin-based CORS with OPTIONS 204 preflight
 * on /api/* endpoints. Non-API frontend routes (HTML, Vite ESM modules, static assets)
 * pass through without cross-origin blocking so reverse-proxied previews render cleanly.
 */
export function createCorsMiddleware(explicitAllowedOriginsEnv?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestPath = (req.originalUrl || req.path || '').split('?')[0];
    if (requestPath !== '/api' && !requestPath.startsWith('/api/')) {
      return next();
    }

    const envRaw =
      explicitAllowedOriginsEnv !== undefined
        ? explicitAllowedOriginsEnv
        : process.env.ALLOWED_ORIGINS;
    const { origins } = parseAllowedOrigins(envRaw);

    res.setHeader('Vary', 'Origin');

    const rawOrigin = req.headers.origin;
    if (!rawOrigin) {
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      return next();
    }

    const originValue = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    const secFetchSite = extractFirstHeaderValue(req.headers['sec-fetch-site']);
    const isSameOriginFetch = secFetchSite === 'same-origin';

    // Automatically include runtime platform URLs if provided by the hosting environment
    for (const runtimeCandidate of [
      process.env.APP_URL,
      process.env.SHARED_APP_URL,
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]) {
      const normalized = normalizeOriginCandidate(runtimeCandidate);
      if (normalized) {
        origins.add(normalized);
      }
    }

    const approved = isOriginApproved(originValue, origins, {
      allowSameHost: true,
      isSameOriginFetch,
      hostHeader: req.headers.host,
      forwardedHostHeader: req.headers['x-forwarded-host'],
    });

    if (!approved) {
      return res.status(403).json({
        success: false,
        code: 'CORS_ORIGIN_FORBIDDEN',
        error: 'Origin permintaan tidak dibenarkan oleh dasar CORS pelayan.',
      });
    }

    const normalizedOrigin = new URL(originValue).origin;
    const allowedMethods =
      requestPath === '/api/platform/snapshot' ? 'POST, OPTIONS' : 'GET, POST, OPTIONS';

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

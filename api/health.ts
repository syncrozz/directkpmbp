import type { IncomingMessage, ServerResponse } from 'http';

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'https://directkpmbp.syncrozz.com',
  'https://syncrozz-platform.web.app',
  'https://syncrozz-platform.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
]);

function applyExactCors(req: IncomingMessage, res: ServerResponse): boolean {
  res.setHeader('Vary', 'Origin');
  const rawOrigin = req.headers.origin;
  if (!rawOrigin) return true;

  const originVal = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  let normalizedOrigin: string;
  try {
    const u = new URL(originVal);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    normalizedOrigin = u.origin;
  } catch {
    return false;
  }

  const envOrigins = (process.env.ALLOWED_ORIGINS || '').trim();
  const allowed = new Set<string>(envOrigins ? [] : DEFAULT_ALLOWED_ORIGINS);
  if (envOrigins) {
    for (const token of envOrigins.split(',')) {
      const c = token.trim();
      if (!c || c === '*') continue;
      try {
        const u = new URL(c);
        if (u.protocol === 'http:' || u.protocol === 'https:') allowed.add(u.origin);
      } catch {
        // ignore invalid origin
      }
    }
  }

  const hostHeader = String(req.headers.host || '').trim().toLowerCase();
  const sameHost = !envOrigins && hostHeader && new URL(normalizedOrigin).host.toLowerCase() === hostHeader;
  if (!allowed.has(normalizedOrigin) && !sameHost) {
    res.statusCode = 403;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin permintaan tidak dibenarkan.' }));
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', normalizedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  return true;
}

export default function handler(req: IncomingMessage, res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any }) {
  if (!applyExactCors(req, res)) return;

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ status: 'ok', service: 'Directory KPMBP' }));
}

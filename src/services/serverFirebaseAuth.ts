/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Server-side Firebase ID Token & Master Admin Verifier
 * Verifies RS256 signatures against Google's official public X.509 certificates
 * for securetoken@system.gserviceaccount.com without requiring IAM service account secrets.
 */

import crypto from 'node:crypto';
import type { Request } from 'express';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

const SECURE_TOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const AUTHORIZED_ADMIN_EMAILS = new Set([
  'cgkhairi2u@gmail.com',
  'chegukay@gmail.com',
  'cikgukyee@gmail.com',
  'kpmbp2u@gmail.com',
  'khaikerr@gmail.com',
  'festivalseni.kpmbp@gmail.com',
  'kpmbppsn@gmail.com',
]);

let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  return Buffer.from(pad ? normalized + '='.repeat(4 - pad) : normalized, 'base64');
}

async function fetchGooglePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certsExpiresAt > now && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(SECURE_TOKEN_CERTS_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Google public certificates.`);
    }
    const certs = (await res.json()) as Record<string, string>;
    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? Math.min(3600, Math.max(60, parseInt(maxAgeMatch[1], 10))) : 300;
    cachedCerts = certs;
    certsExpiresAt = now + maxAgeSec * 1000;
    return certs;
  } finally {
    clearTimeout(timer);
  }
}

export interface MasterAdminAuthResult {
  authorized: boolean;
  status: number;
  uid?: string;
  email?: string;
  error?: string;
}

/**
 * Verifies a Firebase Auth Bearer token and enforces Master Administrator allowlist.
 */
export async function verifyMasterAdminRequest(req: Request): Promise<MasterAdminAuthResult> {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      authorized: false,
      status: 401,
      error: 'Pengesahan Firebase Master Admin diperlukan (Bearer token tiada).',
    };
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    return {
      authorized: false,
      status: 401,
      error: 'Format token pengesahan tidak sah.',
    };
  }

  let header: { alg?: string; kid?: string };
  let payload: Record<string, any>;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
  } catch {
    return {
      authorized: false,
      status: 401,
      error: 'Token pengesahan gagal dinyahkod.',
    };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return {
      authorized: false,
      status: 401,
      error: 'Algoritma atau pengenal kunci token tidak sah.',
    };
  }

  let certs: Record<string, string>;
  try {
    certs = await fetchGooglePublicCerts(false);
    if (!certs[header.kid]) {
      certs = await fetchGooglePublicCerts(true);
    }
  } catch (err: any) {
    return {
      authorized: false,
      status: 503,
      error: `Gagal mengesahkan sijil awam Google Auth: ${err?.message || err}`,
    };
  }

  const pem = certs[header.kid];
  if (!pem) {
    return {
      authorized: false,
      status: 401,
      error: 'Kunci tandatangan token tidak diiktiraf.',
    };
  }

  const signedContent = `${parts[0]}.${parts[1]}`;
  const signature = decodeBase64Url(parts[2]);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signedContent);
  verifier.end();

  let signatureValid = false;
  try {
    signatureValid = verifier.verify(pem, signature);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return {
      authorized: false,
      status: 401,
      error: 'Tandatangan token pengesahan tidak sah.',
    };
  }

  const projectId = firebaseConfig.projectId;
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId || payload.iss !== expectedIssuer) {
    return {
      authorized: false,
      status: 401,
      error: 'Token bukan milik projek Firebase DIRECTKPMBP yang sah.',
    };
  }

  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
    return {
      authorized: false,
      status: 401,
      error: 'Identiti pengguna (sub) dalam token tidak sah.',
    };
  }

  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 300 ||
    (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300)
  ) {
    return {
      authorized: false,
      status: 401,
      error: 'Sesi token pengesahan telah tamat tempoh.',
    };
  }

  const cleanEmail = String(payload.email || '').trim().toLowerCase();
  if (payload.email_verified !== true || !cleanEmail || !AUTHORIZED_ADMIN_EMAILS.has(cleanEmail)) {
    return {
      authorized: false,
      status: 403,
      error: 'Akses Ditolak: Hanya Master Administrator yang diotorisasi dibenarkan menjana snapshot.',
    };
  }

  return {
    authorized: true,
    status: 200,
    uid: payload.sub,
    email: cleanEmail,
  };
}

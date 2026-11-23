/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — SYNCROZZ DEADLINE HUB SERVER-SIDE AUTO-ARCHIVE ENGINE (SES v4.5)
 *
 * Policy:
 * - Automatically archives ACTIVE announcements strictly after 24 complete hours
 *   (86,400,000 ms) have elapsed from actual expiry in Asia/Kuala_Lumpur.
 * - Targets named Firestore database in firebase-applet-config.json.
 * - Uses atomic Firestore transactions (runTransaction) to re-read candidate state,
 *   update /deadlines/{id}, and create /deadline_audit_logs/{logId} together.
 * - Preserves ISO-8601 timestamp format for compatibility with firestore.rules,
 *   frontend display/sorting, and Admin manual restore.
 */

import crypto from 'node:crypto';
import type { Request } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import {
  getFirestore,
  Timestamp,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import type { DeadlineAuditLog, DeadlineRecord } from '../types.ts';
import {
  DEADLINE_TIMEZONE,
  SYSTEM_AUTO_ARCHIVE_ACTOR,
  SYSTEM_AUTO_ARCHIVE_REASON,
  evaluateAutoArchiveEligibility,
} from '../utils/deadlineStatus.ts';
import { verifyMasterAdminRequest } from './serverFirebaseAuth.ts';

const DEADLINES_COL = 'deadlines';
const DEADLINE_AUDIT_COL = 'deadline_audit_logs';
const GOOGLE_OAUTH_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

let cachedOidcJwkKeys: Array<Record<string, any>> = [];
let oidcKeysExpiresAt = 0;

export interface AutoArchiveTriggerAuthResult {
  authorized: boolean;
  status: number;
  actor?: string;
  mode?: 'scheduler_secret' | 'scheduler_oidc' | 'master_admin';
  error?: string;
}

export interface AutoArchiveRunOptions {
  firestore?: Firestore;
  now?: Date | (() => Date);
  pageSize?: number;
  maxScan?: number;
  maxArchivePerRun?: number;
  triggeredBy?: string;
  dryRun?: boolean;
}

export interface AutoArchiveRunSummary {
  runId: string;
  executedAt: string;
  timezone: typeof DEADLINE_TIMEZONE;
  databaseId: string;
  triggeredBy: string;
  dryRun: boolean;
  totalActiveScanned: number;
  totalCandidatesFound: number;
  archivedCount: number;
  skippedCount: number;
  failedCount: number;
  skipBreakdown: Record<string, number>;
  archivedIds: string[];
  errors: Array<{ deadlineId: string; code: string; message: string }>;
}

export class DeadlineArchiveError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function resolveNamedDatabaseId(): string | undefined {
  const rawDbId = String(firebaseConfig.firestoreDatabaseId || '').trim();
  if (
    !rawDbId ||
    rawDbId === 'default' ||
    rawDbId === '(default)' ||
    rawDbId === 'remixed-firestore-database-id'
  ) {
    return undefined;
  }
  return rawDbId;
}

export function getDeadlineAdminFirestore(): Firestore {
  const projectId = String(firebaseConfig.projectId || '').trim();
  const rawDbId = String(firebaseConfig.firestoreDatabaseId || '').trim();

  if (
    !projectId ||
    projectId === 'remixed-project-id' ||
    rawDbId === 'remixed-firestore-database-id'
  ) {
    throw new DeadlineArchiveError(
      'FIREBASE_NOT_CONFIGURED',
      'Konfigurasi Firebase projek belum lengkap untuk akses pelayan.',
      503
    );
  }

  const app = getApps().length ? getApp() : initializeApp({ projectId });
  const namedDbId = resolveNamedDatabaseId();
  return namedDbId ? getFirestore(app, namedDbId) : getFirestore(app);
}

function generateSafeAuditLogId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(4).toString('hex');
  return `audit_${ts}_${rand}`;
}

function timingSafeStringMatch(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function decodeBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  return Buffer.from(pad ? normalized + '='.repeat(4 - pad) : normalized, 'base64');
}

async function fetchGoogleOidcJwks(forceRefresh = false): Promise<Array<Record<string, any>>> {
  const now = Date.now();
  if (!forceRefresh && oidcKeysExpiresAt > now && cachedOidcJwkKeys.length > 0) {
    return cachedOidcJwkKeys;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(GOOGLE_OAUTH_CERTS_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} fetching Google OIDC JWKS.`);
    }
    const payload = (await res.json()) as { keys?: Array<Record<string, any>> };
    const keys = Array.isArray(payload?.keys) ? payload.keys : [];
    const cacheControl = res.headers.get('cache-control') || '';
    const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
    const maxAgeSec = maxAgeMatch ? Math.min(3600, Math.max(60, parseInt(maxAgeMatch[1], 10))) : 300;
    cachedOidcJwkKeys = keys;
    oidcKeysExpiresAt = now + maxAgeSec * 1000;
    return keys;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyGoogleSchedulerOidcToken(
  token: string,
  jwksOverride?: Array<Record<string, any>>
): Promise<{
  matchedConfiguredPolicy: boolean;
  authorized: boolean;
  statusCode?: number;
  email?: string;
  error?: string;
}> {
  const expectedAudience = String(process.env.AUTO_ARCHIVE_OIDC_AUDIENCE || '').trim();
  const expectedEmail = String(process.env.AUTO_ARCHIVE_SCHEDULER_SA_EMAIL || '')
    .trim()
    .toLowerCase();

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) {
    return {
      matchedConfiguredPolicy: Boolean(expectedAudience || expectedEmail),
      authorized: false,
      statusCode: 401,
      error: 'Format token OIDC tidak sah.',
    };
  }

  let header: { alg?: string; kid?: string };
  let payload: Record<string, any>;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8'));
  } catch {
    return {
      matchedConfiguredPolicy: Boolean(expectedAudience || expectedEmail),
      authorized: false,
      statusCode: 401,
      error: 'Token pengesahan gagal dinyahkod.',
    };
  }

  const issuer = String(payload.iss || '').trim();
  const isGoogleOidcIssuer =
    issuer === 'https://accounts.google.com' || issuer === 'accounts.google.com';

  if (!isGoogleOidcIssuer) {
    // Not a Google OIDC token (e.g., Firebase ID Token uses securetoken.google.com/<projectId>)
    return { matchedConfiguredPolicy: false, authorized: false };
  }

  if (!expectedAudience || !expectedEmail) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 503,
      error:
        'Konfigurasi OIDC Cloud Scheduler (AUTO_ARCHIVE_OIDC_AUDIENCE / AUTO_ARCHIVE_SCHEDULER_SA_EMAIL) belum ditetapkan di pelayan.',
    };
  }

  if (header.alg !== 'RS256' || !header.kid) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 401,
      error: 'Algoritma atau pengenal kunci token OIDC tidak sah.',
    };
  }

  let keys = jwksOverride || (await fetchGoogleOidcJwks(false));
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk && !jwksOverride) {
    keys = await fetchGoogleOidcJwks(true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 401,
      error: 'Kunci tandatangan OIDC Google tidak ditemui.',
    };
  }

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk as any, format: 'jwk' });
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    signatureValid = verifier.verify(publicKey, decodeBase64Url(parts[2]));
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 401,
      error: 'Tandatangan token OIDC tidak sah.',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (
    typeof payload.exp !== 'number' ||
    payload.exp <= nowSec ||
    typeof payload.iat !== 'number' ||
    payload.iat > nowSec + 300 ||
    (typeof payload.nbf === 'number' && payload.nbf > nowSec + 300)
  ) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 401,
      error: 'Token OIDC telah tamat tempoh atau belum sah.',
    };
  }

  if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 401,
      error: 'Subjek token OIDC tidak sah.',
    };
  }

  const normalizedExpectedAud = expectedAudience.replace(/\/+$/, '');
  const rawAud = payload.aud;
  const audMatches =
    typeof rawAud === 'string' && rawAud.trim().replace(/\/+$/, '') === normalizedExpectedAud;

  if (!audMatches) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 403,
      error: 'Audience token OIDC tidak sepadan dengan konfigurasi pelayan.',
    };
  }

  const tokenEmail = String(payload.email || '').trim().toLowerCase();
  if (payload.email_verified !== true || !tokenEmail || tokenEmail !== expectedEmail) {
    return {
      matchedConfiguredPolicy: true,
      authorized: false,
      statusCode: 403,
      error: 'Akses Ditolak: Akaun perkhidmatan Cloud Scheduler tidak diotorisasi.',
    };
  }

  return {
    matchedConfiguredPolicy: true,
    authorized: true,
    statusCode: 200,
    email: tokenEmail,
  };
}

/**
 * Authorizes auto-archive trigger requests strictly for:
 * 1) Verified Google Cloud Scheduler OIDC service account token (Preferred in production)
 * 2) Optional shared scheduler secret (`AUTO_ARCHIVE_CRON_SECRET`, >= 16 chars)
 * 3) Verified Master Administrator (Firebase ID Token + 7-email allowlist)
 *
 * Ordinary staff and unauthenticated browsers are always rejected (401 / 403).
 */
export async function verifyAutoArchiveTriggerRequest(
  req: Request
): Promise<AutoArchiveTriggerAuthResult> {
  const configuredSecret = String(process.env.AUTO_ARCHIVE_CRON_SECRET || '').trim();
  const headerSecret = String(req.headers['x-syncrozz-cron-secret'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (bearerToken) {
    try {
      const oidcCheck = await verifyGoogleSchedulerOidcToken(bearerToken);
      if (oidcCheck.matchedConfiguredPolicy) {
        if (!oidcCheck.authorized) {
          return {
            authorized: false,
            status: oidcCheck.statusCode || 403,
            error: oidcCheck.error || 'Akses OIDC scheduler ditolak.',
          };
        }
        return {
          authorized: true,
          status: 200,
          actor: `scheduler:oidc:${oidcCheck.email || 'sa'}`,
          mode: 'scheduler_oidc',
        };
      }
    } catch (err: any) {
      return {
        authorized: false,
        status: 503,
        error: `Gagal mengesahkan token OIDC scheduler: ${err?.message || err}`,
      };
    }
  }

  if (headerSecret) {
    if (configuredSecret.length < 16) {
      return {
        authorized: false,
        status: 503,
        error: 'Rahsia penjadual (AUTO_ARCHIVE_CRON_SECRET) belum dikonfigurasikan di pelayan.',
      };
    }
    if (!timingSafeStringMatch(headerSecret, configuredSecret)) {
      return {
        authorized: false,
        status: 403,
        error: 'Akses Ditolak: Rahsia penjadual tidak sah.',
      };
    }
    return {
      authorized: true,
      status: 200,
      actor: 'scheduler:cron-secret',
      mode: 'scheduler_secret',
    };
  }

  if (bearerToken && configuredSecret.length >= 16 && timingSafeStringMatch(bearerToken, configuredSecret)) {
    return {
      authorized: true,
      status: 200,
      actor: 'scheduler:cron-secret',
      mode: 'scheduler_secret',
    };
  }

  const adminAuth = await verifyMasterAdminRequest(req);
  if (!adminAuth.authorized) {
    return {
      authorized: false,
      status: adminAuth.status,
      error:
        adminAuth.status === 403
          ? 'Akses Ditolak: Kakitangan biasa tidak dibenarkan menjalankan arkib automatik pentadbir.'
          : adminAuth.error || 'Pengesahan diperlukan untuk menjalankan arkib automatik.',
    };
  }

  return {
    authorized: true,
    status: 200,
    actor: adminAuth.email || 'master-admin',
    mode: 'master_admin',
  };
}

function getSafeErrorMeta(err: unknown): { code: string; message: string } {
  const code = String((err as any)?.code || 'AUTO_ARCHIVE_TX_ERROR').slice(0, 64);
  const rawMsg = String((err as any)?.message || err || 'Transaction error')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 180);
  return { code, message: rawMsg };
}

function incrementSkipReason(map: Record<string, number>, reason: string): void {
  map[reason] = (map[reason] || 0) + 1;
}

/**
 * Runs the idempotent, bounded, transactional Deadline Hub auto-archive pass.
 */
export async function runDeadlineAutoArchive(
  options: AutoArchiveRunOptions = {}
): Promise<AutoArchiveRunSummary> {
  const db = options.firestore || getDeadlineAdminFirestore();
  const resolveNow = (): Date => {
    if (typeof options.now === 'function') return options.now();
    if (options.now instanceof Date) return options.now;
    return Timestamp.now().toDate();
  };

  const runNow = resolveNow();
  const runId = `autoarc_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const pageSize = Math.min(200, Math.max(1, Math.floor(options.pageSize ?? 100)));
  const maxScan = Math.min(2000, Math.max(1, Math.floor(options.maxScan ?? 500)));
  const maxArchivePerRun = Math.min(500, Math.max(1, Math.floor(options.maxArchivePerRun ?? 200)));
  const dryRun = Boolean(options.dryRun);
  const triggeredBy = String(options.triggeredBy || 'scheduler').trim().slice(0, 120) || 'scheduler';
  const databaseId = resolveNamedDatabaseId() || '(default)';

  const skipBreakdown: Record<string, number> = {};
  const archivedIds: string[] = [];
  const errors: Array<{ deadlineId: string; code: string; message: string }> = [];

  let totalActiveScanned = 0;
  let totalCandidatesFound = 0;
  let archivedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const candidateRefs: DocumentReference<DocumentData>[] = [];
  let cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null;

  // Bounded pagination over ACTIVE deadlines (uses built-in single-field index, zero composite indexes needed)
  while (totalActiveScanned < maxScan) {
    const remainingCapacity = maxScan - totalActiveScanned;
    const currentLimit = Math.min(pageSize, remainingCapacity);

    let query = db.collection(DEADLINES_COL).where('status', '==', 'ACTIVE').limit(currentLimit);
    if (cursorDoc) {
      query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    if (snap.empty) {
      break;
    }

    for (const docSnap of snap.docs) {
      totalActiveScanned++;
      const data = docSnap.data() as Partial<DeadlineRecord>;
      const initialCheck = evaluateAutoArchiveEligibility(
        {
          dueDate: data?.dueDate,
          dueTime: data?.dueTime,
          status: data?.status,
        },
        runNow
      );

      if (initialCheck.eligible) {
        totalCandidatesFound++;
        if (candidateRefs.length < maxArchivePerRun) {
          candidateRefs.push(docSnap.ref);
        } else {
          skippedCount++;
          incrementSkipReason(skipBreakdown, 'DEFERRED_BATCH_LIMIT');
        }
      }
    }

    cursorDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < currentLimit) {
      break;
    }
  }

  // Re-read & atomically archive each candidate inside its own Firestore transaction
  for (const deadlineRef of candidateRefs) {
    try {
      const outcome = await db.runTransaction(async (tx) => {
        const freshSnap: DocumentSnapshot<DocumentData> = await tx.get(deadlineRef);
        if (!freshSnap.exists) {
          return { status: 'skipped' as const, reason: 'DOCUMENT_NOT_FOUND' };
        }

        const freshData = (freshSnap.data() || {}) as Partial<DeadlineRecord>;

        // Step 7: Confirm stored status is still ACTIVE (skip if already ARCHIVED or INACTIVE)
        if (freshData.status !== 'ACTIVE') {
          return { status: 'skipped' as const, reason: 'STATUS_CHANGED_BEFORE_ARCHIVE' };
        }

        // Step 5 & 6: Recalculate expiry timestamp from latest document data & confirm >= 24h elapsed
        const txNow = resolveNow();
        const latestCheck = evaluateAutoArchiveEligibility(
          {
            dueDate: freshData.dueDate,
            dueTime: freshData.dueTime,
            status: freshData.status,
          },
          txNow
        );

        if (!latestCheck.eligible) {
          const skipReason =
            latestCheck.reason === 'NOT_EXPIRED_YET' || latestCheck.reason === 'WITHIN_GRACE_PERIOD'
              ? 'DEADLINE_EXTENDED_OR_WITHIN_GRACE'
              : latestCheck.reason;
          return { status: 'skipped' as const, reason: skipReason };
        }

        if (dryRun) {
          return { status: 'skipped' as const, reason: 'DRY_RUN_ELIGIBLE' };
        }

        const serverIsoNow = txNow.toISOString();
        const auditLogId = generateSafeAuditLogId();
        const auditRef = db.collection(DEADLINE_AUDIT_COL).doc(auditLogId);
        const safeTitle =
          String(freshData.title || freshSnap.id)
            .trim()
            .slice(0, 200) || freshSnap.id;

        tx.update(deadlineRef, {
          status: 'ARCHIVED',
          archivedAt: serverIsoNow,
          updatedAt: serverIsoNow,
          updatedBy: SYSTEM_AUTO_ARCHIVE_ACTOR,
        });

        const auditEntry: DeadlineAuditLog = {
          id: auditLogId,
          deadlineId: freshSnap.id,
          deadlineTitle: safeTitle,
          action: 'ARCHIVED',
          previousValues: { status: 'ACTIVE' },
          updatedValues: { status: 'ARCHIVED' },
          reason: SYSTEM_AUTO_ARCHIVE_REASON,
          performedBy: SYSTEM_AUTO_ARCHIVE_ACTOR,
          performedAt: serverIsoNow,
        };

        tx.set(auditRef, auditEntry);

        return { status: 'archived' as const, deadlineId: freshSnap.id };
      });

      if (outcome.status === 'archived') {
        archivedCount++;
        archivedIds.push(outcome.deadlineId);
      } else {
        skippedCount++;
        incrementSkipReason(skipBreakdown, outcome.reason);
      }
    } catch (err) {
      failedCount++;
      const meta = getSafeErrorMeta(err);
      errors.push({
        deadlineId: deadlineRef.id,
        code: meta.code,
        message: meta.message,
      });
    }
  }

  const summary: AutoArchiveRunSummary = {
    runId,
    executedAt: runNow.toISOString(),
    timezone: DEADLINE_TIMEZONE,
    databaseId,
    triggeredBy,
    dryRun,
    totalActiveScanned,
    totalCandidatesFound,
    archivedCount,
    skippedCount,
    failedCount,
    skipBreakdown,
    archivedIds,
    errors,
  };

  // Phase 6 safe operational summary log (no sensitive announcement content or private evidence)
  console.info(
    '[DeadlineAutoArchive]',
    JSON.stringify({
      runId: summary.runId,
      executedAt: summary.executedAt,
      databaseId: summary.databaseId,
      triggeredBy: summary.triggeredBy,
      dryRun: summary.dryRun,
      totalActiveScanned: summary.totalActiveScanned,
      totalCandidatesFound: summary.totalCandidatesFound,
      archivedCount: summary.archivedCount,
      skippedCount: summary.skippedCount,
      failedCount: summary.failedCount,
      skipBreakdown: summary.skipBreakdown,
      errorCodes: summary.errors.map((e) => ({ id: e.deadlineId, code: e.code })),
    })
  );

  return summary;
}

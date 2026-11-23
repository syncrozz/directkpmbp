/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — DEADLINE HUB TIMEZONE, STATUS, VALIDATION & DUPLICATE ENGINE
 * Authoritative Timezone: Asia/Kuala_Lumpur (UTC+8)
 */

import type {
  DeadlineCategory,
  DeadlineComputedStatus,
  DeadlineDraft,
  DeadlineDuplicateMatch,
  DeadlineRecord,
  DeadlineStoredStatus,
} from '../types.ts';

export const DEADLINE_TIMEZONE = 'Asia/Kuala_Lumpur' as const;

export const DEADLINE_CATEGORIES: DeadlineCategory[] = [
  'Akademik',
  'HEA',
  'HEP',
  'Pengurusan',
  'Pentadbiran',
  'Penilaian',
  'Pencalonan',
  'Dokumentasi',
  'Other',
];

export const VALID_DEADLINE_CATEGORY_SET = new Set<string>(DEADLINE_CATEGORIES);

const KL_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: DEADLINE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const KL_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DEADLINE_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const KL_DISPLAY_DATE_FORMATTER = new Intl.DateTimeFormat('ms-MY', {
  timeZone: DEADLINE_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const KL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('ms-MY', {
  timeZone: DEADLINE_TIMEZONE,
  weekday: 'short',
});

/**
 * Returns today's date string in Asia/Kuala_Lumpur as YYYY-MM-DD.
 */
export function getKualaLumpurTodayDateStr(now: Date = new Date()): string {
  return KL_DATE_FORMATTER.format(now);
}

/**
 * Returns current time parts in Asia/Kuala_Lumpur.
 */
export function getKualaLumpurNowParts(now: Date = new Date()): {
  dateStr: string;
  timeStr: string;
} {
  return {
    dateStr: KL_DATE_FORMATTER.format(now),
    timeStr: KL_TIME_FORMATTER.format(now),
  };
}

/**
 * Validates strict YYYY-MM-DD calendar date.
 */
export function isValidIsoDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Validates strict 24-hour HH:mm time string.
 */
export function isValid24HourTime(timeStr?: string | null): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  return Boolean(match);
}

/**
 * Converts a YYYY-MM-DD date + optional HH:mm time in Asia/Kuala_Lumpur (+08:00) into epoch ms.
 * Date-only records use the end-of-day boundary (23:59:59+08:00) without mutating stored dueTime.
 */
export function getKualaLumpurTimestampMs(
  dueDate?: string | null,
  dueTime?: string | null
): number | null {
  if (!isValidIsoDate(dueDate)) return null;
  const cleanDate = dueDate!.trim();
  const cleanTime = (dueTime || '').trim();
  if (cleanTime) {
    if (!isValid24HourTime(cleanTime)) return null;
    const ms = new Date(`${cleanDate}T${cleanTime}:00+08:00`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const endOfDayMs = new Date(`${cleanDate}T23:59:59+08:00`).getTime();
  return Number.isFinite(endOfDayMs) ? endOfDayMs : null;
}

/**
 * Computes authoritative deadline status dynamically in Asia/Kuala_Lumpur timezone.
 */
export function computeDeadlineStatus(
  record: {
    dueDate?: string;
    dueTime?: string;
    status?: DeadlineStoredStatus;
  },
  now: Date = new Date()
): DeadlineComputedStatus {
  if (record.status === 'ARCHIVED') return 'ARCHIVED';
  if (record.status === 'INACTIVE') return 'INACTIVE';

  const targetMs = getKualaLumpurTimestampMs(record.dueDate, record.dueTime);
  if (targetMs === null) return 'INACTIVE';

  const nowMs = now.getTime();
  if (nowMs > targetMs) {
    return 'EXPIRED';
  }

  const klToday = getKualaLumpurTodayDateStr(now);
  if (record.dueDate!.trim() === klToday) {
    return 'DUE_TODAY';
  }

  return 'UPCOMING';
}

export const AUTO_ARCHIVE_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 complete hours
export const SYSTEM_AUTO_ARCHIVE_ACTOR = 'system:auto-archive';
export const SYSTEM_AUTO_ARCHIVE_REASON = 'Auto-archived after 24-hour grace period';

export type AutoArchiveIneligibilityReason =
  | 'NOT_ACTIVE'
  | 'INVALID_DEADLINE_DATETIME'
  | 'NOT_EXPIRED_YET'
  | 'WITHIN_GRACE_PERIOD';

export interface AutoArchiveEligibilityResult {
  eligible: boolean;
  reason: 'ELIGIBLE_GRACE_ELAPSED' | AutoArchiveIneligibilityReason;
  expiryTimestampMs: number | null;
  archiveEligibleAtMs: number | null;
  elapsedSinceExpiryMs: number | null;
}

/**
 * Evaluates whether a deadline record is eligible for automatic archiving
 * strictly after 24 complete hours (86,400,000 ms) have elapsed from its actual
 * Asia/Kuala_Lumpur expiry timestamp (23:59:59+08:00 for date-only records, or exact HH:mm:00+08:00).
 */
export function evaluateAutoArchiveEligibility(
  record: {
    dueDate?: string;
    dueTime?: string;
    status?: DeadlineStoredStatus;
  },
  now: Date = new Date()
): AutoArchiveEligibilityResult {
  if (record.status !== 'ACTIVE') {
    return {
      eligible: false,
      reason: 'NOT_ACTIVE',
      expiryTimestampMs: getKualaLumpurTimestampMs(record.dueDate, record.dueTime),
      archiveEligibleAtMs: null,
      elapsedSinceExpiryMs: null,
    };
  }

  const expiryTimestampMs = getKualaLumpurTimestampMs(record.dueDate, record.dueTime);
  if (expiryTimestampMs === null) {
    return {
      eligible: false,
      reason: 'INVALID_DEADLINE_DATETIME',
      expiryTimestampMs: null,
      archiveEligibleAtMs: null,
      elapsedSinceExpiryMs: null,
    };
  }

  const archiveEligibleAtMs = expiryTimestampMs + AUTO_ARCHIVE_GRACE_PERIOD_MS;
  const elapsedSinceExpiryMs = now.getTime() - expiryTimestampMs;

  if (elapsedSinceExpiryMs <= 0) {
    return {
      eligible: false,
      reason: 'NOT_EXPIRED_YET',
      expiryTimestampMs,
      archiveEligibleAtMs,
      elapsedSinceExpiryMs,
    };
  }

  if (elapsedSinceExpiryMs < AUTO_ARCHIVE_GRACE_PERIOD_MS) {
    return {
      eligible: false,
      reason: 'WITHIN_GRACE_PERIOD',
      expiryTimestampMs,
      archiveEligibleAtMs,
      elapsedSinceExpiryMs,
    };
  }

  return {
    eligible: true,
    reason: 'ELIGIBLE_GRACE_ELAPSED',
    expiryTimestampMs,
    archiveEligibleAtMs,
    elapsedSinceExpiryMs,
  };
}

/**
 * Formats remaining time / countdown in Malay cleanly using Asia/Kuala_Lumpur boundaries.
 */
export function formatDeadlineCountdown(
  dueDate?: string,
  dueTime?: string,
  storedStatus: DeadlineStoredStatus = 'ACTIVE',
  now: Date = new Date()
): string {
  const computed = computeDeadlineStatus({ dueDate, dueTime, status: storedStatus }, now);
  if (computed === 'ARCHIVED') return 'Diarkibkan';
  if (computed === 'INACTIVE') return 'Tidak Aktif';

  const targetMs = getKualaLumpurTimestampMs(dueDate, dueTime);
  if (targetMs === null) return 'Tarikh tidak sah';

  const diffMs = targetMs - now.getTime();
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.floor(absMs / 60000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  const remMinutes = totalMinutes % 60;

  if (computed === 'EXPIRED') {
    if (totalDays >= 1) return `Tamat ${totalDays} hari lepas`;
    if (totalHours >= 1) return `Tamat ${totalHours}j lepas`;
    return `Tamat ${Math.max(1, remMinutes)}m lepas`;
  }

  if (computed === 'DUE_TODAY') {
    if (totalHours >= 1) {
      return remMinutes > 0
        ? `Hari ini • ${totalHours}j ${remMinutes}m lagi`
        : `Hari ini • ${totalHours} jam lagi`;
    }
    return `Hari ini • ${Math.max(1, remMinutes)} minit lagi`;
  }

  // UPCOMING
  const klToday = getKualaLumpurTodayDateStr(now);
  const todayMidnightMs = new Date(`${klToday}T00:00:00+08:00`).getTime();
  const dueMidnightMs = new Date(`${dueDate!.trim()}T00:00:00+08:00`).getTime();
  const calendarDaysDiff = Math.round((dueMidnightMs - todayMidnightMs) / 86400000);

  if (calendarDaysDiff === 1) {
    return dueTime?.trim()
      ? `Esok • ${totalHours}j ${remMinutes}m lagi`
      : 'Esok';
  }
  if (totalDays >= 1) {
    return remHours > 0 ? `${totalDays} hari ${remHours}j lagi` : `${totalDays} hari lagi`;
  }
  return `${Math.max(1, totalHours)}j ${remMinutes}m lagi`;
}

/**
 * Formats 24h HH:mm into readable 12h/24h time string (e.g. "12:00 PM") or "Sepanjang Hari".
 */
export function formatDueTimeDisplay(dueTime?: string): string {
  const clean = (dueTime || '').trim();
  if (!clean || !isValid24HourTime(clean)) return 'Sepanjang Hari (11:59 PM)';
  const [hhStr, mmStr] = clean.split(':');
  const hh = Number(hhStr);
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mmStr} ${suffix}`;
}

/**
 * Formats YYYY-MM-DD in readable Malaysian format under Asia/Kuala_Lumpur.
 */
export function formatDueDateDisplay(dueDate?: string): string {
  if (!isValidIsoDate(dueDate)) return 'Tarikh tidak ditetapkan';
  const probe = new Date(`${dueDate!.trim()}T12:00:00+08:00`);
  const weekday = KL_WEEKDAY_FORMATTER.format(probe);
  const datePart = KL_DISPLAY_DATE_FORMATTER.format(probe);
  return `${weekday}, ${datePart}`;
}

const KL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('ms-MY', {
  timeZone: DEADLINE_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Parses an ISO/timestamp string safely into epoch milliseconds, or null if unavailable.
 */
export function parseTimestampMs(isoStr?: string | null): number | null {
  if (!isoStr || typeof isoStr !== 'string') return null;
  const trimmed = isoStr.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Resolves the original publication timestamp without inventing missing values.
 * Handles historical records where an AI update previously bumped publishedAt to updatedAt.
 */
export function getOriginalPublishedAt(record: {
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}): string {
  const pubMs = parseTimestampMs(record.publishedAt);
  const createdMs = parseTimestampMs(record.createdAt);
  const updatedMs = parseTimestampMs(record.updatedAt);

  if (
    pubMs !== null &&
    createdMs !== null &&
    updatedMs !== null &&
    record.publishedAt === record.updatedAt &&
    updatedMs - createdMs > 1000
  ) {
    return record.createdAt || '';
  }

  if (pubMs !== null) return record.publishedAt || '';
  if (createdMs !== null) return record.createdAt || '';
  return '';
}

/**
 * Determines whether a published announcement has been meaningfully modified after publication.
 */
export function isDeadlineUpdated(record: {
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}): boolean {
  const updatedMs = parseTimestampMs(record.updatedAt);
  const originalPubMs = parseTimestampMs(getOriginalPublishedAt(record));
  if (updatedMs === null || originalPubMs === null) return false;
  return updatedMs - originalPubMs > 1000;
}

/**
 * Formats an ISO timestamp as a concise date in Asia/Kuala_Lumpur (e.g. "22 Nov 2026").
 * Returns empty string if the field is unavailable (never fabricates a value).
 */
export function formatKLDateDisplay(isoStr?: string | null): string {
  const ms = parseTimestampMs(isoStr);
  if (ms === null) return '';
  return KL_DISPLAY_DATE_FORMATTER.format(new Date(ms));
}

/**
 * Formats an ISO timestamp as date + time in Asia/Kuala_Lumpur (e.g. "22 Nov 2026, 3:45 PM").
 * Returns empty string if the field is unavailable (never fabricates a value).
 */
export function formatKLDateTimeDisplay(isoStr?: string | null): string {
  const ms = parseTimestampMs(isoStr);
  if (ms === null) return '';
  return KL_DATE_TIME_FORMATTER.format(new Date(ms));
}

export interface DeadlineValidationResult {
  valid: boolean;
  errors: string[];
  fieldErrors: Record<string, string>;
}

/**
 * Validates a deadline draft or record before Admin approval / publication.
 */
export function validateDeadlineCandidate(candidate: {
  title?: string;
  dueDate?: string;
  dueTime?: string;
  actionUrl?: string;
  category?: string;
  requiredAction?: string;
  resolutionAction?: 'create' | 'update_existing' | 'ignore';
  targetExistingDeadlineId?: string;
  ambiguousFields?: string[];
}): DeadlineValidationResult {
  const errors: string[] = [];
  const fieldErrors: Record<string, string> = {};

  if (candidate.resolutionAction === 'ignore') {
    return { valid: true, errors: [], fieldErrors: {} };
  }

  const title = (candidate.title || '').trim();
  if (!title) {
    const msg = 'Tajuk tarikh akhir wajib diisi.';
    errors.push(msg);
    fieldErrors.title = msg;
  } else if (title.length > 200) {
    const msg = 'Tajuk melebihi had 200 aksara.';
    errors.push(msg);
    fieldErrors.title = msg;
  }

  const dueDate = (candidate.dueDate || '').trim();
  if (!dueDate) {
    const msg = 'Tarikh akhir (YYYY-MM-DD) wajib diisi sebelum diterbitkan.';
    errors.push(msg);
    fieldErrors.dueDate = msg;
  } else if (!isValidIsoDate(dueDate)) {
    const msg = 'Format tarikh akhir tidak sah. Gunakan format YYYY-MM-DD.';
    errors.push(msg);
    fieldErrors.dueDate = msg;
  }

  const dueTime = (candidate.dueTime || '').trim();
  if (dueTime && !isValid24HourTime(dueTime)) {
    const msg = 'Format masa akhir tidak sah. Gunakan format 24-jam HH:mm (cth: 17:00) atau biarkan kosong.';
    errors.push(msg);
    fieldErrors.dueTime = msg;
  }

  const actionUrl = (candidate.actionUrl || '').trim();
  if (actionUrl && !/^https?:\/\/.+/i.test(actionUrl)) {
    const msg = 'Pautan tindakan mestilah URL sah bermula dengan http:// atau https://.';
    errors.push(msg);
    fieldErrors.actionUrl = msg;
  }

  if (candidate.category && !VALID_DEADLINE_CATEGORY_SET.has(candidate.category)) {
    const msg = 'Kategori tarikh akhir tidak sah.';
    errors.push(msg);
    fieldErrors.category = msg;
  }

  if (
    candidate.resolutionAction === 'update_existing' &&
    !(candidate.targetExistingDeadlineId || '').trim()
  ) {
    const msg = 'Sila pilih rekod tarikh akhir sedia ada untuk dikemas kini.';
    errors.push(msg);
    fieldErrors.targetExistingDeadlineId = msg;
  }

  if (Array.isArray(candidate.ambiguousFields) && candidate.ambiguousFields.length > 0) {
    const msg = `Maklumat samar (${candidate.ambiguousFields.join(', ')}) perlu disemak dan disahkan oleh Admin.`;
    errors.push(msg);
    fieldErrors.ambiguous = msg;
  }

  return {
    valid: errors.length === 0,
    errors,
    fieldErrors,
  };
}

/**
 * Deterministic token normalization & similarity helper for duplicate deadline detection.
 */
function tokenizeForSimilarity(text?: string | null): Set<string> {
  if (!text) return new Set();
  const stopWords = new Set([
    'dan', 'atau', 'untuk', 'bagi', 'kepada', 'daripada', 'dalam', 'yang',
    'the', 'for', 'and', 'to', 'of', 'in', 'on', 'with', 'sila', 'semua',
    'tarikh', 'akhir', 'tamat', 'pelanjutan', 'kemaskini', 'update', 'extended',
    'deadline', 'pindaan', 'makluman', 'hebahan',
  ]);
  const tokens = String(text)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeUrlForCompare(url?: string | null): string {
  if (!url) return '';
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Deterministic fallback & corroboration engine for Smart Duplicate & Update Detection.
 */
export function findBestDuplicateDeadlineMatch(
  candidate: {
    title: string;
    description?: string;
    requiredAction?: string;
    actionUrl?: string;
    dueDate?: string;
    dueTime?: string;
    targetAudience?: string[];
  },
  existingDeadlines: DeadlineRecord[]
): DeadlineDuplicateMatch | null {
  if (!existingDeadlines || existingDeadlines.length === 0) return null;

  const candTitleTokens = tokenizeForSimilarity(candidate.title);
  const candFullTokens = tokenizeForSimilarity(
    [candidate.title, candidate.description, candidate.requiredAction, ...(candidate.targetAudience || [])]
      .filter(Boolean)
      .join(' ')
  );
  const candUrl = normalizeUrlForCompare(candidate.actionUrl);

  let bestMatch: DeadlineDuplicateMatch | null = null;

  for (const existing of existingDeadlines) {
    if (existing.status === 'ARCHIVED') continue;

    const exTitleTokens = tokenizeForSimilarity(existing.title);
    const exFullTokens = tokenizeForSimilarity(
      [existing.title, existing.description, existing.requiredAction, ...(existing.targetAudience || [])]
        .filter(Boolean)
        .join(' ')
    );
    const exUrl = normalizeUrlForCompare(existing.actionUrl);

    const titleSim = jaccardSimilarity(candTitleTokens, exTitleTokens);
    const fullSim = jaccardSimilarity(candFullTokens, exFullTokens);
    const urlExact = Boolean(candUrl && exUrl && candUrl === exUrl);

    // Check strong substring containment for programme acronyms (e.g., "SKiN 2026")
    const candTitleLower = (candidate.title || '').toLowerCase();
    const exTitleLower = (existing.title || '').toLowerCase();
    const hasExactTitle = Boolean(candTitleLower && candTitleLower === exTitleLower);

    let score = Math.max(titleSim * 0.75 + fullSim * 0.25, fullSim * 0.9);
    if (urlExact) score = Math.min(1, score + 0.35);
    if (hasExactTitle) score = 1;

    const reasons: string[] = [];
    if (hasExactTitle) reasons.push('Tajuk hampir sama tepat');
    else if (titleSim >= 0.4) reasons.push(`Persamaan tajuk (${Math.round(titleSim * 100)}%)`);
    if (fullSim >= 0.35) reasons.push(`Konteks & tindakan bertindih (${Math.round(fullSim * 100)}%)`);
    if (urlExact) reasons.push('Pautan tindakan (URL) sama');

    if (score >= 0.35 || urlExact) {
      const sameDate =
        Boolean(candidate.dueDate) &&
        candidate.dueDate === existing.dueDate &&
        (candidate.dueTime || '') === (existing.dueTime || '');

      const similarityLevel: 'possible' | 'high' = score >= 0.6 || urlExact ? 'high' : 'possible';
      const recommendation: 'create_new' | 'update_existing' | 'ignore' = sameDate && score >= 0.8
        ? 'ignore'
        : 'update_existing';

      const rationale = sameDate
        ? 'Rekod tarikh akhir yang hampir sama dengan tarikh dan masa yang serupa telah wujud.'
        : `Berkemungkinan pindaan atau pelanjutan tarikh akhir bagi "${existing.title}" (${existing.dueDate}${existing.dueTime ? ` ${existing.dueTime}` : ''}).`;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          matchedExistingId: existing.id,
          matchedTitle: existing.title,
          matchedDueDate: existing.dueDate,
          matchedDueTime: existing.dueTime || '',
          matchedRequiredAction: existing.requiredAction || '',
          matchedActionUrl: existing.actionUrl || '',
          matchedTargetAudience: existing.targetAudience || [],
          similarityLevel,
          score: Number(score.toFixed(2)),
          reasons: reasons.length > 0 ? reasons : ['Padanan kata kunci program/tindakan'],
          recommendation,
          rationale,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Helper to determine if a deadline applies to a specific staff member (My Deadlines / My Department).
 */
export function matchesStaffDeadlines(
  deadline: DeadlineRecord,
  staff: {
    StaffID?: string;
    ID?: string;
    staff_id?: string;
    Bahagian?: string;
    Kategori?: string;
    Unit?: string;
    DepartmentID?: string;
    Email?: string;
  }
): { isPersonalMatch: boolean; isDepartmentMatch: boolean } {
  const staffId = String(staff.StaffID || staff.ID || staff.staff_id || '')
    .trim()
    .toUpperCase();
  const bahagian = String(staff.Bahagian || staff.Kategori || '')
    .trim()
    .toLowerCase();
  const unit = String(staff.Unit || staff.DepartmentID || '')
    .trim()
    .toLowerCase();

  const targetIds = (deadline.targetStaffIds || []).map((id) => id.trim().toUpperCase());
  const targetDepts = (deadline.targetDepartments || []).map((d) => d.trim().toLowerCase());
  const audienceText = (deadline.targetAudience || []).join(' ').toLowerCase();

  const isAllStaffAudience =
    audienceText.includes('semua staf') ||
    audienceText.includes('semua kakitangan') ||
    audienceText.includes('all staff') ||
    audienceText.includes('warga kpmbp');

  const isLecturerAudience =
    bahagian === 'akademik' &&
    (audienceText.includes('pensyarah') || audienceText.includes('lecturer'));

  const isDeptMatchByTag = targetDepts.some(
    (d) =>
      d === 'semua' ||
      d === 'all' ||
      (unit && (d === unit || d.includes(unit) || unit.includes(d))) ||
      (bahagian && (d === bahagian || d.includes(bahagian)))
  );

  const isDeptMatchByAudience = Boolean(
    (unit && audienceText.includes(unit)) ||
      (bahagian && audienceText.includes(bahagian)) ||
      isLecturerAudience ||
      isAllStaffAudience
  );

  const isDepartmentMatch = isDeptMatchByTag || isDeptMatchByAudience;
  const isPersonalMatch =
    Boolean(staffId && targetIds.includes(staffId)) || isDepartmentMatch;

  return { isPersonalMatch, isDepartmentMatch };
}

/**
 * Checks whether a draft needs review based on missing/ambiguous fields, confidence, or duplicate risk.
 */
export function evaluateDraftReviewNeed(draft: Pick<
  DeadlineDraft,
  'dueDate' | 'confidence' | 'missingFields' | 'ambiguousFields' | 'duplicateMatch'
>): boolean {
  if (!draft.dueDate || !isValidIsoDate(draft.dueDate)) return true;
  if (draft.missingFields.length > 0 || draft.ambiguousFields.length > 0) return true;
  if (draft.confidence && draft.confidence.overall < 0.75) return true;
  if (draft.duplicateMatch && draft.duplicateMatch.similarityLevel !== 'none') return true;
  return false;
}

export type DeadlineFilterTab =
  | 'all'
  | 'latest'
  | 'due_today'
  | 'upcoming'
  | 'updated'
  | 'archived'
  | 'inactive';

export type DeadlineDisplayStatus = DeadlineComputedStatus | 'ACTIVE';

export interface EnrichedDeadlineItem {
  record: DeadlineRecord;
  computedStatus: DeadlineComputedStatus;
  displayStatus: DeadlineDisplayStatus;
  originalPublishedAt: string;
  isUpdated: boolean;
}

export function resolveDeadlineDisplayStatus(
  record: Pick<DeadlineRecord, 'dueDate' | 'dueTime' | 'status'>,
  now: Date = new Date()
): { computedStatus: DeadlineComputedStatus; displayStatus: DeadlineDisplayStatus } {
  const computedStatus = computeDeadlineStatus(record, now);
  if (record.status === 'ACTIVE' && !isValidIsoDate(record.dueDate)) {
    return { computedStatus, displayStatus: 'ACTIVE' };
  }
  return { computedStatus, displayStatus: computedStatus };
}

export function filterAndSortDeadlines(params: {
  deadlines: DeadlineRecord[];
  activeFilter: DeadlineFilterTab;
  selectedCategory: 'Semua' | DeadlineCategory;
  searchQuery: string;
  isAdminMode: boolean;
  now?: Date;
}): EnrichedDeadlineItem[] {
  const now = params.now || new Date();
  const klToday = getKualaLumpurTodayDateStr(now);
  const effectiveSearch = params.searchQuery.trim().toLowerCase();

  const enriched: EnrichedDeadlineItem[] = params.deadlines.map((record) => {
    const { computedStatus, displayStatus } = resolveDeadlineDisplayStatus(record, now);
    const originalPublishedAt = getOriginalPublishedAt(record);
    const isUpdated = isDeadlineUpdated(record);
    return {
      record,
      computedStatus,
      displayStatus,
      originalPublishedAt,
      isUpdated,
    };
  });

  const filtered = enriched.filter((item) => {
    const { record, displayStatus, isUpdated } = item;

    // Enforce visibility rules: ordinary staff only view published, non-inactive records
    if (!params.isAdminMode) {
      if (!record.isPublished || displayStatus === 'INACTIVE') {
        return false;
      }
    }

    if (params.activeFilter === 'all') {
      if (displayStatus === 'ARCHIVED' || displayStatus === 'INACTIVE') return false;
    } else if (params.activeFilter === 'latest') {
      if (
        record.status !== 'ACTIVE' ||
        displayStatus === 'EXPIRED' ||
        displayStatus === 'ARCHIVED' ||
        displayStatus === 'INACTIVE'
      ) {
        return false;
      }
    } else if (params.activeFilter === 'due_today') {
      if (
        record.status !== 'ACTIVE' ||
        !isValidIsoDate(record.dueDate) ||
        record.dueDate.trim() !== klToday
      ) {
        return false;
      }
    } else if (params.activeFilter === 'upcoming') {
      if (displayStatus !== 'UPCOMING') return false;
    } else if (params.activeFilter === 'updated') {
      if (displayStatus === 'ARCHIVED' || displayStatus === 'INACTIVE') return false;
      if (!isUpdated) return false;
    } else if (params.activeFilter === 'archived') {
      if (displayStatus !== 'ARCHIVED') return false;
    } else if (params.activeFilter === 'inactive') {
      if (!params.isAdminMode || displayStatus !== 'INACTIVE') return false;
    }

    if (params.selectedCategory !== 'Semua' && record.category !== params.selectedCategory) {
      return false;
    }

    if (effectiveSearch) {
      const haystack = [
        record.title,
        record.description,
        record.requiredAction,
        record.instructions,
        record.category,
        record.actionLabel,
        ...(record.targetAudience || []),
        ...(record.targetDepartments || []),
        ...(record.targetStaffIds || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(effectiveSearch)) {
        return false;
      }
    }

    return true;
  });

  if (params.activeFilter === 'latest') {
    return filtered.sort((a, b) => {
      const pubA = parseTimestampMs(a.originalPublishedAt) ?? 0;
      const pubB = parseTimestampMs(b.originalPublishedAt) ?? 0;
      if (pubB !== pubA) return pubB - pubA;
      return (a.record.dueDate || '9999-12-31').localeCompare(b.record.dueDate || '9999-12-31');
    });
  }

  if (params.activeFilter === 'updated') {
    return filtered.sort((a, b) => {
      const updA = parseTimestampMs(a.record.updatedAt) ?? 0;
      const updB = parseTimestampMs(b.record.updatedAt) ?? 0;
      if (updB !== updA) return updB - updA;
      return (a.record.dueDate || '9999-12-31').localeCompare(b.record.dueDate || '9999-12-31');
    });
  }

  if (params.activeFilter === 'upcoming') {
    return filtered.sort((a, b) => {
      const dc = (a.record.dueDate || '9999-12-31').localeCompare(
        b.record.dueDate || '9999-12-31'
      );
      if (dc !== 0) return dc;
      return (a.record.dueTime || '23:59').localeCompare(b.record.dueTime || '23:59');
    });
  }

  if (params.activeFilter === 'archived' || params.activeFilter === 'inactive') {
    return filtered.sort((a, b) => {
      const tsA = parseTimestampMs(a.record.archivedAt || a.record.updatedAt) ?? 0;
      const tsB = parseTimestampMs(b.record.archivedAt || b.record.updatedAt) ?? 0;
      if (tsB !== tsA) return tsB - tsA;
      return (b.record.dueDate || '').localeCompare(a.record.dueDate || '');
    });
  }

  // 'all' and 'due_today': DUE_TODAY first, then UPCOMING/ACTIVE chronologically, then EXPIRED descending
  const priorityWeight: Record<DeadlineDisplayStatus, number> = {
    DUE_TODAY: 1,
    UPCOMING: 2,
    ACTIVE: 2,
    EXPIRED: 3,
    INACTIVE: 4,
    ARCHIVED: 5,
  };

  return filtered.sort((a, b) => {
    const pw = priorityWeight[a.displayStatus] - priorityWeight[b.displayStatus];
    if (pw !== 0) return pw;
    if (a.displayStatus === 'EXPIRED') {
      const dc = (b.record.dueDate || '').localeCompare(a.record.dueDate || '');
      if (dc !== 0) return dc;
      return (b.record.dueTime || '23:59').localeCompare(a.record.dueTime || '23:59');
    }
    const dc = (a.record.dueDate || '9999-12-31').localeCompare(b.record.dueDate || '9999-12-31');
    if (dc !== 0) return dc;
    return (a.record.dueTime || '23:59').localeCompare(b.record.dueTime || '23:59');
  });
}

export interface DeadlineShareTarget {
  isShortRoute: boolean;
  isLegacyQuery: boolean;
  deadlineId: string | null;
  isInvalid: boolean;
}

const VALID_SHARE_ID_REGEX = /^[a-zA-Z0-9_.-]{1,128}$/;

function decodeShareSegment(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function isValidDeadlineShareId(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!VALID_SHARE_ID_REGEX.test(trimmed)) return false;
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) return false;
  return true;
}

export function buildDeadlineSharePath(deadlineId: string): string {
  return `/d/${encodeURIComponent(deadlineId.trim())}`;
}

export function extractDeadlineShareTarget(
  pathname: string = '',
  search: string = '',
  hash: string = ''
): DeadlineShareTarget {
  const cleanPath = (pathname || '').replace(/^\/+|\/+$/g, '').trim();
  const cleanHash = (hash || '').replace(/^#\/?/, '').trim();

  const hashParts = cleanHash.split('?');
  const hashPath = (hashParts[0] || '').replace(/^\/+|\/+$/g, '').trim();
  const hashSearch = hashParts[1] ? `?${hashParts[1]}` : '';

  const effectivePath = cleanPath && cleanPath !== 'index.html' ? cleanPath : hashPath;
  const lowerPath = effectivePath.toLowerCase();

  // 1. Canonical short route: /d/{deadlineId}
  if (lowerPath === 'd' || lowerPath.startsWith('d/')) {
    const sub = effectivePath.slice(1).replace(/^\/+/, '');
    if (!sub) {
      return { isShortRoute: true, isLegacyQuery: false, deadlineId: null, isInvalid: false };
    }
    if (sub.includes('/')) {
      return { isShortRoute: true, isLegacyQuery: false, deadlineId: null, isInvalid: true };
    }
    const decoded = decodeShareSegment(sub);
    if (!isValidDeadlineShareId(decoded)) {
      return { isShortRoute: true, isLegacyQuery: false, deadlineId: null, isInvalid: true };
    }
    return { isShortRoute: true, isLegacyQuery: false, deadlineId: decoded, isInvalid: false };
  }

  // 2. Legacy query format: /deadline?deadline={deadlineId}
  const effectiveSearch = search || hashSearch;
  if (effectiveSearch) {
    const params = new URLSearchParams(effectiveSearch);
    if (params.has('deadline')) {
      const rawParam = decodeShareSegment(params.get('deadline') || '');
      if (!rawParam) {
        return { isShortRoute: false, isLegacyQuery: true, deadlineId: null, isInvalid: false };
      }
      if (!isValidDeadlineShareId(rawParam)) {
        return { isShortRoute: false, isLegacyQuery: true, deadlineId: null, isInvalid: true };
      }
      return { isShortRoute: false, isLegacyQuery: true, deadlineId: rawParam, isInvalid: false };
    }
  }

  return { isShortRoute: false, isLegacyQuery: false, deadlineId: null, isInvalid: false };
}

export interface TitleEmphasisSegment {
  text: string;
  emphasized: boolean;
}

function stripTrailingPunctAndSpace(str: string): string {
  return str.trim().replace(/[\s.,;:!?]+$/g, '');
}

/**
 * Sanitizes candidate titleEmphasis phrases against the exact announcement title.
 * Rules:
 * - Preserves only non-empty phrases that exist verbatim inside `title`.
 * - Rejects phrases that cover the entire title so the whole title is never bolded.
 * - Removes duplicates and subsumed substrings cleanly.
 */
export function sanitizeTitleEmphasis(
  title: string,
  phrases?: unknown,
  maxItems: number = 4
): string[] {
  if (!title || !Array.isArray(phrases)) return [];
  const normalizedTitleCore = stripTrailingPunctAndSpace(title);
  if (!normalizedTitleCore) return [];

  const exactCandidates: string[] = [];
  const seenExact = new Set<string>();

  for (const raw of phrases) {
    const clean = String(raw ?? '').trim().slice(0, 120);
    if (!clean) continue;
    if (!title.includes(clean)) continue;
    if (stripTrailingPunctAndSpace(clean) === normalizedTitleCore) continue;
    if (seenExact.has(clean)) continue;
    seenExact.add(clean);
    exactCandidates.push(clean);
  }

  // Drop candidates that are strictly contained within another longer candidate
  const filtered = exactCandidates.filter(
    (cand) => !exactCandidates.some((other) => other !== cand && other.length > cand.length && other.includes(cand))
  );

  return filtered.slice(0, maxItems);
}

/**
 * Splits `title` into ordered verbatim segments indicating which portions should be bolded.
 * Always preserves 100% of original wording and punctuation, and refuses to bold the entire title.
 */
export function splitTitleWithEmphasis(
  title: string,
  phrases?: string[] | null
): TitleEmphasisSegment[] {
  if (!title) return [];
  const validPhrases = sanitizeTitleEmphasis(title, phrases, 6);
  if (validPhrases.length === 0) {
    return [{ text: title, emphasized: false }];
  }

  // Prioritize longer phrases first so overlapping spans prefer the more specific match
  const sortedPhrases = [...validPhrases].sort((a, b) => b.length - a.length);
  const occupied = new Array<boolean>(title.length).fill(false);
  const ranges: Array<{ start: number; end: number }> = [];

  for (const phrase of sortedPhrases) {
    let searchFrom = 0;
    while (searchFrom <= title.length - phrase.length) {
      const idx = title.indexOf(phrase, searchFrom);
      if (idx === -1) break;
      const end = idx + phrase.length;
      let overlaps = false;
      for (let i = idx; i < end; i++) {
        if (occupied[i]) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        for (let i = idx; i < end; i++) {
          occupied[i] = true;
        }
        ranges.push({ start: idx, end });
      }
      searchFrom = idx + phrase.length;
    }
  }

  if (ranges.length === 0) {
    return [{ text: title, emphasized: false }];
  }

  // Never bold the entire title (at least one word/alphanumeric character must stay unemphasized)
  let hasUnboldedContent = false;
  for (let i = 0; i < title.length; i++) {
    if (!occupied[i] && /[a-zA-Z0-9\u00C0-\u024F]/.test(title[i])) {
      hasUnboldedContent = true;
      break;
    }
  }
  if (!hasUnboldedContent) {
    return [{ text: title, emphasized: false }];
  }

  ranges.sort((a, b) => a.start - b.start);

  const segments: TitleEmphasisSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push({ text: title.slice(cursor, range.start), emphasized: false });
    }
    segments.push({ text: title.slice(range.start, range.end), emphasized: true });
    cursor = range.end;
  }
  if (cursor < title.length) {
    segments.push({ text: title.slice(cursor), emphasized: false });
  }

  return segments;
}


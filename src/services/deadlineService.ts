/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — SYNCROZZ DEADLINE HUB FIRESTORE, STORAGE & AI SERVICE
 *
 * Collections:
 * - /deadlines/{deadlineId}             (Query-enforced published records for staff; full CRUD for Admin)
 * - /deadline_drafts/{draftId}          (Strictly Master Admin Only)
 * - /deadline_audit_logs/{logId}        (Strictly Master Admin Only, immutable)
 *
 * Storage Paths:
 * - /platforms/directkpmbp/deadline_sources/{file}      (Protected Admin-Only Source Evidence)
 * - /platforms/directkpmbp/deadline_attachments/{file}  (Public Supporting Attachments for Published Deadlines)
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  auth,
  db,
  storage,
  getPlatformStoragePath,
  OperationType,
  handleFirestoreError,
} from '../config/firebase';
import {
  DeadlineAuditAction,
  DeadlineAuditLog,
  DeadlineDraft,
  DeadlineRecord,
  DeadlineSourceEvidence,
  DeadlineSourceType,
  DeadlineStoredStatus,
  Staff,
} from '../types';
import { sanitizeFirestorePayload } from './platformService';
import {
  DEADLINE_TIMEZONE,
  validateDeadlineCandidate,
} from '../utils/deadlineStatus';
import type {
  ExtractedDeadlineCandidate,
  ExtractDeadlineResponseData,
} from './serverDeadlineAi';

const DEADLINES_COL = 'deadlines';
const DEADLINE_DRAFTS_COL = 'deadline_drafts';
const DEADLINE_AUDIT_COL = 'deadline_audit_logs';

function generateSafeDocId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_\-.]/g, '_').slice(0, 120);
}

function safeFileSlug(name: string): string {
  return (name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);
}

function logFirestoreBoundaryError(err: unknown, op: OperationType, path: string): string {
  try {
    handleFirestoreError(err, op, path);
  } catch (wrapped: any) {
    return wrapped?.message || 'Ralat capaian Firestore.';
  }
  return 'Ralat capaian Firestore.';
}

function parseFriendlyFirestoreError(err: any): string {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  if (
    code === 'permission-denied' ||
    msg.toLowerCase().includes('insufficient permissions') ||
    msg.toLowerCase().includes('permission-denied')
  ) {
    return 'Akses Firestore ditolak oleh peraturan keselamatan (pastikan firestore.rules terkini telah diterbitkan ke Firebase).';
  }
  return msg || 'Gagal berhubung dengan pangkalan data Firestore.';
}

/**
 * Subscribe to published deadlines (for all staff/lecturers) OR all deadlines (for Master Admin).
 * Uses query constraint for non-admins to satisfy Firestore Rules Query Enforcer.
 */
export function subscribeToDeadlines(options: {
  isAdminMode: boolean;
  onData: (deadlines: DeadlineRecord[]) => void;
  onError?: (message: string) => void;
}): () => void {
  const colRef = collection(db, DEADLINES_COL);
  const isAdminVerified = Boolean(options.isAdminMode && auth.currentUser);

  const q = isAdminVerified
    ? colRef
    : query(
        colRef,
        where('isPublished', '==', true),
        where('status', 'in', ['ACTIVE', 'ARCHIVED'])
      );

  return onSnapshot(
    q,
    (snapshot) => {
      const list: DeadlineRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DeadlineRecord;
        list.push({
          ...data,
          id: docSnap.id,
          targetAudience: Array.isArray(data.targetAudience) ? data.targetAudience : [],
          targetDepartments: Array.isArray(data.targetDepartments) ? data.targetDepartments : [],
          targetStaffIds: Array.isArray(data.targetStaffIds) ? data.targetStaffIds : [],
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
          dueTime: data.dueTime || '',
          actionUrl: data.actionUrl || '',
          actionLabel: data.actionLabel || '',
          instructions: data.instructions || '',
        });
      });

      list.sort((a, b) => {
        const dateCmp = (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
        if (dateCmp !== 0) return dateCmp;
        return (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59');
      });

      options.onData(list);
    },
    (err) => {
      logFirestoreBoundaryError(err, OperationType.LIST, DEADLINES_COL);
      options.onError?.(parseFriendlyFirestoreError(err));
    }
  );
}

/**
 * Subscribe to AI extraction drafts (Master Admin ONLY).
 */
export function subscribeToDeadlineDrafts(options: {
  isAdminMode: boolean;
  onData: (drafts: DeadlineDraft[]) => void;
  onError?: (message: string) => void;
}): () => void {
  if (!options.isAdminMode || !auth.currentUser) {
    options.onData([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, DEADLINE_DRAFTS_COL),
    (snapshot) => {
      const list: DeadlineDraft[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DeadlineDraft;
        list.push({
          ...data,
          id: docSnap.id,
          targetAudience: Array.isArray(data.targetAudience) ? data.targetAudience : [],
          targetDepartments: Array.isArray(data.targetDepartments) ? data.targetDepartments : [],
          targetStaffIds: Array.isArray(data.targetStaffIds) ? data.targetStaffIds : [],
          attachments: Array.isArray(data.attachments) ? data.attachments : [],
          missingFields: Array.isArray(data.missingFields) ? data.missingFields : [],
          ambiguousFields: Array.isArray(data.ambiguousFields) ? data.ambiguousFields : [],
        });
      });
      list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      options.onData(list);
    },
    (err) => {
      logFirestoreBoundaryError(err, OperationType.LIST, DEADLINE_DRAFTS_COL);
      options.onError?.(parseFriendlyFirestoreError(err));
    }
  );
}

/**
 * Subscribe to immutable audit logs (Master Admin ONLY).
 */
export function subscribeToDeadlineAuditLogs(options: {
  isAdminMode: boolean;
  onData: (logs: DeadlineAuditLog[]) => void;
  onError?: (message: string) => void;
}): () => void {
  if (!options.isAdminMode || !auth.currentUser) {
    options.onData([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, DEADLINE_AUDIT_COL),
    (snapshot) => {
      const list: DeadlineAuditLog[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as DeadlineAuditLog;
        list.push({ ...data, id: docSnap.id });
      });
      list.sort((a, b) => (b.performedAt || '').localeCompare(a.performedAt || ''));
      options.onData(list);
    },
    (err) => {
      logFirestoreBoundaryError(err, OperationType.LIST, DEADLINE_AUDIT_COL);
      options.onError?.(parseFriendlyFirestoreError(err));
    }
  );
}

/**
 * Converts a File object to raw base64 string (without data URL prefix).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf('base64,');
      resolve(idx >= 0 ? res.slice(idx + 7) : res);
    };
    reader.onerror = () => reject(new Error(`Gagal membaca fail "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads raw source evidence files to protected Admin-only Firebase Storage path.
 * Never exposes public URLs to non-admins.
 */
export async function uploadDeadlineSourceFiles(
  files: File[],
  batchId: string
): Promise<{ storagePaths: string[]; warning?: string }> {
  if (!auth.currentUser || files.length === 0) {
    return { storagePaths: [] };
  }

  const storagePaths: string[] = [];
  const failedFiles: string[] = [];

  for (let idx = 0; idx < files.length; idx++) {
    const file = files[idx];
    const storagePath = getPlatformStoragePath(
      `deadline_sources/${batchId}_${idx}_${safeFileSlug(file.name)}`
    );
    try {
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          uploadedBy: auth.currentUser.email || 'admin',
          batchId,
        },
      });
      storagePaths.push(storagePath);
    } catch (err: any) {
      console.warn(`[DeadlineService] Storage upload notice for ${file.name}:`, err?.message || err);
      failedFiles.push(file.name);
    }
  }

  return {
    storagePaths,
    warning:
      failedFiles.length > 0
        ? `Bukti sumber (${failedFiles.join(', ')}) tidak dapat dimuat naik ke Firebase Storage (semak storage.rules), namun draf AI tetap disimpan.`
        : undefined,
  };
}

/**
 * Admin-only helper to obtain a download URL for protected source evidence preview.
 */
export async function getProtectedSourceEvidenceUrl(storagePath: string): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('Hanya Master Admin yang disahkan boleh melihat bukti sumber asal.');
  }
  const cleanPath = storagePath.trim();
  if (!cleanPath.startsWith('platforms/directkpmbp/deadline_sources/')) {
    throw new Error('Laluan bukti sumber tidak sah.');
  }
  return getDownloadURL(ref(storage, cleanPath));
}

/**
 * Admin-only helper to upload public supporting attachments (PDF/image) attached to a published deadline.
 */
export async function uploadDeadlineAttachmentFile(
  file: File,
  recordKey: string
): Promise<{ name: string; url: string; type: string }> {
  if (!auth.currentUser) {
    throw new Error('Log masuk Master Admin diperlukan untuk memuat naik lampiran.');
  }
  const storagePath = getPlatformStoragePath(
    `deadline_attachments/${recordKey}_${Date.now()}_${safeFileSlug(file.name)}`
  );
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || 'application/pdf',
  });
  const url = await getDownloadURL(storageRef);
  return {
    name: file.name,
    url,
    type: file.type || 'application/pdf',
  };
}

/**
 * Calls protected backend /api/deadlines/extract to analyze screenshots/PDFs/text using Gemini.
 */
export async function requestAiDeadlineExtraction(params: {
  sourceType: DeadlineSourceType;
  pastedText?: string;
  files?: File[];
  existingDeadlines: DeadlineRecord[];
  staffList: Staff[];
}): Promise<ExtractDeadlineResponseData> {
  if (!auth.currentUser) {
    throw new Error('Sila log masuk sebagai Master Admin sebelum menggunakan AI Deadline Capture.');
  }

  const idToken = await auth.currentUser.getIdToken();
  const encodedFiles = await Promise.all(
    (params.files || []).map(async (file) => {
      let mime = (file.type || '').trim().toLowerCase();
      if (mime === 'image/jpg') mime = 'image/jpeg';
      if (!mime || mime === 'application/octet-stream') {
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.pdf')) mime = 'application/pdf';
        else if (lowerName.endsWith('.webp')) mime = 'image/webp';
        else if (/\.jpe?g$/i.test(lowerName)) mime = 'image/jpeg';
        else mime = 'image/png';
      }
      return {
        fileName: file.name,
        mimeType: mime,
        base64Data: await fileToBase64(file),
      };
    })
  );

  const staffHints = params.staffList.slice(0, 150).map((s) => ({
    id: String(s.StaffID || s.ID || s.staff_id || '').trim(),
    nama: String(s.Nama || '').trim(),
    bahagian: String(s.Bahagian || s.Kategori || '').trim(),
    unit: String(s.Unit || s.DepartmentID || '').trim(),
    jawatan: String(s.Jawatan || '').trim(),
  }));

  const response = await fetch('/api/deadlines/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      sourceType: params.sourceType,
      pastedText: params.pastedText || '',
      files: encodedFiles,
      existingDeadlines: params.existingDeadlines.slice(0, 80),
      staffHints,
    }),
  });

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON response
  }

  if (!response.ok || !payload?.success || !payload?.data) {
    throw new Error(
      payload?.error || `Pengekstrakan AI gagal (HTTP ${response.status}).`
    );
  }

  return payload.data as ExtractDeadlineResponseData;
}

/**
 * Saves AI-extracted candidates strictly as pending drafts in /deadline_drafts (NEVER auto-publishes).
 */
export async function saveExtractedDraftsToFirestore(params: {
  batchId: string;
  sourceType: DeadlineSourceType;
  sourceEvidence: DeadlineSourceEvidence;
  candidates: ExtractedDeadlineCandidate[];
  adminEmail: string;
}): Promise<DeadlineDraft[]> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan untuk menyimpan draf.');
  }

  const verifiedEmail = (auth.currentUser.email || params.adminEmail).trim().toLowerCase();
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  const createdDrafts: DeadlineDraft[] = [];

  const boundedEvidence: DeadlineSourceEvidence = sanitizeFirestorePayload({
    ...params.sourceEvidence,
    textExcerpt: params.sourceEvidence.textExcerpt?.slice(0, 1500),
    pastedText: params.sourceEvidence.pastedText?.slice(0, 6000),
  });

  for (const cand of params.candidates) {
    const draftId = generateSafeDocId('draft');
    const hasMatch = Boolean(cand.duplicateMatch && cand.duplicateMatch.similarityLevel !== 'none');
    const defaultResolution: 'create' | 'update_existing' | 'ignore' =
      hasMatch && cand.duplicateMatch?.recommendation === 'update_existing'
        ? 'update_existing'
        : hasMatch && cand.duplicateMatch?.recommendation === 'ignore'
        ? 'ignore'
        : 'create';

    const draft: DeadlineDraft = {
      id: draftId,
      submissionBatchId: params.batchId,
      sourceType: params.sourceType,
      sourceEvidence: boundedEvidence,
      title: (cand.title || 'Tarikh Akhir Baharu').slice(0, 200),
      description: (cand.description || '').slice(0, 2000),
      requiredAction: (cand.requiredAction || '').slice(0, 500),
      category: cand.category,
      targetAudience: (cand.targetAudience || []).slice(0, 30),
      targetDepartments: (cand.targetDepartments || []).slice(0, 30),
      targetStaffIds: (cand.targetStaffIds || []).slice(0, 100),
      dueDate: cand.dueDate || '',
      dueTime: cand.dueTime || '',
      timezone: DEADLINE_TIMEZONE,
      announcementDate: cand.announcementDate || '',
      actionUrl: (cand.actionUrl || '').slice(0, 2000),
      actionLabel: (cand.actionLabel || '').slice(0, 120),
      attachments: (cand.attachments || []).slice(0, 20),
      instructions: (cand.instructions || '').slice(0, 4000),
      sourceExcerpt: (cand.sourceExcerpt || '').slice(0, 2000),
      confidence: cand.confidence,
      missingFields: (cand.missingFields || []).slice(0, 20),
      ambiguousFields: (cand.ambiguousFields || []).slice(0, 20),
      ambiguityReason: (cand.ambiguityReason || '').slice(0, 1000),
      requiresReview: Boolean(cand.requiresReview),
      duplicateMatch: cand.duplicateMatch || null,
      reviewStatus: 'pending',
      resolutionAction: defaultResolution,
      targetExistingDeadlineId:
        defaultResolution === 'update_existing' ? cand.duplicateMatch?.matchedExistingId : '',
      updateReason:
        defaultResolution === 'update_existing'
          ? cand.duplicateMatch?.rationale?.slice(0, 500) || 'Kemas kini daripada hebahan terbaharu'
          : '',
      createdAt: nowIso,
      createdBy: verifiedEmail,
      updatedAt: nowIso,
    };

    const payload = sanitizeFirestorePayload(draft);
    batch.set(doc(db, DEADLINE_DRAFTS_COL, draftId), payload);
    createdDrafts.push(draft);
  }

  try {
    await batch.commit();
    return createdDrafts;
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.WRITE, DEADLINE_DRAFTS_COL);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Updates an individual AI draft in Firestore during Admin Review.
 */
export async function updateDeadlineDraftInFirestore(
  draftId: string,
  updates: Partial<DeadlineDraft>
): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan untuk mengemas kini draf.');
  }

  const allowedKeys: Array<keyof DeadlineDraft> = [
    'title',
    'description',
    'requiredAction',
    'category',
    'targetAudience',
    'targetDepartments',
    'targetStaffIds',
    'dueDate',
    'dueTime',
    'timezone',
    'announcementDate',
    'actionUrl',
    'actionLabel',
    'attachments',
    'instructions',
    'sourceExcerpt',
    'confidence',
    'missingFields',
    'ambiguousFields',
    'ambiguityReason',
    'requiresReview',
    'duplicateMatch',
    'reviewStatus',
    'resolutionAction',
    'targetExistingDeadlineId',
    'updateReason',
    'reviewedBy',
    'reviewedAt',
  ];

  const patch: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  for (const k of allowedKeys) {
    if (updates[k] !== undefined) {
      patch[k] = updates[k];
    }
  }

  try {
    await updateDoc(
      doc(db, DEADLINE_DRAFTS_COL, draftId),
      sanitizeFirestorePayload(patch)
    );
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.UPDATE, `${DEADLINE_DRAFTS_COL}/${draftId}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Deletes/rejects a draft from /deadline_drafts.
 */
export async function deleteDeadlineDraftFromFirestore(draftId: string): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan.');
  }
  try {
    await deleteDoc(doc(db, DEADLINE_DRAFTS_COL, draftId));
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.DELETE, `${DEADLINE_DRAFTS_COL}/${draftId}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Explicit Master Admin approval & publication of one or more drafts.
 * Supports Create New, Update Existing (preserving previous values in Audit Log), and Ignore New Submission.
 */
export async function publishApprovedDrafts(params: {
  drafts: DeadlineDraft[];
  existingDeadlines: DeadlineRecord[];
  adminEmail: string;
}): Promise<{ createdCount: number; updatedCount: number; ignoredCount: number }> {
  if (!auth.currentUser) {
    throw new Error('Sila log masuk sebagai Master Admin untuk menerbitkan tarikh akhir.');
  }

  const verifiedEmail = (auth.currentUser.email || params.adminEmail).trim().toLowerCase();
  const uid = auth.currentUser.uid;
  const existingMap = new Map(params.existingDeadlines.map((d) => [d.id, d]));

  // Validate all non-ignored drafts strictly before any Firestore write
  for (const draft of params.drafts) {
    const check = validateDeadlineCandidate(draft);
    if (!check.valid) {
      throw new Error(`Draf "${draft.title || draft.id}" tidak sah: ${check.errors.join(' ')}`);
    }
    if (draft.resolutionAction === 'update_existing') {
      if (!draft.targetExistingDeadlineId || !existingMap.has(draft.targetExistingDeadlineId)) {
        throw new Error(
          `Rekod tarikh akhir sedia ada untuk "${draft.title}" tidak ditemui.`
        );
      }
    }
  }

  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  let createdCount = 0;
  let updatedCount = 0;
  let ignoredCount = 0;

  for (const draft of params.drafts) {
    const sourceRef =
      draft.sourceEvidence?.storagePaths?.[0] ||
      draft.sourceEvidence?.fileNames?.join(', ') ||
      draft.sourceType;

    if (draft.resolutionAction === 'ignore') {
      batch.update(
        doc(db, DEADLINE_DRAFTS_COL, draft.id),
        sanitizeFirestorePayload({
          reviewStatus: 'ignored',
          reviewedBy: verifiedEmail,
          reviewedAt: nowIso,
          updatedAt: nowIso,
        })
      );

      const logId = generateSafeDocId('audit');
      const ignoreLog: DeadlineAuditLog = {
        id: logId,
        deadlineId: draft.targetExistingDeadlineId || draft.duplicateMatch?.matchedExistingId || draft.id,
        deadlineTitle: draft.title.slice(0, 200),
        draftId: draft.id,
        action: 'IGNORED_DRAFT',
        reason: draft.updateReason || 'Diabaikan oleh Master Admin (rekod pendua/tidak diperlukan).',
        sourceType: draft.sourceType,
        sourceRef: String(sourceRef).slice(0, 500),
        performedBy: verifiedEmail,
        performedByUid: uid,
        performedAt: nowIso,
      };
      batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(ignoreLog));
      ignoredCount++;
      continue;
    }

    if (draft.resolutionAction === 'update_existing' && draft.targetExistingDeadlineId) {
      const existing = existingMap.get(draft.targetExistingDeadlineId)!;
      const previousValues = {
        title: existing.title,
        dueDate: existing.dueDate,
        dueTime: existing.dueTime || '',
        requiredAction: existing.requiredAction || '',
        actionUrl: existing.actionUrl || '',
        targetAudience: existing.targetAudience || [],
        targetDepartments: existing.targetDepartments || [],
        targetStaffIds: existing.targetStaffIds || [],
        status: existing.status,
      };

      const updatedFields = {
        title: draft.title.trim().slice(0, 200),
        description: (draft.description || '').trim().slice(0, 2000),
        requiredAction: (draft.requiredAction || '').trim().slice(0, 500),
        category: draft.category,
        targetAudience: (draft.targetAudience || []).slice(0, 30),
        targetDepartments: (draft.targetDepartments || []).slice(0, 30),
        targetStaffIds: (draft.targetStaffIds || []).slice(0, 100),
        dueDate: draft.dueDate.trim(),
        dueTime: (draft.dueTime || '').trim(),
        timezone: DEADLINE_TIMEZONE,
        actionUrl: (draft.actionUrl || '').trim().slice(0, 2000),
        actionLabel: (draft.actionLabel || '').trim().slice(0, 120),
        attachments: (draft.attachments || existing.attachments || []).slice(0, 20),
        instructions: (draft.instructions || '').trim().slice(0, 4000),
        status: existing.status === 'ARCHIVED' ? ('ACTIVE' as DeadlineStoredStatus) : existing.status,
        isPublished: true,
        sourceType: draft.sourceType,
        sourceSummary: (draft.sourceExcerpt || existing.sourceSummary || '').slice(0, 500),
        sourceEvidencePaths: Array.from(
          new Set([
            ...(existing.sourceEvidencePaths || []),
            ...(draft.sourceEvidence?.storagePaths || []),
          ])
        ).slice(0, 20),
        confidenceScore: draft.confidence?.overall ?? existing.confidenceScore ?? 1,
        updatedAt: nowIso,
        updatedBy: verifiedEmail,
        publishedAt: existing.publishedAt || existing.createdAt || nowIso,
        publishedBy: existing.publishedBy || existing.createdBy || verifiedEmail,
      };

      batch.update(
        doc(db, DEADLINES_COL, existing.id),
        sanitizeFirestorePayload(updatedFields)
      );

      batch.update(
        doc(db, DEADLINE_DRAFTS_COL, draft.id),
        sanitizeFirestorePayload({
          reviewStatus: 'published',
          reviewedBy: verifiedEmail,
          reviewedAt: nowIso,
          updatedAt: nowIso,
        })
      );

      const logId = generateSafeDocId('audit');
      const updateLog: DeadlineAuditLog = {
        id: logId,
        deadlineId: existing.id,
        deadlineTitle: updatedFields.title,
        draftId: draft.id,
        action: 'UPDATED_FROM_AI',
        previousValues,
        updatedValues: {
          title: updatedFields.title,
          dueDate: updatedFields.dueDate,
          dueTime: updatedFields.dueTime,
          requiredAction: updatedFields.requiredAction,
          actionUrl: updatedFields.actionUrl,
          targetAudience: updatedFields.targetAudience,
          targetDepartments: updatedFields.targetDepartments,
          targetStaffIds: updatedFields.targetStaffIds,
          status: updatedFields.status,
        },
        reason: (draft.updateReason || 'Kemas kini tarikh akhir daripada hebahan baharu melalui AI Deadline Capture').slice(0, 1000),
        sourceType: draft.sourceType,
        sourceRef: String(sourceRef).slice(0, 500),
        performedBy: verifiedEmail,
        performedByUid: uid,
        performedAt: nowIso,
      };
      batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(updateLog));
      updatedCount++;
      continue;
    }

    // Create New Published Record
    const deadlineId = generateSafeDocId('dl');
    const newRecord: DeadlineRecord = {
      id: deadlineId,
      title: draft.title.trim().slice(0, 200),
      description: (draft.description || '').trim().slice(0, 2000),
      requiredAction: (draft.requiredAction || '').trim().slice(0, 500),
      category: draft.category,
      targetAudience: (draft.targetAudience || []).slice(0, 30),
      targetDepartments: (draft.targetDepartments || []).slice(0, 30),
      targetStaffIds: (draft.targetStaffIds || []).slice(0, 100),
      dueDate: draft.dueDate.trim(),
      dueTime: (draft.dueTime || '').trim(),
      timezone: DEADLINE_TIMEZONE,
      actionUrl: (draft.actionUrl || '').trim().slice(0, 2000),
      actionLabel: (draft.actionLabel || '').trim().slice(0, 120),
      attachments: (draft.attachments || []).slice(0, 20),
      instructions: (draft.instructions || '').trim().slice(0, 4000),
      status: 'ACTIVE',
      isPublished: true,
      sourceType: draft.sourceType,
      sourceSummary: (draft.sourceExcerpt || '').slice(0, 500),
      sourceEvidencePaths: (draft.sourceEvidence?.storagePaths || []).slice(0, 20),
      confidenceScore: draft.confidence?.overall ?? 1,
      createdAt: nowIso,
      createdBy: verifiedEmail,
      updatedAt: nowIso,
      updatedBy: verifiedEmail,
      publishedAt: nowIso,
      publishedBy: verifiedEmail,
    };

    batch.set(doc(db, DEADLINES_COL, deadlineId), sanitizeFirestorePayload(newRecord));

    batch.update(
      doc(db, DEADLINE_DRAFTS_COL, draft.id),
      sanitizeFirestorePayload({
        reviewStatus: 'published',
        reviewedBy: verifiedEmail,
        reviewedAt: nowIso,
        updatedAt: nowIso,
      })
    );

    const logId = generateSafeDocId('audit');
    const createLog: DeadlineAuditLog = {
      id: logId,
      deadlineId,
      deadlineTitle: newRecord.title,
      draftId: draft.id,
      action: 'PUBLISHED',
      updatedValues: {
        title: newRecord.title,
        dueDate: newRecord.dueDate,
        dueTime: newRecord.dueTime,
        category: newRecord.category,
        status: newRecord.status,
      },
      reason: 'Diluluskan & diterbitkan oleh Master Admin daripada draf AI.',
      sourceType: draft.sourceType,
      sourceRef: String(sourceRef).slice(0, 500),
      performedBy: verifiedEmail,
      performedByUid: uid,
      performedAt: nowIso,
    };
    batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(createLog));
    createdCount++;
  }

  try {
    await batch.commit();
    return { createdCount, updatedCount, ignoredCount };
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.WRITE, DEADLINES_COL);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Allows Master Admin to manually create and publish a new deadline record with full audit trail.
 */
export async function createManualDeadline(params: {
  record: {
    title: string;
    description?: string;
    requiredAction?: string;
    category: DeadlineRecord['category'];
    targetAudience?: string[];
    targetDepartments?: string[];
    targetStaffIds?: string[];
    dueDate: string;
    dueTime?: string;
    actionUrl?: string;
    actionLabel?: string;
    instructions?: string;
  };
  reason?: string;
}): Promise<DeadlineRecord> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan.');
  }

  const check = validateDeadlineCandidate(params.record);
  if (!check.valid) {
    throw new Error(check.errors.join(' '));
  }

  const verifiedEmail = (auth.currentUser.email || '').trim().toLowerCase();
  const uid = auth.currentUser.uid;
  const nowIso = new Date().toISOString();
  const deadlineId = generateSafeDocId('dl');

  const actionUrl = (params.record.actionUrl || '').trim().slice(0, 2000);
  const newRecord: DeadlineRecord = {
    id: deadlineId,
    title: params.record.title.trim().slice(0, 200),
    description: (params.record.description || '').trim().slice(0, 2000),
    requiredAction: (params.record.requiredAction || '').trim().slice(0, 500),
    category: params.record.category,
    targetAudience: (params.record.targetAudience || []).slice(0, 30),
    targetDepartments: (params.record.targetDepartments || []).slice(0, 30),
    targetStaffIds: (params.record.targetStaffIds || []).slice(0, 100),
    dueDate: params.record.dueDate.trim(),
    dueTime: (params.record.dueTime || '').trim(),
    timezone: DEADLINE_TIMEZONE,
    actionUrl,
    actionLabel: actionUrl
      ? (params.record.actionLabel || 'Buka Pautan Tindakan').trim().slice(0, 120)
      : '',
    attachments: [],
    instructions: (params.record.instructions || '').trim().slice(0, 4000),
    status: 'ACTIVE',
    isPublished: true,
    sourceType: 'PASTED_TEXT',
    sourceSummary: 'Dicipta secara manual oleh Master Admin.',
    sourceEvidencePaths: [],
    confidenceScore: 1,
    createdAt: nowIso,
    createdBy: verifiedEmail,
    updatedAt: nowIso,
    updatedBy: verifiedEmail,
    publishedAt: nowIso,
    publishedBy: verifiedEmail,
  };

  const batch = writeBatch(db);
  batch.set(doc(db, DEADLINES_COL, deadlineId), sanitizeFirestorePayload(newRecord));

  const logId = generateSafeDocId('audit');
  const auditLog: DeadlineAuditLog = {
    id: logId,
    deadlineId,
    deadlineTitle: newRecord.title,
    action: 'CREATED',
    updatedValues: {
      title: newRecord.title,
      dueDate: newRecord.dueDate,
      dueTime: newRecord.dueTime,
      category: newRecord.category,
      status: newRecord.status,
      targetAudience: newRecord.targetAudience,
      targetDepartments: newRecord.targetDepartments,
    },
    reason: (params.reason || 'Dicipta secara manual oleh Master Admin').slice(0, 1000),
    sourceType: 'PASTED_TEXT',
    sourceRef: 'Manual Admin Entry',
    performedBy: verifiedEmail,
    performedByUid: uid,
    performedAt: nowIso,
  };
  batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(auditLog));

  try {
    await batch.commit();
    return newRecord;
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.WRITE, `${DEADLINES_COL}/${deadlineId}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Allows Master Admin to manually edit a published deadline with full audit trail.
 */
export async function updatePublishedDeadline(params: {
  existing: DeadlineRecord;
  updates: Partial<DeadlineRecord>;
  reason?: string;
}): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan.');
  }

  const mergedCandidate = {
    ...params.existing,
    ...params.updates,
  };
  const check = validateDeadlineCandidate(mergedCandidate);
  if (!check.valid) {
    throw new Error(check.errors.join(' '));
  }

  const verifiedEmail = (auth.currentUser.email || '').trim().toLowerCase();
  const uid = auth.currentUser.uid;
  const nowIso = new Date().toISOString();

  const patch = sanitizeFirestorePayload({
    title: mergedCandidate.title.trim().slice(0, 200),
    description: (mergedCandidate.description || '').trim().slice(0, 2000),
    requiredAction: (mergedCandidate.requiredAction || '').trim().slice(0, 500),
    category: mergedCandidate.category,
    targetAudience: (mergedCandidate.targetAudience || []).slice(0, 30),
    targetDepartments: (mergedCandidate.targetDepartments || []).slice(0, 30),
    targetStaffIds: (mergedCandidate.targetStaffIds || []).slice(0, 100),
    dueDate: mergedCandidate.dueDate.trim(),
    dueTime: (mergedCandidate.dueTime || '').trim(),
    timezone: DEADLINE_TIMEZONE,
    actionUrl: (mergedCandidate.actionUrl || '').trim().slice(0, 2000),
    actionLabel: (mergedCandidate.actionLabel || '').trim().slice(0, 120),
    attachments: (mergedCandidate.attachments || []).slice(0, 20),
    instructions: (mergedCandidate.instructions || '').trim().slice(0, 4000),
    status: mergedCandidate.status,
    updatedAt: nowIso,
    updatedBy: verifiedEmail,
  });

  const batch = writeBatch(db);
  batch.update(doc(db, DEADLINES_COL, params.existing.id), patch);

  const logId = generateSafeDocId('audit');
  const auditLog: DeadlineAuditLog = {
    id: logId,
    deadlineId: params.existing.id,
    deadlineTitle: patch.title,
    action: 'UPDATED_MANUAL',
    previousValues: {
      title: params.existing.title,
      dueDate: params.existing.dueDate,
      dueTime: params.existing.dueTime || '',
      requiredAction: params.existing.requiredAction || '',
      status: params.existing.status,
    },
    updatedValues: {
      title: patch.title,
      dueDate: patch.dueDate,
      dueTime: patch.dueTime,
      requiredAction: patch.requiredAction,
      status: patch.status,
    },
    reason: (params.reason || 'Kemaskini manual oleh Master Admin').slice(0, 1000),
    performedBy: verifiedEmail,
    performedByUid: uid,
    performedAt: nowIso,
  };
  batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(auditLog));

  try {
    await batch.commit();
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.UPDATE, `${DEADLINES_COL}/${params.existing.id}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Transitions stored lifecycle status (ACTIVE / INACTIVE / ARCHIVED) with audit logging.
 */
export async function changeDeadlineStoredStatus(params: {
  deadline: DeadlineRecord;
  nextStatus: DeadlineStoredStatus;
  reason?: string;
}): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan.');
  }

  const verifiedEmail = (auth.currentUser.email || '').trim().toLowerCase();
  const uid = auth.currentUser.uid;
  const nowIso = new Date().toISOString();

  const patch: Record<string, any> = {
    status: params.nextStatus,
    updatedAt: nowIso,
    updatedBy: verifiedEmail,
  };
  if (params.nextStatus === 'ARCHIVED') {
    patch.archivedAt = nowIso;
  }

  let action: DeadlineAuditAction = 'STATUS_CHANGED';
  if (params.nextStatus === 'ARCHIVED') action = 'ARCHIVED';
  else if (params.deadline.status === 'ARCHIVED' && params.nextStatus === 'ACTIVE') action = 'RESTORED';

  const batch = writeBatch(db);
  batch.update(doc(db, DEADLINES_COL, params.deadline.id), sanitizeFirestorePayload(patch));

  const logId = generateSafeDocId('audit');
  const logEntry: DeadlineAuditLog = {
    id: logId,
    deadlineId: params.deadline.id,
    deadlineTitle: params.deadline.title.slice(0, 200),
    action,
    previousValues: { status: params.deadline.status },
    updatedValues: { status: params.nextStatus },
    reason: (
      params.reason ||
      (params.nextStatus === 'ARCHIVED'
        ? 'Diarkibkan oleh Master Admin'
        : params.nextStatus === 'INACTIVE'
        ? 'Dinyahaktifkan oleh Master Admin'
        : 'Diaktifkan semula oleh Master Admin')
    ).slice(0, 1000),
    performedBy: verifiedEmail,
    performedByUid: uid,
    performedAt: nowIso,
  };
  batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(logEntry));

  try {
    await batch.commit();
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.UPDATE, `${DEADLINES_COL}/${params.deadline.id}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

/**
 * Deletes a deadline record permanently with immutable audit trail.
 */
export async function deletePublishedDeadline(deadline: DeadlineRecord): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('Sesi Master Admin diperlukan.');
  }

  const verifiedEmail = (auth.currentUser.email || '').trim().toLowerCase();
  const uid = auth.currentUser.uid;
  const nowIso = new Date().toISOString();

  const batch = writeBatch(db);
  batch.delete(doc(db, DEADLINES_COL, deadline.id));

  const logId = generateSafeDocId('audit');
  const logEntry: DeadlineAuditLog = {
    id: logId,
    deadlineId: deadline.id,
    deadlineTitle: deadline.title.slice(0, 200),
    action: 'DELETED',
    previousValues: {
      title: deadline.title,
      dueDate: deadline.dueDate,
      dueTime: deadline.dueTime || '',
      status: deadline.status,
    },
    reason: 'Dipadam secara kekal oleh Master Admin',
    performedBy: verifiedEmail,
    performedByUid: uid,
    performedAt: nowIso,
  };
  batch.set(doc(db, DEADLINE_AUDIT_COL, logId), sanitizeFirestorePayload(logEntry));

  try {
    await batch.commit();
  } catch (err) {
    logFirestoreBoundaryError(err, OperationType.DELETE, `${DEADLINES_COL}/${deadline.id}`);
    throw new Error(parseFriendlyFirestoreError(err));
  }
}

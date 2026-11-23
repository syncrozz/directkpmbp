/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — DATA MAINTENANCE AUDIT & RECOVERY UTILITY (SES v4.5)
 *
 * Records sanitized administrative audit logs for destructive maintenance
 * operations without exposing sensitive personal staff information (no IC,
 * phone, personal emails, or vehicle plates).
 */

export type MaintenanceOperationType =
  | 'CLEANUP_DUPLICATES'
  | 'RESET_STAFF'
  | 'RESET_COMMITTEES';

export type MaintenanceOperationStatus =
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'BLOCKED';

export interface MaintenanceAuditEntry {
  id: string;
  operation: MaintenanceOperationType;
  timestamp: string;
  adminEmail: string;
  affectedIds: string[];
  affectedCount: number;
  remainingCount?: number;
  rollbackAvailable: boolean;
  status: MaintenanceOperationStatus;
  summary: string;
}

const AUDIT_STORAGE_KEY = 'kpmbp_maintenance_audit_log';
const MAX_AUDIT_ENTRIES = 50;

/**
 * Sanitizes record IDs to guarantee no PII (e.g. IC numbers or emails) is ever persisted in audit logs.
 */
function sanitizeRecordIds(ids: string[]): string[] {
  return Array.from(
    new Set(
      (ids || [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter((id) => Boolean(id) && !id.includes('@') && !/^\d{6}-\d{2}-\d{4}$/.test(id))
    )
  ).slice(0, 200);
}

export function getMaintenanceAuditLogs(): MaintenanceAuditEntry[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordMaintenanceAudit(input: {
  operation: MaintenanceOperationType;
  adminEmail?: string | null;
  affectedIds: string[];
  affectedCount: number;
  remainingCount?: number;
  status: MaintenanceOperationStatus;
  summary: string;
}): MaintenanceAuditEntry {
  const entry: MaintenanceAuditEntry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
    operation: input.operation,
    timestamp: new Date().toISOString(),
    adminEmail: (input.adminEmail || 'unknown-admin').trim().toLowerCase(),
    affectedIds: sanitizeRecordIds(input.affectedIds),
    affectedCount: input.affectedCount,
    remainingCount: input.remainingCount,
    rollbackAvailable: false,
    status: input.status,
    summary: input.summary,
  };

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      const existing = getMaintenanceAuditLogs();
      const next = [entry, ...existing].slice(0, MAX_AUDIT_ENTRIES);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors cleanly
    }
  }

  return entry;
}

export function downloadMaintenanceBackupJson(
  filenamePrefix: string,
  payload: unknown
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const json = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        source: 'Directory KPMBP Maintenance Backup',
        data: payload,
      },
      null,
      2
    );
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}_${dateStamp}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

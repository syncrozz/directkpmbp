/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Database, 
  Info, 
  FileSpreadsheet, 
  Upload, 
  X, 
  RotateCcw,
  Smartphone,
  Download,
  FileDown,
  ShieldCheck,
  Trash2,
  Mail,
  Hash,
  UserPlus,
  Link,
  Share2,
  ExternalLink,
  Send,
  Eye,
  Copy,
  RefreshCw,
  MailCheck,
  Check,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Clock
} from 'lucide-react';
import { Staff, StaffCommittee, AuthorizedAdmin } from '../types';
import {
  saveStaffListToFirestore,
  saveCommitteesToFirestore,
  cleanupLegacyJtmDuplicates,
  previewLegacyJtmDuplicates,
  CleanupPreview,
  auth
} from '../config/firebase';
import { INITIAL_STAFF_DATA } from '../data/initialStaff';
import { generateDefaultCommitteesForStaff, deduplicateCommittees } from '../utils/committeeService';
import {
  recordMaintenanceAudit,
  getMaintenanceAuditLogs,
  downloadMaintenanceBackupJson,
  MaintenanceAuditEntry
} from '../utils/maintenanceAudit';
import { MASTER_ADMIN_EMAIL } from '../utils/adminAuthService';
import { findDuplicateStaff, normalizeStaffName, normalizeStaffEmail } from '../utils/staffDeduplication';
import { formatIC } from '../utils/icFormatter';

export interface MaintenanceExecutionResult {
  ok: boolean;
  firestoreConfirmed: boolean;
  partialFailure?: boolean;
  message: string;
  affectedIds: string[];
  remainingCount: number;
}

interface SyncSettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
  isAdminMode?: boolean;
  onToggleAdminMode?: () => void;
  onImportStaffData?: (importedList: Staff[]) => void;
  onImportCommitteeData?: (importedList: StaffCommittee[]) => void;
  totalStaffCount?: number;
  totalCommitteeCount?: number;
  staffList?: Staff[];
  committeeList?: StaffCommittee[];
  adminEmail?: string;
  onApplyCleanedStaffList?: (cleanedList: Staff[]) => void;
  onResetStaffData?: () => Promise<MaintenanceExecutionResult>;
  onResetCommitteeData?: () => Promise<MaintenanceExecutionResult>;
  onInstallPWA?: () => void;
  canInstallPWA?: boolean;
  onNavigateToRegistration?: () => void;
  onOpenNavigationManager?: () => void;
}

// CSV escaping helper for proper quotes and UTF-8 handling
function escapeCSVCell(cell: any): string {
  if (cell === null || cell === undefined) return '';
  const str = String(cell).trim();
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Trigger CSV download in browser with UTF-8 BOM
function downloadCSVFile(csvContent: string, fileName: string) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const SyncSettings: React.FC<SyncSettingsProps> = ({
  isOpen = false,
  onClose,
  isAdminMode = false,
  onToggleAdminMode,
  onImportStaffData,
  onImportCommitteeData,
  totalStaffCount = 0,
  totalCommitteeCount = 0,
  staffList = [],
  committeeList = [],
  adminEmail,
  onApplyCleanedStaffList,
  onResetStaffData,
  onResetCommitteeData,
  onInstallPWA,
  canInstallPWA = false,
  onNavigateToRegistration,
  onOpenNavigationManager,
}) => {
  // Slug sharing state
  const [copiedSlug, setCopiedSlug] = useState(false);
  const registrationSlugUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/daftar`
    : '/daftar';

  const handleCopySlug = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(registrationSlugUrl);
      setCopiedSlug(true);
      setTimeout(() => setCopiedSlug(false), 2500);
    }
  };

  // Importer states
  const [showImporter, setShowImporter] = useState(true);
  const [importType, setImportType] = useState<'staff' | 'committee'>('staff');
  const [importMessage, setImportMessage] = useState('');
  const [isSavingImport, setIsSavingImport] = useState(false);
  const [staffPreview, setStaffPreview] = useState<{
    fileName: string;
    validRecords: Staff[];
    skippedDuplicates: string[];
    errors: string[];
  } | null>(null);
  const [committeePreview, setCommitteePreview] = useState<{
    fileName: string;
    validRecords: StaffCommittee[];
    errors: string[];
  } | null>(null);


  // Destructive Maintenance Safety State (SES v4.5)
  type MaintenanceActionType = 'cleanup' | 'reset_staff' | 'reset_committees';
  const [activeMaintenanceAction, setActiveMaintenanceAction] = useState<MaintenanceActionType | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isExecutingMaintenance, setIsExecutingMaintenance] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreview | null>(null);
  const [resetStaffPreview, setResetStaffPreview] = useState<{
    currentCount: number;
    restoredCount: number;
    removedIds: string[];
    overwrittenBaseCount: number;
    canExecute: boolean;
    blockReason?: string;
  } | null>(null);
  const [resetCommitteePreview, setResetCommitteePreview] = useState<{
    currentCount: number;
    regeneratedCount: number;
    replacedIds: string[];
    canExecute: boolean;
    blockReason?: string;
  } | null>(null);
  const [confirmAcknowledge, setConfirmAcknowledge] = useState(false);
  const [confirmTypedPhrase, setConfirmTypedPhrase] = useState('');
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    tone: 'success' | 'warning' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [auditLogs, setAuditLogs] = useState<MaintenanceAuditEntry[]>(() => getMaintenanceAuditLogs());
  const maintenanceLockRef = useRef(false);

  const authoritativeStaffIds = INITIAL_STAFF_DATA.map((s) =>
    (s.ID || s.staff_id || '').toUpperCase().trim()
  ).filter(Boolean);

  const resetConfirmationDialogState = () => {
    setActiveMaintenanceAction(null);
    setCleanupPreview(null);
    setResetStaffPreview(null);
    setResetCommitteePreview(null);
    setConfirmAcknowledge(false);
    setConfirmTypedPhrase('');
    setBackupDownloaded(false);
    setIsLoadingPreview(false);
  };

  useEffect(() => {
    if (isOpen) {
      setAuditLogs(getMaintenanceAuditLogs());
    } else if (!maintenanceLockRef.current) {
      resetConfirmationDialogState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !activeMaintenanceAction) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !maintenanceLockRef.current) {
        resetConfirmationDialogState();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeMaintenanceAction]);

  // Opens read-only preview & confirmation dialog without executing any write/delete
  const handleOpenMaintenanceReview = async (action: MaintenanceActionType) => {
    if (isExecutingMaintenance || isLoadingPreview) return;

    setConfirmAcknowledge(false);
    setConfirmTypedPhrase('');
    setBackupDownloaded(false);
    setMaintenanceStatus(null);
    setActiveMaintenanceAction(action);

    if (action === 'cleanup') {
      setIsLoadingPreview(true);
      setCleanupPreview(null);
      try {
        const preview = await previewLegacyJtmDuplicates(staffList, authoritativeStaffIds);
        setCleanupPreview(preview);
      } finally {
        setIsLoadingPreview(false);
      }
      return;
    }

    if (action === 'reset_staff') {
      const baseIdSet = new Set(authoritativeStaffIds);
      const removedIds = Array.from(
        new Set(
          staffList
            .map((s) => (s.ID || s.staff_id || '').toUpperCase().trim())
            .filter((id) => id && !baseIdSet.has(id))
        )
      ).sort();
      const isAuthed = Boolean(auth.currentUser);
      setResetStaffPreview({
        currentCount: staffList.length,
        restoredCount: INITIAL_STAFF_DATA.length,
        removedIds,
        overwrittenBaseCount: staffList.filter((s) =>
          baseIdSet.has((s.ID || s.staff_id || '').toUpperCase().trim())
        ).length,
        canExecute: isAuthed && Boolean(onResetStaffData),
        blockReason: !isAuthed
          ? 'Operasi disekat: Pengesahan Master Admin diperlukan sebelum menggantikan rekod di Firestore.'
          : undefined,
      });
      return;
    }

    if (action === 'reset_committees') {
      const defaultCommittees = deduplicateCommittees(generateDefaultCommitteesForStaff(staffList));
      const defaultIds = new Set(defaultCommittees.map((c) => c.id));
      const replacedIds = Array.from(
        new Set(committeeList.filter((c) => !defaultIds.has(c.id)).map((c) => c.id))
      ).sort();
      const isAuthed = Boolean(auth.currentUser);
      setResetCommitteePreview({
        currentCount: committeeList.length,
        regeneratedCount: defaultCommittees.length,
        replacedIds,
        canExecute: isAuthed && Boolean(onResetCommitteeData),
        blockReason: !isAuthed
          ? 'Operasi disekat: Pengesahan Master Admin diperlukan sebelum menjana semula rekod jawatankuasa di Firestore.'
          : undefined,
      });
    }
  };

  const handleDownloadPreActionBackup = () => {
    if (!activeMaintenanceAction) return;
    let ok = false;
    if (activeMaintenanceAction === 'cleanup' || activeMaintenanceAction === 'reset_staff') {
      ok = downloadMaintenanceBackupJson('sandaran_staf_kpmbp', staffList);
    } else if (activeMaintenanceAction === 'reset_committees') {
      ok = downloadMaintenanceBackupJson('sandaran_jawatankuasa_kpmbp', committeeList);
    }
    if (ok) {
      setBackupDownloaded(true);
    }
  };

  const handleConfirmExecuteMaintenance = async () => {
    if (!activeMaintenanceAction || maintenanceLockRef.current || isExecutingMaintenance || isLoadingPreview) {
      return;
    }

    const actorEmail = auth.currentUser?.email || adminEmail || 'unknown-admin';

    if (activeMaintenanceAction === 'cleanup') {
      if (!cleanupPreview?.canExecute || !confirmAcknowledge) return;
      maintenanceLockRef.current = true;
      setIsExecutingMaintenance(true);
      setMaintenanceStatus({
        tone: 'info',
        text: 'Sedang menyemak dan memadam rekod duplikat legasi di Firestore...',
      });
      try {
        const result = await cleanupLegacyJtmDuplicates(authoritativeStaffIds);
        if (!result.firestoreConfirmed) {
          throw new Error('Firestore tidak mengesahkan operasi pembersihan.');
        }

        if (onApplyCleanedStaffList) {
          onApplyCleanedStaffList(result.cleanedStaffList);
        } else if (onImportStaffData) {
          onImportStaffData(result.cleanedStaffList);
        }

        const msg = `✓ Pembersihan Duplikat disahkan di Firestore. Dokumen dipadam: ${result.deletedCount} • Ringkasan dibersihkan: ${result.removedFromSummaryCount} • Baki staf aktif: ${result.remainingCount}.`;
        setMaintenanceStatus({ tone: 'success', text: msg });

        const entry = recordMaintenanceAudit({
          operation: 'CLEANUP_DUPLICATES',
          adminEmail: actorEmail,
          affectedIds: result.deletedIds,
          affectedCount: result.deletedIds.length,
          remainingCount: result.remainingCount,
          status: 'SUCCESS',
          summary: msg,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
        resetConfirmationDialogState();
      } catch (err: any) {
        const isPartial = Boolean(err?.partialFailure);
        const isBlocked = Boolean(err?.message?.includes('disekat') || err?.message?.includes('Akses ditolak'));
        const errMsg = isPartial
          ? `⚠ Pembersihan Duplikat separa: ${err?.deletedCount || 0} dokumen dipadam sebelum ralat ringkasan Firestore (${err?.message || err}). Sila semak semula.`
          : `⚠ Pembersihan Duplikat gagal atau disekat: ${err?.message || err}`;
        setMaintenanceStatus({ tone: isPartial ? 'warning' : 'error', text: errMsg });
        const entry = recordMaintenanceAudit({
          operation: 'CLEANUP_DUPLICATES',
          adminEmail: actorEmail,
          affectedIds: isPartial && Array.isArray(err?.deletedIds) ? err.deletedIds : (cleanupPreview?.targetIds || []),
          affectedCount: isPartial ? (err?.deletedCount || 0) : 0,
          status: isPartial ? 'PARTIAL' : isBlocked ? 'BLOCKED' : 'FAILED',
          summary: errMsg,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
        resetConfirmationDialogState();
      } finally {
        maintenanceLockRef.current = false;
        setIsExecutingMaintenance(false);
      }
      return;
    }

    if (activeMaintenanceAction === 'reset_staff') {
      if (
        !resetStaffPreview?.canExecute ||
        !confirmAcknowledge ||
        confirmTypedPhrase.trim().toUpperCase() !== 'RESET STAF' ||
        !onResetStaffData
      ) {
        return;
      }
      maintenanceLockRef.current = true;
      setIsExecutingMaintenance(true);
      setMaintenanceStatus({
        tone: 'info',
        text: 'Sedang melaksanakan Reset Data Staf dan menunggu pengesahan Firestore...',
      });
      try {
        const res = await onResetStaffData();
        const isSuccess = res.ok && res.firestoreConfirmed;
        const isPartial = !isSuccess && Boolean(res.partialFailure);
        setMaintenanceStatus({
          tone: isSuccess ? 'success' : isPartial ? 'warning' : 'error',
          text: res.message,
        });
        const entry = recordMaintenanceAudit({
          operation: 'RESET_STAFF',
          adminEmail: actorEmail,
          affectedIds: res.affectedIds,
          affectedCount: isSuccess ? res.affectedIds.length : 0,
          remainingCount: res.remainingCount,
          status: isSuccess ? 'SUCCESS' : isPartial ? 'PARTIAL' : 'FAILED',
          summary: res.message,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      } catch (err: any) {
        const errMsg = `⚠ Reset Data Staf gagal: ${err?.message || err}`;
        setMaintenanceStatus({ tone: 'error', text: errMsg });
        const entry = recordMaintenanceAudit({
          operation: 'RESET_STAFF',
          adminEmail: actorEmail,
          affectedIds: resetStaffPreview.removedIds,
          affectedCount: 0,
          status: 'FAILED',
          summary: errMsg,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      } finally {
        maintenanceLockRef.current = false;
        setIsExecutingMaintenance(false);
        resetConfirmationDialogState();
      }
      return;
    }

    if (activeMaintenanceAction === 'reset_committees') {
      if (
        !resetCommitteePreview?.canExecute ||
        !confirmAcknowledge ||
        confirmTypedPhrase.trim().toUpperCase() !== 'RESET JAWATANKUASA' ||
        !onResetCommitteeData
      ) {
        return;
      }
      maintenanceLockRef.current = true;
      setIsExecutingMaintenance(true);
      setMaintenanceStatus({
        tone: 'info',
        text: 'Sedang melaksanakan Reset Jawatankuasa dan menunggu pengesahan Firestore...',
      });
      try {
        const res = await onResetCommitteeData();
        const isSuccess = res.ok && res.firestoreConfirmed;
        const isPartial = !isSuccess && Boolean(res.partialFailure);
        setMaintenanceStatus({
          tone: isSuccess ? 'success' : isPartial ? 'warning' : 'error',
          text: res.message,
        });
        const entry = recordMaintenanceAudit({
          operation: 'RESET_COMMITTEES',
          adminEmail: actorEmail,
          affectedIds: res.affectedIds,
          affectedCount: isSuccess ? res.affectedIds.length : 0,
          remainingCount: res.remainingCount,
          status: isSuccess ? 'SUCCESS' : isPartial ? 'PARTIAL' : 'FAILED',
          summary: res.message,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      } catch (err: any) {
        const errMsg = `⚠ Reset Jawatankuasa gagal: ${err?.message || err}`;
        setMaintenanceStatus({ tone: 'error', text: errMsg });
        const entry = recordMaintenanceAudit({
          operation: 'RESET_COMMITTEES',
          adminEmail: actorEmail,
          affectedIds: resetCommitteePreview.replacedIds,
          affectedCount: 0,
          status: 'FAILED',
          summary: errMsg,
        });
        setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      } finally {
        maintenanceLockRef.current = false;
        setIsExecutingMaintenance(false);
        resetConfirmationDialogState();
      }
    }
  };

  // Helper to parse CSV/TSV text respecting UTF-8 BOM, quotes and multiline fields
  const parseCSVToRows = (rawContent: string): string[][] => {
    const text = rawContent.replace(/^\uFEFF/, '');
    const lines: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          field += '"';
          i++; // skip escaped quote
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',' || char === '\t') {
          row.push(field.trim());
          field = '';
        } else if (char === '\r') {
          // ignore CR
        } else if (char === '\n') {
          row.push(field.trim());
          lines.push(row);
          row = [];
          field = '';
        } else {
          field += char;
        }
      }
    }
    if (field !== '' || row.length > 0) {
      row.push(field.trim());
      lines.push(row);
    }
    return lines.filter((r) => r.some((cell) => cell.length > 0));
  };

  // Parse & validate Committee CSV/TSV into preview state (no save until validated and confirmed)
  const prepareCommitteePreview = (textToUse: string, fileName: string) => {
    const errors: string[] = [];
    if (!textToUse.trim()) {
      setCommitteePreview(null);
      setImportMessage('⚠ Fail CSV Jawatankuasa kosong.');
      return;
    }

    try {
      const rows = parseCSVToRows(textToUse);
      if (rows.length < 2) {
        setCommitteePreview(null);
        setImportMessage('⚠ Fail tidak sah atau kurang daripada 2 baris data (header dan rekod).');
        return;
      }

      const headers = rows[0].map((h) => h.trim().replace(/^"|"$/g, ''));

      const findIdx = (possibleKeys: string[]): number => {
        for (const k of possibleKeys) {
          const idx = headers.findIndex((h) => h.toLowerCase().trim() === k.toLowerCase().trim());
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const staffIdIdx = findIdx(['StaffID', 'staff_id', 'Staff ID', 'No Staf', 'ID', 'No. Staf']);
      const namaIdx = findIdx(['Nama', 'Nama Staf', 'staff_nama', 'Name']);
      const kategoriIdx = findIdx(['Kategori', 'peringkat', 'Peringkat', 'Category', 'Level']);
      const jawatanIdx = findIdx(['Jawatan', 'peranan', 'Peranan', 'Role', 'Position']);
      const unitIdx = findIdx(['Unit', 'jawatankuasa', 'Jawatankuasa', 'Committee', 'Nama Jawatankuasa']);
      const statusIdx = findIdx(['Status', 'catatan', 'Catatan', 'Note']);

      if (staffIdIdx === -1 && unitIdx === -1) {
        setCommitteePreview(null);
        setImportMessage('⚠ Tajuk lajur wajib (seperti StaffID, Jawatan, Unit) tidak ditemui pada baris pertama fail.');
        return;
      }

      const validRecords: StaffCommittee[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const getCell = (idx: number): string => {
          if (idx !== -1 && row[idx] !== undefined) return row[idx].trim().replace(/^"|"$/g, '');
          return '';
        };

        const staffIdVal = getCell(staffIdIdx);
        const namaVal = getCell(namaIdx);
        const kategoriVal = getCell(kategoriIdx);
        const jawatanVal = getCell(jawatanIdx);
        const unitVal = getCell(unitIdx);

        if (!staffIdVal && !unitVal) {
          errors.push(`Baris ${i + 1}: Tiada StaffID atau Unit/Jawatankuasa`);
          continue;
        }

        validRecords.push({
          id: `c-imp-${i}-${Math.random().toString(36).substring(2, 6)}`,
          staff_id: staffIdVal.toUpperCase().trim(),
          staff_nama: namaVal,
          jawatankuasa: unitVal || 'Jawatankuasa Kolej',
          peranan: jawatanVal || 'Ahli',
          peringkat: kategoriVal || 'Kolej',
          catatan: getCell(statusIdx),
        });
      }

      setCommitteePreview({ fileName, validRecords, errors });

      if (validRecords.length === 0) {
        setImportMessage('⚠ Tiada rekod jawatankuasa yang sah ditemui. Sila pastikan tajuk lajur seperti StaffID, Jawatan, Unit wujud.');
      } else {
        setImportMessage('');
      }
    } catch (err: any) {
      setCommitteePreview(null);
      setImportMessage(`⚠ Ralat memproses data Jawatankuasa: ${err.message}`);
    }
  };

  // Commit validated Committee preview to state & Firebase
  const handleConfirmImportCommittee = async () => {
    if (!committeePreview || committeePreview.validRecords.length === 0) {
      setImportMessage('Sila pilih fail CSV / TSV Jawatankuasa yang sah terlebih dahulu.');
      return;
    }

    const importedList = committeePreview.validRecords;
    setIsSavingImport(true);
    try {
      if (onImportCommitteeData) {
        onImportCommitteeData(importedList);
      } else {
        localStorage.setItem('kpmbp_smarthub_committees', JSON.stringify(importedList));
      }
      setImportMessage(`✓ Mengimport ${importedList.length} rekod Jawatankuasa. Menyimpan ke Firebase...`);

      const saved = await saveCommitteesToFirestore(importedList);
      if (saved) {
        setImportMessage(`✓ Berjaya mengimport ${importedList.length} rekod Jawatankuasa & disimpan ke Firebase Firestore 🔥!`);
      } else {
        setImportMessage(`✓ Berjaya mengimport ${importedList.length} rekod Jawatankuasa ke dalam storan tempatan.`);
      }
      setCommitteePreview(null);
    } catch (err) {
      console.warn('Firebase save warning:', err);
      setImportMessage(`✓ Berjaya mengimport ${importedList.length} rekod Jawatankuasa ke dalam storan tempatan.`);
      setCommitteePreview(null);
    } finally {
      setIsSavingImport(false);
    }
  };

  // Parse & validate Staff CSV/TSV into preview state (reads headers dynamically, no save before validation)
  const prepareStaffPreview = (textToUse: string, fileName: string) => {
    const errors: string[] = [];
    if (!textToUse.trim()) {
      setStaffPreview(null);
      setImportMessage('⚠ Fail CSV kakitangan kosong.');
      return;
    }

    try {
      const rows = parseCSVToRows(textToUse);
      if (rows.length < 2) {
        setStaffPreview(null);
        setImportMessage('⚠ Fail tidak sah atau kurang daripada 2 baris data (header dan rekod).');
        return;
      }

      const headers = rows[0].map((h) => h.trim().replace(/^"|"$/g, ''));

      const findHeaderIdx = (keyNames: string[]): number => {
        for (const key of keyNames) {
          const keyLower = key.toLowerCase().trim();
          const foundIdx = headers.findIndex((h) => h.toLowerCase().trim() === keyLower);
          if (foundIdx !== -1) return foundIdx;
        }
        return -1;
      };

      const bilIdx = findHeaderIdx(['Bil']);
      const staffIdIdx = findHeaderIdx(['StaffID', 'ID', 'staff_id', 'No Staf', 'No. Staf']);
      const namaIdx = findHeaderIdx(['Nama', 'name', 'Nama Staf']);
      const kategoriIdx = findHeaderIdx(['Kategori', 'Bahagian']);
      const jawatanIdx = findHeaderIdx(['Jawatan', 'position']);
      const unitIdx = findHeaderIdx(['Unit', 'DepartmentID', 'Jabatan']);
      const kelulusanIdx = findHeaderIdx(['Kelulusan', 'qualification']);
      const pengkhususanIdx = findHeaderIdx(['Pengkhususan', 'specialisation']);
      const daerahAsalIdx = findHeaderIdx(['DaerahAsal', 'Daerah Asal', 'Asal']);
      const telefonIdx = findHeaderIdx(['Telefon']);
      const sambunganIdx = findHeaderIdx(['Sambungan']);
      const emailIdx = findHeaderIdx(['Email', 'Emel']);
      const gredIdx = findHeaderIdx(['Gred', 'Grade']);
      const tahunLahirIdx = findHeaderIdx(['Tahun Lahir', 'TahunLahir']);
      const platNo1Idx = findHeaderIdx(['PlatNo1', 'Plat 1', 'NoPlat']);
      const platNo2Idx = findHeaderIdx(['PlatNo2', 'Plat 2']);
      const platNo3Idx = findHeaderIdx(['PlatNo3', 'Plat 3']);
      const icIdx = findHeaderIdx(['IC', 'NoKP', 'No KP', 'No. KP', 'Kad Pengenalan', 'No. Kad Pengenalan', 'NRIC']);

      if (namaIdx === -1) {
        setStaffPreview(null);
        setImportMessage('⚠ Ralat: Tajuk lajur wajib "Nama" tidak ditemui pada baris pertama fail CSV. Sila gunakan Template Staff rasmi.');
        return;
      }

      const validRecords: Staff[] = [];
      const seenNames = new Set<string>();
      const seenEmails = new Set<string>();
      const skippedDuplicates: string[] = [];

      for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        if (!cols || cols.length === 0) continue;

        const getByIdx = (idx: number): string => {
          if (idx !== -1 && cols[idx] !== undefined) {
            return cols[idx].trim();
          }
          return '';
        };

        const bil = getByIdx(bilIdx);
        const staffId = getByIdx(staffIdIdx) || `ST${String(i).padStart(3, '0')}`;
        const nama = getByIdx(namaIdx);
        if (!nama) {
          errors.push(`Baris ${i + 1}: Nama kosong (dilangkau)`);
          continue;
        }

        const kategori = getByIdx(kategoriIdx) || 'Akademik';
        const jawatan = getByIdx(jawatanIdx) || 'Pensyarah';
        const unit = getByIdx(unitIdx) || 'Pengurusan';
        const kelulusan = getByIdx(kelulusanIdx);
        const pengkhususan = getByIdx(pengkhususanIdx);
        const daerahAsal = getByIdx(daerahAsalIdx);
        const telefon = getByIdx(telefonIdx);
        const sambungan = getByIdx(sambunganIdx);
        const email = getByIdx(emailIdx);
        const gred = getByIdx(gredIdx);
        const tahunLahir = getByIdx(tahunLahirIdx);
        const platNo1 = getByIdx(platNo1Idx);
        const platNo2 = getByIdx(platNo2Idx);
        const platNo3 = getByIdx(platNo3Idx);
        const ic = getByIdx(icIdx);
        const formattedIc = formatIC(ic);

        // Deduplication check: normalized name and email
        const normName = normalizeStaffName(nama);
        const normEmail = normalizeStaffEmail(email);

        // 1. Check duplicate within the same CSV batch
        if (normName && seenNames.has(normName)) {
          skippedDuplicates.push(`${nama} (${staffId}) - pendua dalam fail CSV`);
          continue;
        }
        if (normEmail && seenEmails.has(normEmail)) {
          skippedDuplicates.push(`${nama} (${staffId}) - emel berulang dalam fail CSV`);
          continue;
        }

        // 2. Check duplicate against existing staffList (with different StaffID)
        const dupInExisting = findDuplicateStaff({ Nama: nama, Email: email }, staffList, staffId);
        if (dupInExisting) {
          skippedDuplicates.push(`${nama} (${staffId}) - sepadan dengan rekod sedia ada: ${dupInExisting.Nama} (${dupInExisting.ID})`);
          continue;
        }

        if (normName) seenNames.add(normName);
        if (normEmail) seenEmails.add(normEmail);

        const allPlates = [platNo1, platNo2, platNo3].filter(Boolean);

        validRecords.push({
          Bil: bil || String(i),
          StaffID: staffId,
          ID: staffId,
          staff_id: staffId,
          Nama: nama,
          Kategori: kategori,
          Bahagian: kategori,
          Jawatan: jawatan,
          Unit: unit,
          DepartmentID: unit,
          Kelulusan: kelulusan,
          Pengkhususan: pengkhususan,
          DaerahAsal: daerahAsal,
          Telefon: telefon,
          Sambungan: sambungan,
          Email: email,
          Gred: gred,
          grade: gred,
          IC: formattedIc,
          NoKP: formattedIc,
          'Tahun Lahir': tahunLahir,
          TahunLahir: tahunLahir,
          PlatNo1: platNo1,
          PlatNo2: platNo2,
          PlatNo3: platNo3,
          NoPlat: allPlates.join(', '),
          Status: 'Aktif',
        });
      }

      setStaffPreview({ fileName, validRecords, skippedDuplicates, errors });

      if (validRecords.length === 0 && skippedDuplicates.length > 0) {
        setImportMessage(
          `⚠ Tiada rekod baharu sedia diimport. Semua ${skippedDuplicates.length} baris dalam fail dikesan sebagai duplikat:\n` +
          skippedDuplicates.slice(0, 5).map((d) => `• ${d}`).join('\n')
        );
      } else if (validRecords.length === 0) {
        setImportMessage('⚠ Ralat: Tiada rekod sah ditemui dalam fail CSV.');
      } else {
        setImportMessage('');
      }
    } catch (e: any) {
      setStaffPreview(null);
      setImportMessage(`⚠ Ralat memproses data CSV: ${e.message}`);
    }
  };

  // Commit validated Staff preview to state & Firebase
  const handleConfirmImportStaff = async () => {
    if (!staffPreview || staffPreview.validRecords.length === 0) {
      setImportMessage('Sila pilih fail CSV / TSV kakitangan yang sah terlebih dahulu.');
      return;
    }

    const importedStaff = staffPreview.validRecords;
    const skippedDuplicates = staffPreview.skippedDuplicates;
    setIsSavingImport(true);
    try {
      if (onImportStaffData) {
        onImportStaffData(importedStaff);
      } else {
        localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(importedStaff));
      }
      setImportMessage(`✓ Mengimport ${importedStaff.length} rekod kakitangan baharu. Menyimpan ke Firebase...`);

      const saved = await saveStaffListToFirestore(importedStaff);
      let msg = saved
        ? `✓ Pendaftaran ${importedStaff.length} rekod staf selesai & selamat disimpan ke Firebase Firestore 🔥!`
        : `✓ Berjaya mendaftarkan ${importedStaff.length} rekod kakitangan via CSV ke dalam sistem!`;
      if (skippedDuplicates.length > 0) {
        msg += `\n⚠ Ringkasan duplikat: ${skippedDuplicates.length} rekod dilangkau:\n` +
          skippedDuplicates.slice(0, 5).map((d) => `• ${d}`).join('\n') +
          (skippedDuplicates.length > 5 ? `\n• ...dan ${skippedDuplicates.length - 5} rekod lagi` : '');
      }
      setImportMessage(msg);
      setStaffPreview(null);
    } catch (err) {
      console.warn('Firebase staff save warning:', err);
      let msg = `✓ Berjaya mendaftarkan ${importedStaff.length} rekod kakitangan via CSV ke dalam sistem!`;
      if (skippedDuplicates.length > 0) {
        msg += ` (⚠ ${skippedDuplicates.length} baris duplikat dilangkau)`;
      }
      setImportMessage(msg);
      setStaffPreview(null);
    } finally {
      setIsSavingImport(false);
    }
  };

  // Muat Turun Templat CSV Kakitangan - 18 lajur termasuk IC (Kad Pengenalan)
  const handleDownloadStaffTemplate = () => {
    const headers = [
      'Bil', 'StaffID', 'Nama', 'Kategori', 'Jawatan', 'Unit',
      'Kelulusan', 'Pengkhususan', 'DaerahAsal', 'Telefon', 'Sambungan',
      'Email', 'Gred', 'Tahun Lahir', 'PlatNo1', 'PlatNo2', 'PlatNo3', 'IC'
    ];
    const sampleRows = [
      [
        '1', 'ST001', 'Muhammad Fazly Bin Jamaluddin', 'Pengurusan', 'Pengarah', 'Pengurusan',
        '', '', 'Kuantan, Pahang', '013-9500149', '201', 'fazly.jamaluddin@mara.gov.my',
        'DG13', '', 'WUL3110', 'WB1782D', 'A7306A', '780312-06-5123'
      ],
      [
        '2', 'ST002', 'Mohd Hakim Bin Hafiz', 'Pengurusan', 'Timb. Pengarah HEP', 'Pentadbiran',
        '', '', '', '018-3854235', '208', 'hakim.hafiz@mara.gov.my',
        'DG12', '1986', 'SJ8684', '', '', '860524-01-5421'
      ],
      [
        '3', 'ST054', 'Ahmad Khairi Bin Mohd', 'Akademik', 'Pensyarah', 'Pengajian Am',
        '1 - Sarjana Muda Sastera (Sejarah) USM, 2 - Diploma Pendidikan UPSI', 'Pengajian Malaysia', 'Kuala Terengganu', '014-5313756', '273', 'khairi.mohd@mara.gov.my',
        'DG9', '1986', 'SYM2539', 'WYX7214', '', '861115-46-5305'
      ]
    ];

    const csvRows = [
      headers.map(escapeCSVCell).join(','),
      ...sampleRows.map(row => row.map(escapeCSVCell).join(','))
    ];

    downloadCSVFile(csvRows.join('\r\n'), 'templat_kakitangan_kpmbp.csv');
  };

  // Eksport Semua Data Kakitangan Semasa (.CSV) - Strictly 17 columns as specified
  const handleExportStaffData = () => {
    let dataToExport = staffList;
    if (!dataToExport || dataToExport.length === 0) {
      try {
        dataToExport = JSON.parse(localStorage.getItem('kpmbp_smarthub_staff') || '[]');
      } catch (e) {
        dataToExport = [];
      }
    }

    if (!dataToExport || dataToExport.length === 0) {
      setImportMessage('⚠ Tiada data kakitangan untuk dieksport.');
      return;
    }

    const headers = [
      'Bil', 'StaffID', 'Nama', 'Kategori', 'Jawatan', 'Unit',
      'Kelulusan', 'Pengkhususan', 'DaerahAsal', 'Telefon', 'Sambungan',
      'Email', 'Gred', 'Tahun Lahir', 'PlatNo1', 'PlatNo2', 'PlatNo3', 'IC'
    ];

    const rows = dataToExport.map((s, idx) => {
      const bil = s.Bil || String(idx + 1);
      const staffId = s.StaffID || s.ID || s.staff_id || `ST${String(idx + 1).padStart(3, '0')}`;
      const nama = s.Nama || '';
      const kategori = s.Kategori || s.Bahagian || 'Akademik';
      const jawatan = s.Jawatan || '';
      const unit = s.Unit || s.DepartmentID || '';
      const kelulusan = s.Kelulusan || '';
      const pengkhususan = s.Pengkhususan || '';
      const daerahAsal = s.DaerahAsal || '';
      const telefon = s.Telefon || '';
      const sambungan = s.Sambungan || '';
      const email = s.Email || '';
      const gred = s.Gred || s.grade || '';
      const tahunLahir = s['Tahun Lahir'] || s.TahunLahir || '';
      const platNo1 = s.PlatNo1 || '';
      const platNo2 = s.PlatNo2 || '';
      const platNo3 = s.PlatNo3 || '';
      const ic = formatIC(s.IC || s.NoKP || '');

      return [
        bil,
        staffId,
        nama,
        kategori,
        jawatan,
        unit,
        kelulusan,
        pengkhususan,
        daerahAsal,
        telefon,
        sambungan,
        email,
        gred,
        tahunLahir,
        platNo1,
        platNo2,
        platNo3,
        ic
      ];
    });

    const csvContent = [
      headers.map(escapeCSVCell).join(','),
      ...rows.map(row => row.map(escapeCSVCell).join(','))
    ].join('\r\n');

    const todayStr = new Date().toISOString().split('T')[0];
    downloadCSVFile(csvContent, `senarai_kakitangan_kpmbp_${todayStr}.csv`);
  };

  // Muat Turun Templat CSV Jawatankuasa (Tanpa lajur Tahun)
  const handleDownloadCommitteeTemplate = () => {
    const headers = ['Bil', 'StaffID', 'Nama', 'Kategori', 'Jawatan', 'Unit'];
    const sampleRows = [
      ['1', 'ST001', 'Ts. Dr. Ahmad bin Abdullah', 'Pengurusan', 'Pengerusi', 'JK Pengurusan Kolej (JPK)'],
      ['2', 'ST001', 'Ts. Dr. Ahmad bin Abdullah', 'Pengurusan', 'Pengerusi', 'JK Keselamatan & Kesihatan Pekerjaan Kolej (JKKP)'],
      ['3', 'ST002', 'Siti Aminah binti Kassim', 'Akademik', 'Setiausaha', 'JK Peperiksaan & Penilaian']
    ];

    const csvContent = [
      headers.map(escapeCSVCell).join(','),
      ...sampleRows.map(row => row.map(escapeCSVCell).join(','))
    ].join('\r\n');

    downloadCSVFile(csvContent, 'templat_jawatankuasa_kpmbp.csv');
  };

  // Eksport Semua Data Jawatankuasa Semasa (.CSV) (Tanpa lajur Tahun)
  const handleExportCommitteeData = () => {
    let dataToExport = committeeList;
    if (!dataToExport || dataToExport.length === 0) {
      try {
        dataToExport = JSON.parse(localStorage.getItem('kpmbp_smarthub_committees') || '[]');
      } catch (e) {
        dataToExport = [];
      }
    }

    if (!dataToExport || dataToExport.length === 0) {
      setImportMessage('⚠ Tiada data jawatankuasa untuk dieksport.');
      return;
    }

    const headers = ['Bil', 'StaffID', 'Nama', 'Kategori', 'Jawatan', 'Unit'];
    const rows = dataToExport.map((c, idx) => [
      String(idx + 1),
      c.staff_id || '',
      c.staff_nama || '',
      c.peringkat || '',
      c.peranan || '',
      c.jawatankuasa || ''
    ]);

    const csvContent = [
      headers.map(escapeCSVCell).join(','),
      ...rows.map(row => row.map(escapeCSVCell).join(','))
    ].join('\r\n');

    const todayStr = new Date().toISOString().split('T')[0];
    downloadCSVFile(csvContent, `senarai_jawatankuasa_kpmbp_${todayStr}.csv`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content !== undefined) {
        if (importType === 'committee') {
          prepareCommitteePreview(content, file.name);
        } else {
          prepareStaffPreview(content, file.name);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-3xl bg-white rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-100 my-8 space-y-6 text-left max-h-[90vh] overflow-y-auto scrollbar-thin"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-2xl shadow-md shadow-indigo-200">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-sans font-extrabold text-slate-900 text-base md:text-lg leading-tight">
                  Pusat Pengurusan Data & Admin KPMBP
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Pendaftaran staf via import CSV rasmi, otorisasi pentadbir & storan Firebase Firestore
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canInstallPWA && onInstallPWA && (
                <button
                  type="button"
                  onClick={onInstallPWA}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer border border-emerald-500/30"
                  title="Pasang Aplikasi Direktori"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Pasang App</span>
                </button>
              )}
              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer"
                  title="Tutup Modal Tetapan"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Status Otorisasi Master Administrator (SYNCROZZ Standard) */}
          <div className="p-4 md:p-5 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50 rounded-2xl border border-indigo-200/90 shadow-xs space-y-3 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100/80 pb-3">
              <div>
                <h4 className="text-xs md:text-sm font-extrabold text-indigo-950 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>Status Pentadbir Utama</span>
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Sistem beroperasi di bawah piawaian satu Master Admin tunggal dengan Google Authentication.
                </p>
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 self-start sm:self-auto shrink-0">
                Level 1 Aktif
              </span>
            </div>

            <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Akaun Dibenarkan:</span>
                <span className="font-mono font-bold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                  {MASTER_ADMIN_EMAIL}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Kaedah Pengesahan:</span>
                <span className="font-semibold text-slate-700">Firebase Google Auth</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Laluan Alternatif:</span>
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Dinyahaktifkan Sepenuhnya</span>
              </div>
            </div>
          </div>



          {/* Pautan Pendaftaran Kendiri Staf Baharu (Slug Pendaftaran) */}
          <div className="p-4 md:p-5 bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 rounded-2xl border border-indigo-200/90 shadow-xs space-y-4 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100/80 pb-3">
              <div>
                <h4 className="text-xs md:text-sm font-extrabold text-indigo-950 flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span>Pautan Pendaftaran Kendiri Staf Baharu</span>
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Admin boleh menyalin dan menghantar pautan slug ini kepada staf atau pensyarah baharu untuk memasukkan butiran peribadi & perjawatan secara terus.
                </p>
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200 self-start sm:self-auto shrink-0">
                Pendaftaran Terus
              </span>
            </div>

            {/* Slug URL Display & Action Deck */}
            <div className="space-y-3 bg-white p-3.5 rounded-xl border border-indigo-100 shadow-2xs">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Link className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Pautan URL / Slug Borang Pendaftaran:</span>
                  </span>
                  <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100">
                    /daftar
                  </span>
                </label>
                
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 truncate select-all">
                    {registrationSlugUrl}
                  </div>
                  
                  <button
                    type="button"
                    onClick={handleCopySlug}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer shrink-0"
                    title="Salin pautan slug pendaftaran kendiri"
                  >
                    {copiedSlug ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Pautan</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Quick Actions: Open & Share WhatsApp */}
              <div className="flex items-center gap-2 pt-1 flex-wrap">
                {onNavigateToRegistration && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onClose) onClose();
                      onNavigateToRegistration();
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                    <span>Buka Halaman Pendaftaran</span>
                  </button>
                )}

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Salam sejahtera. Sila lengkapkan pendaftaran profil rasmi anda sebagai kakitangan/pensyarah Kolej Profesional MARA Bandar Penawar melalui pautan direktori berikut:\n\n${registrationSlugUrl}\n\nTerima kasih.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Kongsi melalui WhatsApp</span>
                </a>
              </div>
            </div>
          </div>

          {/* Direct Data Importer & Exporter (CSV) - Single Official Method for Registration */}
          <div className="p-4 bg-gradient-to-br from-indigo-50/70 to-amber-50/40 rounded-2xl border border-indigo-100/80 shadow-xs space-y-3 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-extrabold text-indigo-950 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-600" /> Pendaftaran Staf Baharu & Pengurusan CSV
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">
                  Muat turun templat rasmi, pilih fail CSV / TSV untuk pratonton & validasi, atau eksport data semasa.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowImporter(!showImporter)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer shrink-0 self-start sm:self-auto"
              >
                {showImporter ? 'Tutup Panel' : 'Buka Panel CSV'}
              </button>
            </div>

            {showImporter && (
              <div className="pt-3 space-y-3 border-t border-indigo-100/60">
                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-2 p-1 bg-white/80 border border-indigo-100 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => {
                      setImportType('staff');
                      setImportMessage('');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                      importType === 'staff'
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    <span>👤 Kakitangan</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                      {totalStaffCount || staffList.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setImportType('committee');
                      setImportMessage('');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                      importType === 'committee'
                        ? 'bg-amber-500 text-white shadow-2xs'
                        : 'text-slate-700 hover:bg-amber-50'
                    }`}
                  >
                    <span>🏅 Jawatankuasa</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                      {totalCommitteeCount || committeeList.length}
                    </span>
                  </button>
                </div>

                {importType === 'staff' ? (
                  /* Staff CSV Section */
                  <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-xs">
                    {/* Primary Actions: Template, Export, Choose File */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadStaffTemplate}
                        className="py-2 px-3 bg-white hover:bg-indigo-50 active:scale-[0.98] border border-indigo-200 text-indigo-950 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Muat Turun Template Staff</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportStaffData}
                        className="py-2 px-3 bg-indigo-50 hover:bg-indigo-100 active:scale-[0.98] border border-indigo-200 text-indigo-900 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <FileDown className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>Eksport Data Semasa ({totalStaffCount || staffList.length})</span>
                      </button>

                      <label className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white rounded-xl font-black text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5">
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>Pilih Fail CSV / TSV</span>
                        <input
                          type="file"
                          accept=".csv,.tsv,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Preview Table After File Selection */}
                    {staffPreview && (
                      <div className="rounded-xl border border-indigo-100 bg-slate-50/70 overflow-hidden">
                        <div className="px-3 py-2 bg-indigo-50/80 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-extrabold text-indigo-950 truncate max-w-[220px]">
                              {staffPreview.fileName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              {staffPreview.validRecords.length} Sah
                            </span>
                            {staffPreview.skippedDuplicates.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                                {staffPreview.skippedDuplicates.length} Duplikat
                              </span>
                            )}
                            {staffPreview.errors.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                {staffPreview.errors.length} Ralat Baris
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setStaffPreview(null);
                              setImportMessage('');
                            }}
                            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Batal</span>
                          </button>
                        </div>

                        {staffPreview.validRecords.length > 0 && (
                          <div className="max-h-52 overflow-auto">
                            <table className="w-full text-left border-collapse text-[11px]">
                              <thead className="bg-white sticky top-0 border-b border-slate-200 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-2.5 py-1.5">ID</th>
                                  <th className="px-2.5 py-1.5">Nama</th>
                                  <th className="px-2.5 py-1.5">Kategori</th>
                                  <th className="px-2.5 py-1.5">Jawatan</th>
                                  <th className="px-2.5 py-1.5">Unit</th>
                                  <th className="px-2.5 py-1.5">Gred</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white/80">
                                {staffPreview.validRecords.slice(0, 25).map((row, idx) => (
                                  <tr key={`${row.ID}-${idx}`} className="hover:bg-indigo-50/40">
                                    <td className="px-2.5 py-1.5 font-mono font-bold text-indigo-700 whitespace-nowrap">{row.ID}</td>
                                    <td className="px-2.5 py-1.5 font-semibold text-slate-800">{row.Nama}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.Kategori}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.Jawatan}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.Unit}</td>
                                    <td className="px-2.5 py-1.5 font-mono text-slate-600">{row.Gred || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {staffPreview.validRecords.length > 25 && (
                              <div className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-500 bg-slate-50 border-t border-slate-100">
                                Memaparkan 25 daripada {staffPreview.validRecords.length} rekod sah.
                              </div>
                            )}
                          </div>
                        )}

                        {staffPreview.skippedDuplicates.length > 0 && (
                          <div className="px-3 py-2 bg-amber-50/80 border-t border-amber-100 text-[10.5px] text-amber-900 space-y-0.5">
                            <div className="font-extrabold">Rekod Duplikat Dilangkau:</div>
                            {staffPreview.skippedDuplicates.slice(0, 5).map((d, i) => (
                              <div key={i}>• {d}</div>
                            ))}
                            {staffPreview.skippedDuplicates.length > 5 && (
                              <div>• ...dan {staffPreview.skippedDuplicates.length - 5} rekod lagi</div>
                            )}
                          </div>
                        )}

                        {staffPreview.errors.length > 0 && (
                          <div className="px-3 py-2 bg-rose-50/80 border-t border-rose-100 text-[10.5px] text-rose-900 space-y-0.5">
                            <div className="font-extrabold">Ralat Baris Dilangkau:</div>
                            {staffPreview.errors.slice(0, 5).map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                            {staffPreview.errors.length > 5 && (
                              <div>• ...dan {staffPreview.errors.length - 5} ralat lagi</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleConfirmImportStaff}
                      disabled={isSavingImport || !staffPreview || staffPreview.validRecords.length === 0}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingImport ? 'Sedang Menyimpan...' : 'Proses Pendaftaran Staff & Simpan Ke Firebase'}</span>
                    </button>
                  </div>
                ) : (
                  /* Committee CSV Section */
                  <div className="space-y-3 bg-white p-3.5 rounded-2xl border border-amber-200/70 shadow-xs">
                    {/* Primary Actions: Template, Export, Choose File */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={handleDownloadCommitteeTemplate}
                        className="py-2 px-3 bg-white hover:bg-amber-50 active:scale-[0.98] border border-amber-300 text-amber-950 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Muat Turun Template JK</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleExportCommitteeData}
                        className="py-2 px-3 bg-amber-50 hover:bg-amber-100 active:scale-[0.98] border border-amber-300 text-amber-950 rounded-xl text-xs font-black shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <FileDown className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Eksport Data Semasa ({totalCommitteeCount || committeeList.length})</span>
                      </button>

                      <label className="py-2 px-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] text-white rounded-xl font-black text-xs shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5">
                        <Upload className="w-4 h-4 shrink-0" />
                        <span>Pilih Fail CSV / TSV</span>
                        <input
                          type="file"
                          accept=".csv,.tsv,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Preview Table After File Selection */}
                    {committeePreview && (
                      <div className="rounded-xl border border-amber-200/80 bg-amber-50/30 overflow-hidden">
                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200/70 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-extrabold text-amber-950 truncate max-w-[220px]">
                              {committeePreview.fileName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              {committeePreview.validRecords.length} Sah
                            </span>
                            {committeePreview.errors.length > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold">
                                {committeePreview.errors.length} Ralat Baris
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCommitteePreview(null);
                              setImportMessage('');
                            }}
                            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Batal</span>
                          </button>
                        </div>

                        {committeePreview.validRecords.length > 0 && (
                          <div className="max-h-52 overflow-auto">
                            <table className="w-full text-left border-collapse text-[11px]">
                              <thead className="bg-white sticky top-0 border-b border-amber-100 text-slate-600 font-extrabold">
                                <tr>
                                  <th className="px-2.5 py-1.5">StaffID</th>
                                  <th className="px-2.5 py-1.5">Nama</th>
                                  <th className="px-2.5 py-1.5">Kategori</th>
                                  <th className="px-2.5 py-1.5">Jawatan</th>
                                  <th className="px-2.5 py-1.5">Unit / Jawatankuasa</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-amber-100/60 bg-white/80">
                                {committeePreview.validRecords.slice(0, 25).map((row, idx) => (
                                  <tr key={`${row.id}-${idx}`} className="hover:bg-amber-50/50">
                                    <td className="px-2.5 py-1.5 font-mono font-bold text-amber-800 whitespace-nowrap">{row.staff_id || '-'}</td>
                                    <td className="px-2.5 py-1.5 font-semibold text-slate-800">{row.staff_nama || '-'}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.peringkat}</td>
                                    <td className="px-2.5 py-1.5 text-slate-600">{row.peranan}</td>
                                    <td className="px-2.5 py-1.5 text-slate-700">{row.jawatankuasa}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {committeePreview.validRecords.length > 25 && (
                              <div className="px-3 py-1.5 text-[10.5px] font-semibold text-slate-500 bg-amber-50/40 border-t border-amber-100">
                                Memaparkan 25 daripada {committeePreview.validRecords.length} rekod sah.
                              </div>
                            )}
                          </div>
                        )}
                        {committeePreview.errors.length > 0 && (
                          <div className="px-3 py-2 bg-rose-50/80 border-t border-rose-100 text-[10.5px] text-rose-900 space-y-0.5">
                            <div className="font-extrabold">Ralat Baris Dilangkau:</div>
                            {committeePreview.errors.slice(0, 5).map((err, i) => (
                              <div key={i}>• {err}</div>
                            ))}
                            {committeePreview.errors.length > 5 && (
                              <div>• ...dan {committeePreview.errors.length - 5} ralat lagi</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleConfirmImportCommittee}
                      disabled={isSavingImport || !committeePreview || committeePreview.validRecords.length === 0}
                      className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      <span>{isSavingImport ? 'Sedang Menyimpan...' : 'Proses & Kemaskini Jawatankuasa Ke Firebase'}</span>
                    </button>
                  </div>
                )}

                {importMessage && (
                  <div className={`p-3 rounded-xl text-xs font-bold leading-relaxed whitespace-pre-line ${
                    importMessage.startsWith('✓') 
                      ? 'bg-emerald-100/90 text-emerald-950 border border-emerald-200' 
                      : 'bg-amber-100/90 text-amber-950 border border-amber-200'
                  }`}>
                    {importMessage}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Zon Penyelenggaraan & Tindakan Berisiko (Terasing daripada Import/Eksport Biasa) */}
          <div className="p-4 md:p-5 bg-gradient-to-br from-rose-50/75 via-white to-amber-50/70 rounded-2xl border-2 border-rose-200/80 shadow-xs space-y-4 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-200/70 pb-3">
              <div>
                <h4 className="text-xs md:text-sm font-extrabold text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Zon Penyelenggaraan Data &amp; Tindakan Berisiko</span>
                </h4>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">
                  Setiap tindakan di bawah memerlukan pratonton rekod terjejas, amaran pemulihan, dan pengesahan akhir sebelum sebarang perubahan dibuat pada Firestore.
                </p>
              </div>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-rose-100 text-rose-900 border border-rose-200 self-start sm:self-auto shrink-0">
                Pengesahan Berlapis
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Pembersihan Duplikat */}
              <div className="p-3.5 rounded-xl bg-white border border-amber-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-900">
                    Pembersihan Duplikat
                  </span>
                  <h5 className="text-xs font-extrabold text-slate-900">
                    Bersihkan Duplikat Lama
                  </h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Semak dan padam ID duplikat legasi JTM yang disahkan sambil mengekalkan semua rekod autoritatif.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenMaintenanceReview('cleanup')}
                  disabled={isExecutingMaintenance || isLoadingPreview}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Semak &amp; Bersihkan Duplikat Lama</span>
                </button>
              </div>

              {/* 2. Reset Data Staf */}
              <div className="p-3.5 rounded-xl bg-white border border-rose-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-rose-100 text-rose-900">
                    Reset Data Staf
                  </span>
                  <h5 className="text-xs font-extrabold text-slate-900">
                    Pulih ke Data Asal Staf
                  </h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Menggantikan senarai staf semasa dengan {INITIAL_STAFF_DATA.length} rekod asas. Rekod baharu/suntingan luar data asas akan dipadam.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenMaintenanceReview('reset_staff')}
                  disabled={!onResetStaffData || isExecutingMaintenance || isLoadingPreview}
                  className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Semak &amp; Reset Data Staf</span>
                </button>
              </div>

              {/* 3. Reset Jawatankuasa */}
              <div className="p-3.5 rounded-xl bg-white border border-orange-200/90 shadow-2xs flex flex-col justify-between gap-3">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-orange-100 text-orange-900">
                    Reset Jawatankuasa
                  </span>
                  <h5 className="text-xs font-extrabold text-slate-900">
                    Jana Semula Jawatankuasa Lalai
                  </h5>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Memadam senarai jawatankuasa tersuai/import semasa dan menjana semula set lalai ke Firestore.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenMaintenanceReview('reset_committees')}
                  disabled={!onResetCommitteeData || isExecutingMaintenance || isLoadingPreview}
                  className="w-full py-2 px-3 bg-orange-600 hover:bg-orange-700 active:scale-[0.98] text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Semak &amp; Reset Jawatankuasa</span>
                </button>
              </div>
            </div>

            {maintenanceStatus && (
              <div
                role="status"
                className={`p-3 rounded-xl text-xs font-bold leading-relaxed border ${
                  maintenanceStatus.tone === 'success'
                    ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                    : maintenanceStatus.tone === 'error'
                      ? 'bg-rose-50 text-rose-950 border-rose-200'
                      : maintenanceStatus.tone === 'warning'
                        ? 'bg-amber-50 text-amber-950 border-amber-200'
                        : 'bg-indigo-50 text-indigo-950 border-indigo-200'
                }`}
              >
                {maintenanceStatus.text}
              </div>
            )}

            {/* Sanitized Audit Trail Summary (Zero Sensitive PII) */}
            {auditLogs.length > 0 && (
              <div className="pt-2 border-t border-rose-200/60 space-y-1.5">
                <div className="text-[10.5px] font-extrabold text-slate-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-600" />
                  <span>Log Audit Penyelenggaraan Terkini (ID Rekod Sahaja):</span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                  {auditLogs.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      className="text-[10.5px] px-2.5 py-1.5 rounded-lg bg-white/90 border border-slate-200/80 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 rounded font-black text-[9.5px] ${
                            entry.status === 'SUCCESS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : entry.status === 'BLOCKED' || entry.status === 'PARTIAL'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {entry.status}
                        </span>
                        <span className="font-bold text-slate-800">{entry.operation}</span>
                        <span className="font-mono text-slate-500 truncate">{entry.adminEmail}</span>
                      </div>
                      <div className="text-slate-500 font-mono text-[10px]">
                        {entry.affectedCount} rekod • {new Date(entry.timestamp).toLocaleString('ms-MY')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Controls (Strictly Ordinary Navigation Only — No Destructive Actions) */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer"
              >
                Selesai / Tutup
              </button>
            )}
          </div>

          {/* Layered Preview & Confirmation Modal for Destructive Maintenance Actions */}
          {activeMaintenanceAction && (
            <div
              className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => {
                if (!isExecutingMaintenance) resetConfirmationDialogState();
              }}
            >
              <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="maintenance-confirm-title"
                className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-rose-200 p-5 sm:p-6 space-y-4 text-left max-h-[88vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-xl bg-rose-100 text-rose-700 shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 id="maintenance-confirm-title" className="text-sm font-black text-slate-900">
                        {activeMaintenanceAction === 'cleanup'
                          ? 'Pratonton & Pengesahan: Pembersihan Duplikat'
                          : activeMaintenanceAction === 'reset_staff'
                            ? 'Pratonton & Pengesahan: Reset Data Staf'
                            : 'Pratonton & Pengesahan: Reset Jawatankuasa'}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                        {activeMaintenanceAction === 'cleanup'
                          ? 'Tindakan Pemadaman Terpilih — Semak senarai ID terjejas sebelum meneruskan.'
                          : activeMaintenanceAction === 'reset_staff'
                            ? 'Tindakan Ganti & Pulih (Replace & Restore) ke Data Asal Staf.'
                            : 'Tindakan Padam Cache & Jana Semula Jawatankuasa Lalai.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isExecutingMaintenance}
                    onClick={resetConfirmationDialogState}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-40"
                    aria-label="Tutup dialog pengesahan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Preview Body */}
                {activeMaintenanceAction === 'cleanup' && (
                  <div className="space-y-3 text-xs">
                    {isLoadingPreview ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold text-center">
                        Sedang membaca Firestore untuk mengesahkan rekod duplikat (baca sahaja)...
                      </div>
                    ) : cleanupPreview ? (
                      <>
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                          <div className="font-extrabold text-slate-800">Kriteria Pemilihan:</div>
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            {cleanupPreview.selectionCriteria}
                          </p>
                          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <div className="text-[10px] text-slate-500 font-bold">Sasaran Padam</div>
                              <div className="text-sm font-black text-rose-700">{cleanupPreview.targetIds.length}</div>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <div className="text-[10px] text-slate-500 font-bold">Rekod Dikekalkan</div>
                              <div className="text-sm font-black text-emerald-700">{cleanupPreview.preservedCount}</div>
                            </div>
                            <div className="p-2 rounded-lg bg-white border border-slate-200">
                              <div className="text-[10px] text-slate-500 font-bold">Meragukan</div>
                              <div className="text-sm font-black text-amber-700">{cleanupPreview.ambiguousIds.length}</div>
                            </div>
                          </div>
                        </div>

                        {cleanupPreview.targetIds.length > 0 && (
                          <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1.5">
                            <div className="text-[11px] font-extrabold text-rose-950">
                              ID Rekod Yang Akan Dipadam ({cleanupPreview.targetIds.length}):
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {cleanupPreview.targetIds.map((id) => (
                                <span
                                  key={id}
                                  className="px-2 py-0.5 rounded bg-white border border-rose-200 font-mono font-bold text-[10.5px] text-rose-800"
                                >
                                  {id}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {cleanupPreview.blockReason && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                            ⚠ {cleanupPreview.blockReason}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                )}

                {activeMaintenanceAction === 'reset_staff' && resetStaffPreview && (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200 space-y-2">
                      <div className="font-extrabold text-rose-950">Kesan Operasi Reset Data Staf:</div>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-rose-900">
                        <li>
                          Menimpa &amp; menggantikan senarai staf semasa ({resetStaffPreview.currentCount} rekod) di Firestore (`system/staff_data` &amp; koleksi `staff`) dan storan tempatan kepada <strong>{resetStaffPreview.restoredCount} rekod asas</strong>.
                        </li>
                        <li>
                          Sebarang pendaftaran kendiri atau staf import baharu di luar data asas ({resetStaffPreview.removedIds.length} rekod) akan <strong>dipadamkan</strong>.
                        </li>
                        <li>
                          Suntingan profil bagi {resetStaffPreview.overwrittenBaseCount} staf sedia ada akan dikembalikan ke nilai asal.
                        </li>
                      </ul>
                    </div>

                    {resetStaffPreview.removedIds.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                        <div className="text-[11px] font-extrabold text-slate-800">
                          ID Staf Tambahan Yang Akan Dipadam ({resetStaffPreview.removedIds.length}):
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                          {resetStaffPreview.removedIds.slice(0, 40).map((id) => (
                            <span
                              key={id}
                              className="px-2 py-0.5 rounded bg-white border border-rose-200 font-mono font-bold text-[10.5px] text-rose-800"
                            >
                              {id}
                            </span>
                          ))}
                          {resetStaffPreview.removedIds.length > 40 && (
                            <span className="text-[10.5px] font-bold text-slate-500">
                              +{resetStaffPreview.removedIds.length - 40} ID lagi
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {resetStaffPreview.blockReason && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                        ⚠ {resetStaffPreview.blockReason}
                      </div>
                    )}
                  </div>
                )}

                {activeMaintenanceAction === 'reset_committees' && resetCommitteePreview && (
                  <div className="space-y-3 text-xs">
                    <div className="p-3 rounded-xl bg-orange-50/75 border border-orange-200 space-y-2">
                      <div className="font-extrabold text-orange-950">Kesan Operasi Reset Jawatankuasa:</div>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-orange-950">
                        <li>
                          Memadam rekod jawatankuasa tersuai/import semasa ({resetCommitteePreview.currentCount} rekod) dan menggantikan dengan <strong>{resetCommitteePreview.regeneratedCount} rekod lalai</strong> di Firestore (`system/committee_data` &amp; koleksi `committees`) serta storan tempatan.
                        </li>
                        <li>
                          Sebanyak {resetCommitteePreview.replacedIds.length} rekod jawatankuasa tersuai/import akan diganti atau dipadamkan.
                        </li>
                      </ul>
                    </div>

                    {resetCommitteePreview.replacedIds.length > 0 && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                        <div className="text-[11px] font-extrabold text-slate-800">
                          Contoh ID Jawatankuasa Terjejas ({resetCommitteePreview.replacedIds.length}):
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {resetCommitteePreview.replacedIds.slice(0, 20).map((id) => (
                            <span
                              key={id}
                              className="px-2 py-0.5 rounded bg-white border border-orange-200 font-mono font-bold text-[10.5px] text-orange-800"
                            >
                              {id}
                            </span>
                          ))}
                          {resetCommitteePreview.replacedIds.length > 20 && (
                            <span className="text-[10.5px] font-bold text-slate-500">
                              +{resetCommitteePreview.replacedIds.length - 20} ID lagi
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {resetCommitteePreview.blockReason && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-950">
                        ⚠ {resetCommitteePreview.blockReason}
                      </div>
                    )}
                  </div>
                )}

                {/* Recovery & Rollback Warning + Pre-Action Backup */}
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="text-[11px] font-extrabold text-amber-950">
                    Amaran Pemulihan &amp; Rollback:
                  </div>
                  <p className="text-[10.5px] text-amber-900 leading-relaxed">
                    Firestore tidak menyediakan fungsi <em>rollback</em> automatik selepas rekod dipadam atau ditimpa. Sila muat turun fail sandaran sebelum meneruskan sekiranya anda memerlukan pemulihan manual.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadPreActionBackup}
                    disabled={isExecutingMaintenance}
                    className="px-3 py-1.5 bg-white hover:bg-amber-100 border border-amber-300 text-amber-950 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-700" />
                    <span>
                      {backupDownloaded ? '✓ Sandaran JSON Dimuat Turun' : 'Muat Turun Sandaran JSON Sebelum Teruskan'}
                    </span>
                  </button>
                </div>

                {/* Strong Final Confirmation Controls */}
                <div className="space-y-2.5 pt-1">
                  <label className="flex items-start gap-2 cursor-pointer select-none text-[11px] text-slate-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={confirmAcknowledge}
                      onChange={(e) => setConfirmAcknowledge(e.target.checked)}
                      disabled={
                        isExecutingMaintenance ||
                        isLoadingPreview ||
                        (activeMaintenanceAction === 'cleanup' && !cleanupPreview?.canExecute) ||
                        (activeMaintenanceAction === 'reset_staff' && !resetStaffPreview?.canExecute) ||
                        (activeMaintenanceAction === 'reset_committees' && !resetCommitteePreview?.canExecute)
                      }
                      className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 disabled:opacity-40"
                    />
                    <span>
                      Saya telah menyemak pratonton rekod terjejas di atas dan memahami operasi ini akan mengubah data Firestore tanpa rollback automatik.
                    </span>
                  </label>

                  {(activeMaintenanceAction === 'reset_staff' || activeMaintenanceAction === 'reset_committees') && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-extrabold text-slate-800">
                        Taip{' '}
                        <code className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900 font-mono">
                          {activeMaintenanceAction === 'reset_staff' ? 'RESET STAF' : 'RESET JAWATANKUASA'}
                        </code>{' '}
                        untuk pengesahan muktamad:
                      </label>
                      <input
                        type="text"
                        value={confirmTypedPhrase}
                        onChange={(e) => setConfirmTypedPhrase(e.target.value)}
                        disabled={
                          isExecutingMaintenance ||
                          (activeMaintenanceAction === 'reset_staff' && !resetStaffPreview?.canExecute) ||
                          (activeMaintenanceAction === 'reset_committees' && !resetCommitteePreview?.canExecute)
                        }
                        placeholder={activeMaintenanceAction === 'reset_staff' ? 'RESET STAF' : 'RESET JAWATANKUASA'}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none disabled:bg-slate-100 disabled:opacity-60"
                      />
                    </div>
                  )}
                </div>

                {/* Dialog Actions: Cancel is default safe action */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    autoFocus
                    disabled={isExecutingMaintenance}
                    onClick={resetConfirmationDialogState}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold border border-slate-200 cursor-pointer transition-all disabled:opacity-50"
                  >
                    Batal (Selamat)
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmExecuteMaintenance}
                    disabled={
                      isExecutingMaintenance ||
                      isLoadingPreview ||
                      !confirmAcknowledge ||
                      (activeMaintenanceAction === 'cleanup' && !cleanupPreview?.canExecute) ||
                      (activeMaintenanceAction === 'reset_staff' &&
                        (!resetStaffPreview?.canExecute ||
                          confirmTypedPhrase.trim().toUpperCase() !== 'RESET STAF')) ||
                      (activeMaintenanceAction === 'reset_committees' &&
                        (!resetCommitteePreview?.canExecute ||
                          confirmTypedPhrase.trim().toUpperCase() !== 'RESET JAWATANKUASA'))
                    }
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-sm cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {isExecutingMaintenance ? 'Sedang Memproses...' : 'Sahkan & Laksanakan'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </AnimatePresence>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — SYNCROZZ DEADLINE HUB (Module A & F)
 * Centralised AI-Powered Institutional Deadline & Action Management
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  History,
  Loader2,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  AuthorizedAdmin,
  DeadlineAuditLog,
  DeadlineCategory,
  DeadlineComputedStatus,
  DeadlineDraft,
  DeadlineRecord,
  Staff,
} from '../types';
import { auth } from '../config/firebase';
import {
  DEADLINE_CATEGORIES,
  computeDeadlineStatus,
  formatDeadlineCountdown,
  formatDueDateDisplay,
  formatDueTimeDisplay,
  getKualaLumpurNowParts,
  matchesStaffDeadlines,
  validateDeadlineCandidate,
} from '../utils/deadlineStatus';
import {
  changeDeadlineStoredStatus,
  deletePublishedDeadline,
  getProtectedSourceEvidenceUrl,
  subscribeToDeadlineAuditLogs,
  subscribeToDeadlineDrafts,
  subscribeToDeadlines,
  updatePublishedDeadline,
} from '../services/deadlineService';
import { AiDeadlineCaptureModal } from './AiDeadlineCaptureModal';

interface DeadlineHubProps {
  staffList: Staff[];
  isAdminMode: boolean;
  currentAdmin: AuthorizedAdmin | null;
  globalSearchQuery?: string;
}

type DeadlineFilterTab =
  | 'all'
  | 'my_deadlines'
  | 'my_department'
  | 'due_today'
  | 'upcoming'
  | 'expired'
  | 'archived'
  | 'inactive';

const STAFF_IDENTITY_STORAGE_KEY = 'kpmbp_deadline_staff_identity_v1';

const STATUS_META: Record<
  DeadlineComputedStatus,
  { label: string; badgeClass: string; textClass: string }
> = {
  DUE_TODAY: {
    label: 'Tamat Hari Ini',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    textClass: 'text-rose-700',
  },
  UPCOMING: {
    label: 'Akan Datang',
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    textClass: 'text-indigo-700',
  },
  EXPIRED: {
    label: 'Tamat Tempoh',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    textClass: 'text-slate-500',
  },
  ARCHIVED: {
    label: 'Diarkibkan',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    textClass: 'text-amber-700',
  },
  INACTIVE: {
    label: 'Tidak Aktif',
    badgeClass: 'bg-slate-100 text-slate-500 border-slate-200',
    textClass: 'text-slate-500',
  },
};

export const DeadlineHub: React.FC<DeadlineHubProps> = ({
  staffList,
  isAdminMode,
  currentAdmin,
  globalSearchQuery = '',
}) => {
  const [deadlines, setDeadlines] = useState<DeadlineRecord[]>([]);
  const [pendingDrafts, setPendingDrafts] = useState<DeadlineDraft[]>([]);
  const [auditLogs, setAuditLogs] = useState<DeadlineAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  // Live Asia/Kuala_Lumpur clock updated every 60s for automatic status & countdown
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Filters
  const [activeFilter, setActiveFilter] = useState<DeadlineFilterTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | DeadlineCategory>('Semua');
  const [localSearch, setLocalSearch] = useState('');

  // Selected Staff Identity for "My Deadlines" & "My Department"
  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(STAFF_IDENTITY_STORAGE_KEY) || '';
  });

  // Modals & Drawers
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [captureInitialTab, setCaptureInitialTab] = useState<'upload' | 'paste' | 'queue'>('upload');
  const [detailRecord, setDetailRecord] = useState<DeadlineRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<DeadlineRecord | null>(null);
  const [editReason, setEditReason] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeadlineRecord | null>(null);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [evidenceSignedUrls, setEvidenceSignedUrls] = useState<Record<string, string>>({});

  // Subscribe to published deadlines (or all deadlines in Admin Mode)
  useEffect(() => {
    setIsLoading(true);
    setFirestoreError(null);
    const unsub = subscribeToDeadlines({
      isAdminMode,
      onData: (rows) => {
        setDeadlines(rows);
        setIsLoading(false);
      },
      onError: (msg) => {
        setFirestoreError(msg);
        setIsLoading(false);
      },
    });
    return () => unsub();
  }, [isAdminMode]);

  // Subscribe to Admin-only drafts & audit logs only when verified Admin Mode is active
  useEffect(() => {
    if (!isAdminMode) {
      setPendingDrafts([]);
      setAuditLogs([]);
      return;
    }
    const unsubDrafts = subscribeToDeadlineDrafts({
      isAdminMode,
      onData: setPendingDrafts,
      onError: (msg) => setFirestoreError((prev) => prev || msg),
    });
    const unsubLogs = subscribeToDeadlineAuditLogs({
      isAdminMode,
      onData: setAuditLogs,
      onError: (msg) => setFirestoreError((prev) => prev || msg),
    });
    return () => {
      unsubDrafts();
      unsubLogs();
    };
  }, [isAdminMode]);

  // Auto-match authenticated Firebase email against staff directory if no manual staff identity is set
  const activeStaffProfile = useMemo<Staff | null>(() => {
    if (selectedStaffId) {
      const explicit = staffList.find(
        (s) => (s.StaffID || s.ID || s.staff_id) === selectedStaffId
      );
      if (explicit) return explicit;
    }

    const authEmail = (currentAdmin?.email || auth.currentUser?.email || '').trim().toLowerCase();
    if (authEmail) {
      const matched = staffList.find(
        (s) => (s.Email || '').trim().toLowerCase() === authEmail
      );
      if (matched) return matched;
    }

    return null;
  }, [selectedStaffId, staffList, currentAdmin]);

  const handleSelectStaffIdentity = (staffId: string) => {
    setSelectedStaffId(staffId);
    if (typeof window !== 'undefined') {
      if (staffId) localStorage.setItem(STAFF_IDENTITY_STORAGE_KEY, staffId);
      else localStorage.removeItem(STAFF_IDENTITY_STORAGE_KEY);
    }
  };

  // Enrich each deadline with dynamic Asia/Kuala_Lumpur computed status
  const enrichedDeadlines = useMemo(() => {
    return deadlines.map((dl) => {
      const computedStatus = computeDeadlineStatus(dl, now);
      const staffMatch = activeStaffProfile
        ? matchesStaffDeadlines(dl, activeStaffProfile)
        : { isPersonalMatch: false, isDepartmentMatch: false };
      return {
        record: dl,
        computedStatus,
        isPersonalMatch: staffMatch.isPersonalMatch,
        isDepartmentMatch: staffMatch.isDepartmentMatch,
      };
    });
  }, [deadlines, now, activeStaffProfile]);

  // KPI Counters
  const metrics = useMemo(() => {
    let activeCount = 0;
    let dueTodayCount = 0;
    let upcomingCount = 0;
    let expiredCount = 0;
    let archivedCount = 0;
    let inactiveCount = 0;

    for (const item of enrichedDeadlines) {
      if (item.computedStatus === 'DUE_TODAY') {
        activeCount++;
        dueTodayCount++;
      } else if (item.computedStatus === 'UPCOMING') {
        activeCount++;
        upcomingCount++;
      } else if (item.computedStatus === 'EXPIRED') {
        expiredCount++;
      } else if (item.computedStatus === 'ARCHIVED') {
        archivedCount++;
      } else if (item.computedStatus === 'INACTIVE') {
        inactiveCount++;
      }
    }

    return {
      activeCount,
      dueTodayCount,
      upcomingCount,
      expiredCount,
      archivedCount,
      inactiveCount,
    };
  }, [enrichedDeadlines]);

  const effectiveSearch = (localSearch || globalSearchQuery).trim().toLowerCase();

  // Apply filter tab, category, and search query
  const filteredDeadlines = useMemo(() => {
    const rows = enrichedDeadlines.filter((item) => {
      const { record, computedStatus, isPersonalMatch, isDepartmentMatch } = item;

      // Never show INACTIVE records outside the Admin Inactive tab
      if (!isAdminMode && computedStatus === 'INACTIVE') {
        return false;
      }

      if (activeFilter === 'all') {
        if (computedStatus === 'ARCHIVED' || computedStatus === 'INACTIVE') return false;
      } else if (activeFilter === 'my_deadlines') {
        if (computedStatus === 'ARCHIVED' || computedStatus === 'INACTIVE') return false;
        if (!activeStaffProfile || !isPersonalMatch) return false;
      } else if (activeFilter === 'my_department') {
        if (computedStatus === 'ARCHIVED' || computedStatus === 'INACTIVE') return false;
        if (!activeStaffProfile || !isDepartmentMatch) return false;
      } else if (activeFilter === 'due_today') {
        if (computedStatus !== 'DUE_TODAY') return false;
      } else if (activeFilter === 'upcoming') {
        if (computedStatus !== 'UPCOMING') return false;
      } else if (activeFilter === 'expired') {
        if (computedStatus !== 'EXPIRED') return false;
      } else if (activeFilter === 'archived') {
        if (computedStatus !== 'ARCHIVED') return false;
      } else if (activeFilter === 'inactive') {
        if (computedStatus !== 'INACTIVE') return false;
      }

      if (selectedCategory !== 'Semua' && record.category !== selectedCategory) {
        return false;
      }

      if (effectiveSearch) {
        const haystack = [
          record.title,
          record.description,
          record.requiredAction,
          record.category,
          record.instructions,
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

    // Sort: DUE_TODAY first, then UPCOMING (nearest dueDate first), then EXPIRED/ARCHIVED
    const priorityWeight: Record<DeadlineComputedStatus, number> = {
      DUE_TODAY: 1,
      UPCOMING: 2,
      EXPIRED: 3,
      INACTIVE: 4,
      ARCHIVED: 5,
    };

    return rows.sort((a, b) => {
      const pw = priorityWeight[a.computedStatus] - priorityWeight[b.computedStatus];
      if (pw !== 0) return pw;
      if (a.computedStatus === 'EXPIRED' || a.computedStatus === 'ARCHIVED') {
        return (b.record.dueDate || '').localeCompare(a.record.dueDate || '');
      }
      const dc = (a.record.dueDate || '9999-12-31').localeCompare(
        b.record.dueDate || '9999-12-31'
      );
      if (dc !== 0) return dc;
      return (a.record.dueTime || '23:59').localeCompare(b.record.dueTime || '23:59');
    });
  }, [
    enrichedDeadlines,
    activeFilter,
    selectedCategory,
    effectiveSearch,
    isAdminMode,
    activeStaffProfile,
  ]);

  const activePendingDraftCount = useMemo(
    () =>
      pendingDrafts.filter((d) => d.reviewStatus === 'pending' || d.reviewStatus === 'approved')
        .length,
    [pendingDrafts]
  );

  const klNowParts = useMemo(() => getKualaLumpurNowParts(now), [now]);

  const handleStatusChange = async (
    record: DeadlineRecord,
    nextStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  ) => {
    try {
      setActionFeedback(null);
      await changeDeadlineStoredStatus({ deadline: record, nextStatus });
      if (detailRecord?.id === record.id) {
        setDetailRecord({ ...record, status: nextStatus });
      }
      setActionFeedback({
        type: 'success',
        text: `Status "${record.title}" ditukar kepada ${nextStatus}.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Gagal mengubah status rekod.',
      });
    }
  };

  const handleSaveManualEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    const original = deadlines.find((d) => d.id === editingRecord.id);
    if (!original) return;

    const validation = validateDeadlineCandidate(editingRecord);
    if (!validation.valid) {
      setActionFeedback({ type: 'error', text: validation.errors.join(' ') });
      return;
    }

    try {
      setIsSavingEdit(true);
      setActionFeedback(null);
      await updatePublishedDeadline({
        existing: original,
        updates: editingRecord,
        reason: editReason.trim() || undefined,
      });
      setEditingRecord(null);
      setEditReason('');
      setActionFeedback({
        type: 'success',
        text: `Rekod "${editingRecord.title}" berjaya dikemas kini.`,
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Gagal mengemas kini rekod.',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setActionFeedback(null);
      await deletePublishedDeadline(deleteTarget);
      if (detailRecord?.id === deleteTarget.id) setDetailRecord(null);
      setActionFeedback({
        type: 'success',
        text: `Rekod "${deleteTarget.title}" telah dipadam secara kekal.`,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Gagal memadam rekod.',
      });
    }
  };

  const handleLoadProtectedEvidence = async (path: string) => {
    try {
      const url = await getProtectedSourceEvidenceUrl(path);
      setEvidenceSignedUrls((prev) => ({ ...prev, [path]: url }));
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Gagal memuatkan bukti sumber.',
      });
    }
  };

  const detailRecordAuditLogs = useMemo(() => {
    if (!detailRecord) return [];
    return auditLogs.filter((l) => l.deadlineId === detailRecord.id);
  }, [detailRecord, auditLogs]);

  return (
    <div className="space-y-4 sm:space-y-5 text-left">
      {/* Header Panel */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-white/70 bg-white/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
                  SYNCROZZ DEADLINE HUB
                </h2>
                <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg tabular-nums">
                  MYT {klNowParts.dateStr} • {klNowParts.timeStr.slice(0, 5)}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium">
                Pusat pengurusan tarikh akhir dan tindakan rasmi warga KPMBP secara berpusat.
              </p>
            </div>
          </div>

          {isAdminMode && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCaptureInitialTab('upload');
                  setIsCaptureModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer shadow-sm transition-all whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Deadline Capture</span>
              </button>

              {activePendingDraftCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCaptureInitialTab('queue');
                    setIsCaptureModalOpen(true);
                  }}
                  className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Draf Semakan ({activePendingDraftCount})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAuditDrawerOpen(true)}
                className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Log Audit ({auditLogs.length})</span>
              </button>
            </div>
          )}
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-4 pt-4 border-t border-slate-100">
          {[
            {
              key: 'all' as DeadlineFilterTab,
              label: 'Tarikh Akhir Aktif',
              count: metrics.activeCount,
              tone: 'text-indigo-700 bg-indigo-50/70 border-indigo-200/80',
            },
            {
              key: 'due_today' as DeadlineFilterTab,
              label: 'Tamat Hari Ini',
              count: metrics.dueTodayCount,
              tone: 'text-rose-700 bg-rose-50/70 border-rose-200/80',
            },
            {
              key: 'upcoming' as DeadlineFilterTab,
              label: 'Akan Datang',
              count: metrics.upcomingCount,
              tone: 'text-emerald-700 bg-emerald-50/70 border-emerald-200/80',
            },
            {
              key: 'expired' as DeadlineFilterTab,
              label: 'Tamat Tempoh',
              count: metrics.expiredCount,
              tone: 'text-slate-700 bg-slate-50 border-slate-200',
            },
            {
              key: 'archived' as DeadlineFilterTab,
              label: 'Rekod Arkib',
              count: metrics.archivedCount,
              tone: 'text-amber-800 bg-amber-50/70 border-amber-200/80',
            },
          ].map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              onClick={() => setActiveFilter(kpi.key)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                activeFilter === kpi.key
                  ? 'ring-2 ring-indigo-500/30 shadow-xs ' + kpi.tone
                  : 'bg-white/90 border-slate-200/80 hover:border-slate-300'
              }`}
            >
              <span className="text-[11px] font-bold text-slate-500 block truncate">
                {kpi.label}
              </span>
              <span className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 mt-0.5 block">
                {kpi.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback & Firestore Error Notices */}
      {actionFeedback && (
        <div
          className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{actionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="cursor-pointer opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {firestoreError && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{firestoreError}</span>
        </div>
      )}

      {/* Filter & Staff Identity Bar */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border border-white/70 bg-white/95 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Primary Status / Scope Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            {(
              [
                { id: 'all', label: 'Semua Aktif' },
                { id: 'my_deadlines', label: 'Tindakan Saya' },
                { id: 'my_department', label: 'Jabatan Saya' },
                { id: 'due_today', label: 'Hari Ini' },
                { id: 'upcoming', label: 'Akan Datang' },
                { id: 'expired', label: 'Tamat Tempoh' },
                { id: 'archived', label: 'Arkib' },
                ...(isAdminMode
                  ? [{ id: 'inactive' as DeadlineFilterTab, label: `Tidak Aktif (${metrics.inactiveCount})` }]
                  : []),
              ] as Array<{ id: DeadlineFilterTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 border transition-all cursor-pointer ${
                  activeFilter === tab.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Category */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Tapis tarikh akhir..."
                className="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white focus:border-indigo-500 focus:outline-none text-xs font-semibold text-slate-800"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={selectedCategory}
                onChange={(e) =>
                  setSelectedCategory(e.target.value as 'Semua' | DeadlineCategory)
                }
                aria-label="Tapis mengikut kategori"
                className="pl-8 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none cursor-pointer"
              >
                <option value="Semua">Semua Kategori</option>
                {DEADLINE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Staff Identity Picker Bar for Personalized Filtering */}
        <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 min-w-0">
            <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-bold shrink-0">Identiti Staf:</span>
            {activeStaffProfile ? (
              <span className="font-semibold text-slate-800 truncate">
                {activeStaffProfile.Nama}{' '}
                <span className="text-slate-400 font-normal">
                  ({activeStaffProfile.Unit || activeStaffProfile.Bahagian || '-'})
                </span>
              </span>
            ) : (
              <span className="text-slate-400">
                Pilih profil anda untuk tapisan "Tindakan Saya" & "Jabatan Saya"
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedStaffId || activeStaffProfile?.StaffID || activeStaffProfile?.ID || ''}
              onChange={(e) => handleSelectStaffIdentity(e.target.value)}
              aria-label="Pilih identiti staf"
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-800 max-w-[260px] cursor-pointer"
            >
              <option value="">-- Pilih Nama Staf / Pensyarah --</option>
              {staffList.map((stf) => {
                const sid = stf.StaffID || stf.ID;
                return (
                  <option key={sid} value={sid}>
                    {stf.Nama} ({stf.Unit || stf.Bahagian})
                  </option>
                );
              })}
            </select>

            {(activeFilter !== 'all' || selectedCategory !== 'Semua' || localSearch) && (
              <button
                type="button"
                onClick={() => {
                  setActiveFilter('all');
                  setSelectedCategory('Semua');
                  setLocalSearch('');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Set Semula</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Deadlines Grid */}
      {isLoading ? (
        <div className="glass-panel rounded-3xl p-12 text-center bg-white/80 border border-slate-100">
          <Loader2 className="w-7 h-7 animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">Memuatkan rekod tarikh akhir...</p>
        </div>
      ) : (activeFilter === 'my_deadlines' || activeFilter === 'my_department') &&
        !activeStaffProfile ? (
        <div className="glass-panel rounded-3xl p-10 text-center max-w-lg mx-auto bg-white/85 border border-slate-200/80 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Pilih Profil Staf Anda Terlebih Dahulu
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Gunakan pemilih "Identiti Staf" di atas untuk memadankan rekod dengan nama serta bahagian/unit anda secara automatik.
          </p>
        </div>
      ) : filteredDeadlines.length === 0 ? (
        <div className="glass-panel rounded-3xl p-10 sm:p-12 text-center max-w-lg mx-auto bg-white/85 border border-slate-200/80 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <CalendarClock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Tiada rekod tarikh akhir ditemui
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {deadlines.length === 0
              ? 'Belum ada tarikh akhir diterbitkan dalam Syncrozz Deadline Hub.'
              : 'Tiada tarikh akhir yang sepadan dengan tapisan atau kata kunci semasa.'}
          </p>
          {isAdminMode && deadlines.length === 0 && (
            <button
              type="button"
              onClick={() => {
                setCaptureInitialTab('upload');
                setIsCaptureModalOpen(true);
              }}
              className="mt-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Tambah Melalui AI Deadline Capture</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDeadlines.map(({ record, computedStatus }) => {
            const meta = STATUS_META[computedStatus];
            const countdown = formatDeadlineCountdown(
              record.dueDate,
              record.dueTime,
              record.status,
              now
            );
            const targetSummary = [
              ...(record.targetDepartments || []),
              ...(record.targetAudience || []),
            ]
              .filter(Boolean)
              .slice(0, 3)
              .join(' • ');

            return (
              <article
                key={record.id}
                className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/80 bg-white/95 flex flex-col justify-between gap-4 shadow-2xs"
              >
                <div className="space-y-3">
                  {/* Top Row: Category text + Single Status Badge */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
                      {record.category}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold border shrink-0 ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {/* Title & Short Description */}
                  <div className="space-y-1">
                    <h3 className="text-sm sm:text-[15px] font-extrabold text-slate-900 leading-snug line-clamp-2">
                      {record.title}
                    </h3>
                    {record.description && (
                      <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                        {record.description}
                      </p>
                    )}
                  </div>

                  {/* Required Action Callout */}
                  {record.requiredAction && (
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-700">
                      <span className="font-bold text-slate-900">Tindakan: </span>
                      <span>{record.requiredAction}</span>
                    </div>
                  )}

                  {/* Metadata Lines (Clean inline text, zero badge clutter) */}
                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {formatDueDateDisplay(record.dueDate)} •{' '}
                        {formatDueTimeDisplay(record.dueTime)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className={`font-extrabold font-mono tabular-nums ${meta.textClass}`}>
                        {countdown}
                      </span>
                    </div>

                    {(targetSummary || (record.targetStaffIds || []).length > 0) && (
                      <div className="flex items-start gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-1">
                          {targetSummary || `${record.targetStaffIds.length} staf dikenal pasti`}
                        </span>
                      </div>
                    )}

                    {(record.attachments || []).length > 0 && (
                      <div className="flex items-center gap-2 text-slate-500">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span>{record.attachments.length} dokumen sokongan</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer: Action Button + Details + Admin Quick Controls */}
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex items-center gap-2">
                    {record.actionUrl && (
                      <a
                        href={record.actionUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <span className="truncate">
                          {record.actionLabel || 'Buka Pautan Tindakan'}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() => setDetailRecord(record)}
                      className={`px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer whitespace-nowrap ${
                        record.actionUrl ? 'shrink-0' : 'flex-1'
                      }`}
                    >
                      Lihat Butiran
                    </button>
                  </div>

                  {isAdminMode && (
                    <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px]">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRecord({ ...record });
                            setEditReason('');
                          }}
                          title="Sunting rekod"
                          className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-indigo-700 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>

                        {record.status === 'ARCHIVED' ? (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(record, 'ACTIVE')}
                            title="Pulihkan daripada arkib"
                            className="px-2 py-1 rounded-lg hover:bg-emerald-50 text-emerald-700 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <ArchiveRestore className="w-3 h-3" />
                            <span>Pulih</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(record, 'ARCHIVED')}
                            title="Arkibkan rekod"
                            className="px-2 py-1 rounded-lg hover:bg-amber-50 text-amber-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Archive className="w-3 h-3" />
                            <span>Arkib</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            handleStatusChange(
                              record,
                              record.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE'
                            )
                          }
                          title={record.status === 'INACTIVE' ? 'Aktifkan' : 'Nyahaktifkan'}
                          className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-600 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          {record.status === 'INACTIVE' ? (
                            <>
                              <Eye className="w-3 h-3" />
                              <span>Aktifkan</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3 h-3" />
                              <span>Nyahaktif</span>
                            </>
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(record)}
                        title="Padam rekod"
                        className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {detailRecord && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setDetailRecord(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-700">
                    {detailRecord.category}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                      STATUS_META[computeDeadlineStatus(detailRecord, now)].badgeClass
                    }`}
                  >
                    {STATUS_META[computeDeadlineStatus(detailRecord, now)].label}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  {detailRecord.title}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                <div>
                  <span className="text-slate-400 font-bold block">Tarikh & Masa Akhir (MYT)</span>
                  <span className="font-extrabold text-slate-900 tabular-nums">
                    {formatDueDateDisplay(detailRecord.dueDate)} •{' '}
                    {formatDueTimeDisplay(detailRecord.dueTime)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block">Baki Masa</span>
                  <span className="font-extrabold font-mono text-indigo-700 tabular-nums">
                    {formatDeadlineCountdown(
                      detailRecord.dueDate,
                      detailRecord.dueTime,
                      detailRecord.status,
                      now
                    )}
                  </span>
                </div>
              </div>

              {detailRecord.description && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Penerangan
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                    {detailRecord.description}
                  </p>
                </div>
              )}

              {detailRecord.requiredAction && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-indigo-800 mb-1">
                    Tindakan Diperlukan
                  </h4>
                  <p className="text-xs sm:text-sm font-semibold text-indigo-950">
                    {detailRecord.requiredAction}
                  </p>
                </div>
              )}

              {detailRecord.instructions && (
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Arahan Langkah Demi Langkah
                  </h4>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                    {detailRecord.instructions}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-2xl border border-slate-200/80">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    Jabatan / Unit Terlibat
                  </span>
                  <p className="text-slate-600">
                    {(detailRecord.targetDepartments || []).length > 0
                      ? detailRecord.targetDepartments.join(', ')
                      : (detailRecord.targetAudience || []).join(', ') || 'Semua warga KPMBP'}
                  </p>
                </div>

                <div className="p-3 rounded-2xl border border-slate-200/80">
                  <span className="font-extrabold text-slate-700 flex items-center gap-1.5 mb-1">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Staf Khusus Terlibat
                  </span>
                  <p className="text-slate-600">
                    {(detailRecord.targetStaffIds || []).length > 0
                      ? detailRecord.targetStaffIds
                          .map((sid) => {
                            const match = staffList.find((s) => (s.StaffID || s.ID) === sid);
                            return match ? `${match.Nama} (${sid})` : sid;
                          })
                          .join(', ')
                      : 'Mengikut audiens / jabatan sasaran'}
                  </p>
                </div>
              </div>

              {(detailRecord.attachments || []).length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Dokumen Sokongan
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detailRecord.attachments.map((att, idx) => (
                      <a
                        key={`${att.url}_${idx}`}
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 text-xs font-bold text-indigo-700 inline-flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{att.name}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Admin-Only Protected Source Evidence & Record Audit Trail */}
              {isAdminMode && (
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                    <div className="font-extrabold text-slate-800">
                      Bukti Sumber & Kebolehkesanan (Master Admin Sahaja)
                    </div>
                    <p className="text-slate-600">
                      Sumber: <span className="font-bold">{detailRecord.sourceType}</span> •
                      Dicipta oleh <span className="font-mono">{detailRecord.createdBy}</span>
                    </p>
                    {detailRecord.sourceSummary && (
                      <p className="text-slate-600 italic bg-white p-2.5 rounded-xl border border-slate-200">
                        "{detailRecord.sourceSummary}"
                      </p>
                    )}
                    {(detailRecord.sourceEvidencePaths || []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {detailRecord.sourceEvidencePaths!.map((path, i) =>
                          evidenceSignedUrls[path] ? (
                            <a
                              key={path}
                              href={evidenceSignedUrls[path]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-bold"
                            >
                              Buka Bukti Sumber #{i + 1}
                            </a>
                          ) : (
                            <button
                              key={path}
                              type="button"
                              onClick={() => handleLoadProtectedEvidence(path)}
                              className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-bold text-slate-700 cursor-pointer"
                            >
                              Papar Bukti Sumber #{i + 1}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>

                  {detailRecordAuditLogs.length > 0 && (
                    <div className="space-y-2 text-xs">
                      <h4 className="font-extrabold text-slate-700 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-slate-500" />
                        Sejarah Audit Rekod ({detailRecordAuditLogs.length})
                      </h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {detailRecordAuditLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-indigo-700">{log.action}</span>
                              <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                                {new Date(log.performedAt).toLocaleString('ms-MY')}
                              </span>
                            </div>
                            {log.reason && <p className="text-slate-600">{log.reason}</p>}
                            {log.previousValues?.dueDate && log.updatedValues?.dueDate && (
                              <p className="font-mono text-[11px] text-slate-700">
                                {log.previousValues.dueDate} {log.previousValues.dueTime || ''} →{' '}
                                <span className="font-bold text-emerald-700">
                                  {log.updatedValues.dueDate} {log.updatedValues.dueTime || ''}
                                </span>
                              </p>
                            )}
                            <p className="text-[11px] text-slate-400">Oleh: {log.performedBy}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {detailRecord.actionUrl && (
              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end">
                <a
                  href={detailRecord.actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold inline-flex items-center gap-2"
                >
                  <span>{detailRecord.actionLabel || 'Buka Pautan Tindakan'}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin Quick Manual Edit Modal */}
      {editingRecord && isAdminMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => setEditingRecord(null)}
        >
          <form
            onSubmit={handleSaveManualEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 text-left text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                Sunting Rekod Tarikh Akhir
              </h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Tajuk *</label>
                <input
                  type="text"
                  required
                  value={editingRecord.title}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, title: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Tarikh Akhir *</label>
                <input
                  type="date"
                  required
                  value={editingRecord.dueDate}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, dueDate: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Masa Akhir (Pilihan)</label>
                <input
                  type="time"
                  value={editingRecord.dueTime}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, dueTime: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Kategori</label>
                <select
                  value={editingRecord.category}
                  onChange={(e) =>
                    setEditingRecord({
                      ...editingRecord,
                      category: e.target.value as DeadlineCategory,
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                >
                  {DEADLINE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pautan Tindakan</label>
                <input
                  type="url"
                  value={editingRecord.actionUrl}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, actionUrl: e.target.value })
                  }
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Tindakan Diperlukan</label>
                <input
                  type="text"
                  value={editingRecord.requiredAction}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, requiredAction: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Sebab Kemaskini (Untuk Rekod Audit)
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Contoh: Pindaan tarikh baharu mengikut memo terbaharu"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Simpan Perubahan</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 text-center space-y-4"
            role="alertdialog"
            aria-modal="true"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">Padam Tarikh Akhir?</h3>
              <p className="text-xs text-slate-600">
                Rekod <span className="font-bold">"{deleteTarget.title}"</span> akan dipadam secara kekal dan tindakan ini akan direkod dalam log audit.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Ya, Padam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Global Audit History Modal */}
      {isAuditDrawerOpen && isAdminMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
          onClick={() => setIsAuditDrawerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col overflow-hidden text-left"
          >
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Log Audit Deadline Hub ({auditLogs.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditDrawerOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5 text-xs">
              {auditLogs.length === 0 ? (
                <p className="text-center text-slate-500 py-8">
                  Belum ada aktiviti audit direkodkan.
                </p>
              ) : (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900">{log.deadlineTitle}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold">
                        {log.action}
                      </span>
                    </div>
                    {log.reason && <p className="text-slate-600">{log.reason}</p>}
                    {log.previousValues?.dueDate && log.updatedValues?.dueDate && (
                      <p className="font-mono text-[11px] text-slate-700">
                        Tarikh sebelumnya: {log.previousValues.dueDate}{' '}
                        {log.previousValues.dueTime || ''} → Baharu: {log.updatedValues.dueDate}{' '}
                        {log.updatedValues.dueTime || ''}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                      <span>Pentadbir: {log.performedBy}</span>
                      <span className="font-mono tabular-nums">
                        {new Date(log.performedAt).toLocaleString('ms-MY')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* AI Deadline Capture & Admin Review Modal */}
      {isAdminMode && (
        <AiDeadlineCaptureModal
          isOpen={isCaptureModalOpen}
          onClose={() => setIsCaptureModalOpen(false)}
          existingDeadlines={deadlines}
          pendingDrafts={pendingDrafts}
          staffList={staffList}
          adminEmail={currentAdmin?.email || auth.currentUser?.email || 'admin'}
          initialTab={captureInitialTab}
        />
      )}
    </div>
  );
};

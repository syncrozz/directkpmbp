/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — DEADLINE HUB (Announcement & Deadline Listing)
 * Official KPMBP Announcement & Deadline Listing with Master Admin Management
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  ArchiveRestore,
  Building2,
  CalendarClock,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  History,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  AuthorizedAdmin,
  DeadlineAuditLog,
  DeadlineCategory,
  DeadlineDraft,
  DeadlineRecord,
  Staff,
} from '../types';
import { auth } from '../config/firebase';
import {
  DEADLINE_CATEGORIES,
  DEADLINE_TIMEZONE,
  DeadlineDisplayStatus,
  DeadlineFilterTab,
  filterAndSortDeadlines,
  formatDeadlineCountdown,
  formatDueDateDisplay,
  formatDueTimeDisplay,
  formatKLDateTimeDisplay,
  getKualaLumpurNowParts,
  getOriginalPublishedAt,
  isDeadlineUpdated,
  isValidIsoDate,
  resolveDeadlineDisplayStatus,
  validateDeadlineCandidate,
} from '../utils/deadlineStatus';
import {
  changeDeadlineStoredStatus,
  createManualDeadline,
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

const FILTER_TABS: Array<{
  id: DeadlineFilterTab;
  label: string;
  heading: string;
}> = [
  {
    id: 'all',
    label: 'Semua',
    heading: 'Pengumuman & Tarikh Akhir',
  },
  {
    id: 'latest',
    label: 'Deadline Terkini',
    heading: 'Deadline Terkini',
  },
  {
    id: 'due_today',
    label: 'Hari Ini',
    heading: 'Tamat Hari Ini',
  },
  {
    id: 'upcoming',
    label: 'Akan Datang',
    heading: 'Akan Datang',
  },
  {
    id: 'updated',
    label: 'Telah Dikemas Kini',
    heading: 'Telah Dikemas Kini',
  },
  {
    id: 'archived',
    label: 'Arkib',
    heading: 'Rekod Arkib',
  },
];

const STATUS_META: Record<
  DeadlineDisplayStatus,
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
  ACTIVE: {
    label: 'Aktif',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    textClass: 'text-emerald-700',
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

  // Search & Filter State
  const [activeFilter, setActiveFilter] = useState<DeadlineFilterTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<'Semua' | DeadlineCategory>('Semua');
  const [localSearch, setLocalSearch] = useState('');

  // Ensure ordinary staff never remain on Admin-only 'inactive' filter
  useEffect(() => {
    if (!isAdminMode && activeFilter === 'inactive') {
      setActiveFilter('all');
    }
  }, [isAdminMode, activeFilter]);

  useEffect(() => {
    setOpenMenuId(null);
  }, [activeFilter, selectedCategory, localSearch, globalSearchQuery]);

  // Modals & Drawers
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [captureInitialTab, setCaptureInitialTab] = useState<'upload' | 'paste' | 'queue'>('paste');
  const [detailRecord, setDetailRecord] = useState<DeadlineRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<DeadlineRecord | null>(null);
  const [isCreatingManual, setIsCreatingManual] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [modalStaffSearch, setModalStaffSearch] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeadlineRecord | null>(null);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [evidenceSignedUrls, setEvidenceSignedUrls] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const copyTimerRef = useRef<number | null>(null);
  const handledDeepLinkRef = useRef(false);

  const canCopyAnnouncementLink =
    typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openMenuId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(`[data-deadline-menu-root="${openMenuId}"]`)) {
        return;
      }
      setOpenMenuId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        const closingId = openMenuId;
        setOpenMenuId(null);
        menuTriggerRefs.current[closingId]?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  // Lock background page scroll and support Escape key while the announcement detail modal is open
  useEffect(() => {
    if (!detailRecord || typeof document === 'undefined' || typeof window === 'undefined') return;

    const savedScrollY = window.scrollY;
    const htmlEl = document.documentElement;
    const bodyEl = document.body;

    const prevHtmlOverflow = htmlEl.style.overflow;
    const prevBodyOverflow = bodyEl.style.overflow;
    const prevBodyPosition = bodyEl.style.position;
    const prevBodyTop = bodyEl.style.top;
    const prevBodyLeft = bodyEl.style.left;
    const prevBodyRight = bodyEl.style.right;
    const prevBodyWidth = bodyEl.style.width;
    const prevBodyOverscroll = bodyEl.style.overscrollBehavior;

    htmlEl.style.overflow = 'hidden';
    bodyEl.style.overflow = 'hidden';
    bodyEl.style.position = 'fixed';
    bodyEl.style.top = `-${savedScrollY}px`;
    bodyEl.style.left = '0';
    bodyEl.style.right = '0';
    bodyEl.style.width = '100%';
    bodyEl.style.overscrollBehavior = 'none';

    const handleDetailEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !editingRecord && !deleteTarget && !isAuditDrawerOpen && !isCaptureModalOpen) {
        event.preventDefault();
        setDetailRecord(null);
      }
    };

    document.addEventListener('keydown', handleDetailEscape);
    return () => {
      htmlEl.style.overflow = prevHtmlOverflow;
      bodyEl.style.overflow = prevBodyOverflow;
      bodyEl.style.position = prevBodyPosition;
      bodyEl.style.top = prevBodyTop;
      bodyEl.style.left = prevBodyLeft;
      bodyEl.style.right = prevBodyRight;
      bodyEl.style.width = prevBodyWidth;
      bodyEl.style.overscrollBehavior = prevBodyOverscroll;
      document.removeEventListener('keydown', handleDetailEscape);
      window.scrollTo(0, savedScrollY);
    };
  }, [detailRecord, editingRecord, deleteTarget, isAuditDrawerOpen, isCaptureModalOpen]);

  useEffect(() => {
    if (handledDeepLinkRef.current || isLoading || deadlines.length === 0) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const targetId = params.get('deadline')?.trim();
    if (!targetId) {
      handledDeepLinkRef.current = true;
      return;
    }
    const matched = deadlines.find((d) => d.id === targetId);
    if (matched) {
      setDetailRecord(matched);
    }
    handledDeepLinkRef.current = true;
  }, [isLoading, deadlines]);

  const handleCopyAnnouncementLink = async (record: DeadlineRecord) => {
    if (!canCopyAnnouncementLink || typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/deadline?deadline=${encodeURIComponent(record.id)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLinkId(record.id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedLinkId((prev) => (prev === record.id ? null : prev));
      }, 2000);
    } catch {
      setActionFeedback({
        type: 'error',
        text: 'Tidak dapat menyalin pautan pengumuman ke papan keratan.',
      });
    }
  };

  const availableDepartments = useMemo(() => {
    const set = new Set<string>([
      'Pengurusan',
      'Akademik',
      'Sokongan Akademik',
      'Pentadbiran',
      'HEA',
      'HEP',
    ]);
    staffList.forEach((s) => {
      if (s.Bahagian?.trim()) set.add(s.Bahagian.trim());
      if (s.Unit?.trim()) set.add(s.Unit.trim());
      if (s.DepartmentID?.trim()) set.add(s.DepartmentID.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [staffList]);

  const openCreateManualModal = () => {
    const adminEmail = (currentAdmin?.email || auth.currentUser?.email || 'admin').toLowerCase();
    const nowIso = new Date().toISOString();
    setIsCreatingManual(true);
    setEditReason('');
    setModalStaffSearch('');
    setEditingRecord({
      id: '',
      title: '',
      description: '',
      requiredAction: '',
      category: 'Akademik',
      targetAudience: [],
      targetDepartments: [],
      targetStaffIds: [],
      dueDate: klNowParts.dateStr,
      dueTime: '',
      timezone: DEADLINE_TIMEZONE,
      actionUrl: '',
      actionLabel: '',
      attachments: [],
      instructions: '',
      status: 'ACTIVE',
      isPublished: true,
      sourceType: 'PASTED_TEXT',
      createdAt: nowIso,
      createdBy: adminEmail,
      updatedAt: nowIso,
      updatedBy: adminEmail,
    });
  };

  // Subscribe to published deadlines (for all staff) OR all deadlines (for verified Master Admin)
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

  const effectiveSearch = (localSearch || globalSearchQuery).trim();

  const filteredDeadlines = useMemo(
    () =>
      filterAndSortDeadlines({
        deadlines,
        activeFilter,
        selectedCategory,
        searchQuery: effectiveSearch,
        isAdminMode,
        now,
      }),
    [deadlines, activeFilter, selectedCategory, effectiveSearch, isAdminMode, now]
  );

  const inactiveCount = useMemo(() => {
    if (!isAdminMode) return 0;
    return deadlines.filter((d) => resolveDeadlineDisplayStatus(d, now).displayStatus === 'INACTIVE')
      .length;
  }, [deadlines, isAdminMode, now]);

  const activePendingDraftCount = useMemo(
    () =>
      pendingDrafts.filter((d) => d.reviewStatus === 'pending' || d.reviewStatus === 'approved')
        .length,
    [pendingDrafts]
  );

  const klNowParts = useMemo(() => getKualaLumpurNowParts(now), [now]);

  const activeSectionHeading = useMemo(() => {
    if (activeFilter === 'inactive') return 'Rekod Tidak Aktif (Admin)';
    return (
      FILTER_TABS.find((t) => t.id === activeFilter)?.heading ||
      'Pengumuman & Tarikh Akhir'
    );
  }, [activeFilter]);

  const handleStatusChange = async (
    record: DeadlineRecord,
    nextStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
  ) => {
    try {
      setActionFeedback(null);
      await changeDeadlineStoredStatus({ deadline: record, nextStatus });
      if (detailRecord?.id === record.id) {
        setDetailRecord({ ...record, status: nextStatus, updatedAt: new Date().toISOString() });
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

    const validation = validateDeadlineCandidate(editingRecord);
    if (!validation.valid) {
      setActionFeedback({ type: 'error', text: validation.errors.join(' ') });
      return;
    }

    if (isCreatingManual) {
      try {
        setIsSavingEdit(true);
        setActionFeedback(null);
        await createManualDeadline({
          record: {
            title: editingRecord.title,
            description: editingRecord.description,
            requiredAction: editingRecord.requiredAction,
            category: editingRecord.category,
            targetAudience: editingRecord.targetAudience,
            targetDepartments: editingRecord.targetDepartments,
            targetStaffIds: editingRecord.targetStaffIds,
            dueDate: editingRecord.dueDate,
            dueTime: editingRecord.dueTime,
            actionUrl: editingRecord.actionUrl,
            actionLabel: editingRecord.actionLabel,
            instructions: editingRecord.instructions,
          },
          reason: editReason.trim() || undefined,
        });
        setEditingRecord(null);
        setIsCreatingManual(false);
        setEditReason('');
        setModalStaffSearch('');
        setActionFeedback({
          type: 'success',
          text: `Tarikh akhir "${editingRecord.title}" berjaya dicipta dan diterbitkan.`,
        });
      } catch (err: any) {
        setActionFeedback({
          type: 'error',
          text: err?.message || 'Gagal mencipta rekod tarikh akhir.',
        });
      } finally {
        setIsSavingEdit(false);
      }
      return;
    }

    const original = deadlines.find((d) => d.id === editingRecord.id);
    if (!original) return;

    try {
      setIsSavingEdit(true);
      setActionFeedback(null);
      await updatePublishedDeadline({
        existing: original,
        updates: editingRecord,
        reason: editReason.trim() || undefined,
      });
      if (detailRecord?.id === editingRecord.id) {
        setDetailRecord({ ...editingRecord, updatedAt: new Date().toISOString() });
      }
      setEditingRecord(null);
      setIsCreatingManual(false);
      setEditReason('');
      setModalStaffSearch('');
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
    <div className="space-y-4 text-left">
      {/* A. Page Header */}
      <section className="glass-panel rounded-2xl sm:rounded-3xl px-4 py-4 sm:px-6 sm:py-5 border border-white/70 bg-white/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span className="text-indigo-700 font-semibold">Paparan Warga KPMBP</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {klNowParts.dateStr} {klNowParts.timeStr.slice(0, 5)}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              DEADLINE
            </h2>
          </div>

          {isAdminMode && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openCreateManualModal}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Manual</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCaptureInitialTab('paste');
                  setIsCaptureModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI Deadline Capture</span>
              </button>

              {activePendingDraftCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCaptureInitialTab('queue');
                    setIsCaptureModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Draf Semakan {activePendingDraftCount}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsAuditDrawerOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <History className="w-3.5 h-3.5 text-slate-500" />
                <span>Log Audit {auditLogs.length}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Feedback & Firestore Error Notices */}
      {actionFeedback && (
        <div
          className={`px-4 py-3 rounded-2xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span className="min-w-0 break-words">{actionFeedback.text}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            aria-label="Tutup notis"
            className="cursor-pointer opacity-70 hover:opacity-100 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {firestoreError && (
        <div className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{firestoreError}</span>
        </div>
      )}

      {/* B. Search Bar & C. Filter Navigation */}
      <section className="glass-panel rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 border border-white/70 bg-white/95 shadow-xs space-y-3">
        {/* B. Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="Cari tajuk pengumuman, penerangan, arahan atau kata kunci..."
              aria-label="Cari pengumuman dan tarikh akhir"
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:outline-none text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                aria-label="Kosongkan carian"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedCategory}
              onChange={(e) =>
                setSelectedCategory(e.target.value as 'Semua' | DeadlineCategory)
              }
              aria-label="Tapis mengikut kategori"
              className="w-full sm:w-auto pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none cursor-pointer"
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

        {/* C. Filter Navigation */}
        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
          <nav
            aria-label="Penapis senarai tarikh akhir"
            className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5 min-w-0"
          >
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id)}
                  aria-pressed={isActive}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}

            {isAdminMode && (
              <button
                type="button"
                onClick={() => setActiveFilter('inactive')}
                aria-pressed={activeFilter === 'inactive'}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                  activeFilter === 'inactive'
                    ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                Tidak Aktif {inactiveCount}
              </button>
            )}
          </nav>

          {(activeFilter !== 'all' || selectedCategory !== 'Semua' || localSearch) && (
            <button
              type="button"
              onClick={() => {
                setActiveFilter('all');
                setSelectedCategory('Semua');
                setLocalSearch('');
              }}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Set Semula</span>
            </button>
          )}
        </div>
      </section>

      {/* D. Main Content — Deadline Listing */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 px-1">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
            {activeSectionHeading}
          </h3>
          {!isLoading && (
            <span className="text-xs font-medium text-slate-500 tabular-nums shrink-0">
              {filteredDeadlines.length} pengumuman
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="glass-panel rounded-2xl p-10 text-center bg-white/85 border border-slate-200/70">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-500">
              Memuatkan pengumuman dan tarikh akhir...
            </p>
          </div>
        ) : filteredDeadlines.length === 0 ? (
          <div className="glass-panel rounded-2xl p-8 sm:p-10 text-center max-w-lg mx-auto bg-white/90 border border-slate-200/80 space-y-2.5">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <CalendarClock className="w-5 h-5" />
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900">
              Tiada pengumuman atau tarikh akhir ditemui
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              {deadlines.length === 0
                ? 'Belum ada tarikh akhir diterbitkan dalam Deadline.'
                : activeFilter === 'updated'
                ? 'Tiada pengumuman yang dikemas kini buat masa ini.'
                : activeFilter === 'due_today'
                ? 'Tiada tarikh akhir yang jatuh pada hari ini.'
                : activeFilter === 'archived'
                ? 'Tiada rekod diarkibkan.'
                : 'Tiada rekod yang sepadan dengan tapisan atau kata kunci carian semasa.'}
            </p>
            {isAdminMode && deadlines.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setCaptureInitialTab('paste');
                  setIsCaptureModalOpen(true);
                }}
                className="mt-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tambah Melalui AI Deadline Capture</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDeadlines.map(
              ({ record, displayStatus, originalPublishedAt, isUpdated }) => {
                const meta = STATUS_META[displayStatus];
                const countdown = formatDeadlineCountdown(
                  record.dueDate,
                  record.dueTime,
                  record.status,
                  now
                );
                const publishedDateTimeLabel = formatKLDateTimeDisplay(originalPublishedAt);
                const updatedDateTimeLabel = isUpdated
                  ? formatKLDateTimeDisplay(record.updatedAt)
                  : '';
                const actionSnippet = record.requiredAction || record.instructions;
                const departments = (record.targetDepartments || []).filter(Boolean);
                const audience = (record.targetAudience || []).filter(Boolean);
                const staffTargetCount = (record.targetStaffIds || []).length;
                const attachmentsCount = (record.attachments || []).length;
                const hasTargetMetadata =
                  departments.length > 0 || audience.length > 0 || staffTargetCount > 0;
                const hasCategory = Boolean(record.category?.trim());
                const hasAnyMenuMetadata =
                  hasCategory ||
                  Boolean(publishedDateTimeLabel) ||
                  Boolean(updatedDateTimeLabel) ||
                  hasTargetMetadata ||
                  attachmentsCount > 0;
                const isMenuOpen = openMenuId === record.id;
                const isLinkCopied = copiedLinkId === record.id;

                return (
                  <article
                    key={record.id}
                    className={`glass-card relative rounded-2xl p-4 sm:p-5 border border-slate-200/80 bg-white/95 flex flex-col justify-between gap-4 shadow-2xs ${
                      isMenuOpen ? 'z-30' : 'z-0'
                    }`}
                  >
                    <div className="space-y-3.5 min-w-0">
                      {/* 1. Prominent Status Badge + Subtle Top-Right Three-Dot Overflow Menu */}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0 ${meta.badgeClass}`}
                        >
                          {meta.label}
                        </span>

                        {(hasAnyMenuMetadata || canCopyAnnouncementLink) && (
                          <div className="relative shrink-0" data-deadline-menu-root={record.id}>
                            <button
                              ref={(el) => {
                                menuTriggerRefs.current[record.id] = el;
                              }}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId((prev) => (prev === record.id ? null : record.id));
                              }}
                              aria-label={`Pilihan dan maklumat tambahan untuk ${record.title}`}
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              aria-controls={`deadline-overflow-menu-${record.id}`}
                              className={`w-9 h-9 -mr-1.5 -mt-1.5 rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                                isMenuOpen
                                  ? 'bg-slate-100 text-slate-800'
                                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/80'
                              }`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div
                                id={`deadline-overflow-menu-${record.id}`}
                                role="menu"
                                aria-label={`Maklumat tambahan ${record.title}`}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-1 w-72 max-w-[calc(100vw-3rem)] rounded-2xl bg-white border border-slate-200/95 shadow-xl p-3 z-40 space-y-2.5 text-left"
                              >
                                {hasAnyMenuMetadata && (
                                  <div className="space-y-2 text-xs">
                                    {hasCategory && (
                                      <div className="flex items-start gap-2.5">
                                        <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Maklumat Kategori
                                          </div>
                                          <div className="font-semibold text-slate-800 break-words">
                                            {record.category}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {publishedDateTimeLabel && (
                                      <div className="flex items-start gap-2.5">
                                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Tarikh Diterbitkan
                                          </div>
                                          <div className="font-medium text-slate-700 tabular-nums">
                                            {publishedDateTimeLabel}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {updatedDateTimeLabel && (
                                      <div className="flex items-start gap-2.5">
                                        <RefreshCw className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Tarikh Dikemas Kini
                                          </div>
                                          <div className="font-medium text-amber-800 tabular-nums">
                                            {updatedDateTimeLabel}
                                          </div>
                                        </div>
                                      </div>
                                    )}

                                    {hasTargetMetadata && (
                                      <div className="flex items-start gap-2.5">
                                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0 space-y-0.5">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Sasaran / Jabatan
                                          </div>
                                          {departments.length > 0 && (
                                            <div className="font-medium text-slate-700 break-words">
                                              {departments.join(', ')}
                                            </div>
                                          )}
                                          {audience.length > 0 && (
                                            <div className="text-[11px] text-slate-600 break-words">
                                              {audience.join(', ')}
                                            </div>
                                          )}
                                          {staffTargetCount > 0 && (
                                            <div className="text-[11px] text-slate-500">
                                              {staffTargetCount} staf dikenal pasti
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {attachmentsCount > 0 && (
                                      <div className="flex items-start gap-2.5">
                                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            Lampiran
                                          </div>
                                          <div className="font-medium text-slate-700">
                                            {attachmentsCount} lampiran disertakan
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {canCopyAnnouncementLink && (
                                  <div
                                    className={
                                      hasAnyMenuMetadata ? 'pt-2 border-t border-slate-100' : ''
                                    }
                                  >
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => handleCopyAnnouncementLink(record)}
                                      className="w-full px-2.5 py-2 rounded-xl hover:bg-slate-50 focus:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 text-xs font-semibold text-slate-700 flex items-center gap-2 cursor-pointer transition-colors"
                                    >
                                      {isLinkCopied ? (
                                        <>
                                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                          <span className="text-emerald-700">
                                            Pautan Pengumuman Disalin
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <Copy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          <span>Salin Pautan Pengumuman</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* 2. Title & 3. Short Description */}
                      <div className="space-y-1.5 min-w-0">
                        <h4 className="text-sm sm:text-[15px] font-bold text-slate-900 leading-snug line-clamp-2 break-words">
                          {record.title}
                        </h4>
                        {record.description && (
                          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2 break-words">
                            {record.description}
                          </p>
                        )}
                      </div>

                      {/* 4. Required Action / Instructions */}
                      {actionSnippet && (
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-700 leading-relaxed">
                          <span className="font-semibold text-slate-900">Tindakan: </span>
                          <span className="line-clamp-2 break-words">{actionSnippet}</span>
                        </div>
                      )}

                      {/* 5 & 6. Deadline Date/Time & Countdown / Urgency Indicator */}
                      <div className="flex items-start gap-2 pt-0.5 text-xs text-slate-600">
                        <CalendarClock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-semibold text-slate-900 tabular-nums">
                            Tarikh Akhir: {formatDueDateDisplay(record.dueDate)}
                            {isValidIsoDate(record.dueDate)
                              ? ` · ${formatDueTimeDisplay(record.dueTime)}`
                              : ''}
                          </div>
                          {countdown && (
                            <div
                              className={`text-[11px] font-mono font-bold tabular-nums ${meta.textClass}`}
                            >
                              {countdown}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 7 & 8. Primary External Action + Lihat Butiran + Admin Controls */}
                    <div className="pt-3 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center gap-2">
                        {record.actionUrl && (
                          <a
                            href={record.actionUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shadow-2xs"
                          >
                            <span className="truncate">
                              {record.actionLabel || 'Buka Pautan Tindakan'}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuId(null);
                            setDetailRecord(record);
                          }}
                          className={`px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer whitespace-nowrap ${
                            record.actionUrl ? 'shrink-0' : 'flex-1'
                          }`}
                        >
                          Lihat Butiran
                        </button>
                      </div>

                      {isAdminMode && (
                        <div className="flex items-center justify-between gap-1.5 pt-1 text-[11px]">
                          <div className="flex items-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreatingManual(false);
                                setEditingRecord({ ...record });
                                setEditReason('');
                                setModalStaffSearch('');
                              }}
                              title="Sunting rekod"
                              className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>

                            {record.status === 'ARCHIVED' ? (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(record, 'ACTIVE')}
                                title="Pulihkan daripada arkib"
                                className="px-2 py-1 rounded-lg hover:bg-emerald-50 text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
                              >
                                <ArchiveRestore className="w-3 h-3" />
                                <span>Pulih</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(record, 'ARCHIVED')}
                                title="Arkibkan rekod"
                                className="px-2 py-1 rounded-lg hover:bg-amber-50 text-amber-800 font-semibold flex items-center gap-1 cursor-pointer"
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
                              className="px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-600 font-semibold flex items-center gap-1 cursor-pointer"
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
                            className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </div>
        )}
      </section>

      {/* Detail Modal — Rendered via React Portal at document.body level to escape <main> stacking contexts */}
      {detailRecord && typeof document !== 'undefined' && createPortal(
        (() => {
          const detailStatus = resolveDeadlineDisplayStatus(detailRecord, now).displayStatus;
          const detailMeta = STATUS_META[detailStatus];
          const detailPublishedAt = getOriginalPublishedAt(detailRecord);
          const detailUpdated = isDeadlineUpdated(detailRecord);
          const detailPublishedDisplay = formatKLDateTimeDisplay(detailPublishedAt);
          const detailUpdatedDisplay = detailUpdated
            ? formatKLDateTimeDisplay(detailRecord.updatedAt)
            : '';

          return (
            <div
              className="fixed inset-0 z-[100] bg-slate-950/65 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-0 sm:p-5 overflow-hidden"
              onClick={() => setDetailRecord(null)}
            >
              <div
                className="w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-w-2xl sm:max-h-[90dvh] bg-white rounded-none sm:rounded-3xl shadow-2xl border-0 sm:border sm:border-slate-200 flex flex-col overflow-hidden text-left"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="deadline-detail-modal-title"
              >
                <div className="px-4 sm:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-3.5 sm:py-4 border-b border-slate-100 bg-white flex items-start justify-between gap-3 shrink-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-indigo-700">
                        {detailRecord.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${detailMeta.badgeClass}`}
                      >
                        {detailMeta.label}
                      </span>
                      {detailUpdated && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                          <RefreshCw className="w-3 h-3" />
                          <span>Dikemas Kini</span>
                        </span>
                      )}
                    </div>
                    <h3
                      id="deadline-detail-modal-title"
                      className="text-base sm:text-lg font-extrabold text-slate-900 break-words"
                    >
                      {detailRecord.title}
                    </h3>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDetailRecord(null)}
                    aria-label="Tutup butiran"
                    className="w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer shrink-0 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div
                  className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 sm:px-6 py-4 sm:py-6 space-y-4 text-xs sm:text-sm ${
                    detailRecord.actionUrl
                      ? ''
                      : 'pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6'
                  }`}
                >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-slate-500 font-semibold block">
                      Tarikh & Masa Akhir
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatDueDateDisplay(detailRecord.dueDate)} ·{' '}
                      {formatDueTimeDisplay(detailRecord.dueTime)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-500 font-semibold block">Baki Masa</span>
                    <span className={`font-bold font-mono tabular-nums ${detailMeta.textClass}`}>
                      {formatDeadlineCountdown(
                        detailRecord.dueDate,
                        detailRecord.dueTime,
                        detailRecord.status,
                        now
                      )}
                    </span>
                  </div>

                  {detailPublishedDisplay && (
                    <div>
                      <span className="text-slate-500 font-semibold block">
                        Tarikh Diterbitkan
                      </span>
                      <span className="font-semibold text-slate-800 tabular-nums">
                        {detailPublishedDisplay}
                      </span>
                    </div>
                  )}

                  {detailUpdatedDisplay && (
                    <div>
                      <span className="text-amber-800 font-semibold block">
                        Tarikh Dikemas Kini
                      </span>
                      <span className="font-semibold text-amber-900 tabular-nums">
                        {detailUpdatedDisplay}
                      </span>
                    </div>
                  )}
                </div>

                {detailRecord.description && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-1">Penerangan</h4>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words">
                      {detailRecord.description}
                    </p>
                  </div>
                )}

                {detailRecord.requiredAction && (
                  <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200/70">
                    <h4 className="text-xs font-bold text-indigo-800 mb-1">
                      Tindakan Diperlukan
                    </h4>
                    <p className="text-xs sm:text-sm font-semibold text-indigo-950 break-words">
                      {detailRecord.requiredAction}
                    </p>
                  </div>
                )}

                {detailRecord.instructions && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 mb-1">
                      Arahan Langkah Demi Langkah
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line break-words bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                      {detailRecord.instructions}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-2xl border border-slate-200/80">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
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
                    <span className="font-bold text-slate-700 flex items-center gap-1.5 mb-1">
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
                    <h4 className="text-xs font-bold text-slate-500">Dokumen Sokongan</h4>
                    <div className="flex flex-wrap gap-2">
                      {detailRecord.attachments.map((att, idx) => (
                        <a
                          key={`${att.url}_${idx}`}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 text-xs font-semibold text-indigo-700 inline-flex items-center gap-1.5"
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
                      <div className="font-bold text-slate-800">
                        Bukti Sumber & Kebolehkesanan (Master Admin Sahaja)
                      </div>
                      <p className="text-slate-600">
                        Sumber: <span className="font-semibold">{detailRecord.sourceType}</span> ·
                        Dicipta oleh <span className="font-mono">{detailRecord.createdBy}</span>
                      </p>
                      {detailRecord.sourceSummary && (
                        <p className="text-slate-600 italic bg-white p-2.5 rounded-xl border border-slate-200 break-words">
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
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold"
                              >
                                Buka Bukti Sumber #{i + 1}
                              </a>
                            ) : (
                              <button
                                key={path}
                                type="button"
                                onClick={() => handleLoadProtectedEvidence(path)}
                                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
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
                        <h4 className="font-bold text-slate-700 flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-slate-500" />
                          Sejarah Audit Rekod {detailRecordAuditLogs.length}
                        </h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {detailRecordAuditLogs.map((log) => (
                            <div
                              key={log.id}
                              className="p-2.5 rounded-xl border border-slate-200 bg-white space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-indigo-700">{log.action}</span>
                                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                                  {formatKLDateTimeDisplay(log.performedAt)}
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
                <div className="px-4 sm:px-6 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                  <a
                    href={detailRecord.actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2"
                  >
                    <span>{detailRecord.actionLabel || 'Buka Pautan Tindakan'}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })(),
      document.body
      )}

      {/* Admin Manual Create / Edit Modal */}
      {editingRecord && isAdminMode && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          onClick={() => {
            setEditingRecord(null);
            setIsCreatingManual(false);
          }}
        >
          <form
            onSubmit={handleSaveManualEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-4 text-left text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900">
                {isCreatingManual ? 'Tambah Rekod Tarikh Akhir Baharu' : 'Sunting Rekod Tarikh Akhir'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setIsCreatingManual(false);
                }}
                aria-label="Tutup modal suntingan"
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
                  placeholder="Contoh: Penghantaran Markah Penilaian Berterusan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tarikh Akhir (Asia/Kuala_Lumpur) *
                </label>
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
                <label className="block font-bold text-slate-700 mb-1">
                  Sasaran Audiens (Dipisahkan Koma)
                </label>
                <input
                  type="text"
                  value={(editingRecord.targetAudience || []).join(', ')}
                  onChange={(e) =>
                    setEditingRecord({
                      ...editingRecord,
                      targetAudience: e.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Contoh: Semua Pensyarah, Staf Pentadbiran"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pautan Tindakan (URL)</label>
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

              <div>
                <label className="block font-bold text-slate-700 mb-1">Label Butang Tindakan</label>
                <input
                  type="text"
                  value={editingRecord.actionLabel || ''}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, actionLabel: e.target.value })
                  }
                  placeholder="Buka Pautan Tindakan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">Penerangan</label>
                <textarea
                  rows={2}
                  value={editingRecord.description}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, description: e.target.value })
                  }
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
                  placeholder="Contoh: Lengkapkan borang dan muat naik dokumen sokongan"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  Arahan Langkah Demi Langkah
                </label>
                <textarea
                  rows={2}
                  value={editingRecord.instructions || ''}
                  onChange={(e) =>
                    setEditingRecord({ ...editingRecord, instructions: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="block font-bold text-slate-700">
                  Jabatan / Unit Terlibat
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-slate-50/60">
                  {availableDepartments.map((dept) => {
                    const active = (editingRecord.targetDepartments || []).some(
                      (d) => d.toLowerCase() === dept.toLowerCase()
                    );
                    return (
                      <button
                        key={dept}
                        type="button"
                        onClick={() => {
                          const cur = editingRecord.targetDepartments || [];
                          const next = active
                            ? cur.filter((d) => d.toLowerCase() !== dept.toLowerCase())
                            : [...cur, dept];
                          setEditingRecord({ ...editingRecord, targetDepartments: next });
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                      >
                        {dept}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="block font-bold text-slate-700">
                  Staf Khusus Terlibat ({(editingRecord.targetStaffIds || []).length})
                </label>
                <input
                  type="text"
                  value={modalStaffSearch}
                  onChange={(e) => setModalStaffSearch(e.target.value)}
                  placeholder="Cari nama atau ID staf untuk tambah..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                />
                {modalStaffSearch.trim() && (
                  <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 max-h-28 overflow-y-auto">
                    {staffList
                      .filter((s) => {
                        const q = modalStaffSearch.trim().toLowerCase();
                        return (
                          s.Nama.toLowerCase().includes(q) ||
                          (s.StaffID || s.ID || '').toLowerCase().includes(q) ||
                          (s.Unit || '').toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 8)
                      .map((stf) => {
                        const sId = stf.StaffID || stf.ID;
                        const alreadyAdded = (editingRecord.targetStaffIds || []).includes(sId);
                        return (
                          <button
                            key={sId}
                            type="button"
                            onClick={() => {
                              const cur = editingRecord.targetStaffIds || [];
                              const next = alreadyAdded
                                ? cur.filter((id) => id !== sId)
                                : [...cur, sId];
                              setEditingRecord({ ...editingRecord, targetStaffIds: next });
                            }}
                            className="w-full px-3 py-1.5 text-left text-[11px] flex items-center justify-between hover:bg-indigo-50 cursor-pointer"
                          >
                            <span className="font-semibold text-slate-800 truncate">
                              {sId} — {stf.Nama}
                            </span>
                            <span className="font-bold text-indigo-600 shrink-0">
                              {alreadyAdded ? 'Dipilih ✓' : '+ Tambah'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                )}
                {(editingRecord.targetStaffIds || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(editingRecord.targetStaffIds || []).map((sid) => {
                      const match = staffList.find((s) => (s.StaffID || s.ID) === sid);
                      return (
                        <button
                          key={sid}
                          type="button"
                          onClick={() =>
                            setEditingRecord({
                              ...editingRecord,
                              targetStaffIds: (editingRecord.targetStaffIds || []).filter(
                                (id) => id !== sid
                              ),
                            })
                          }
                          className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <span>{match ? `${sid} (${match.Nama.split(' ')[0]})` : sid}</span>
                          <X className="w-3 h-3" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1">
                  {isCreatingManual
                    ? 'Nota Rekod (Untuk Rekod Audit)'
                    : 'Sebab Kemaskini (Untuk Rekod Audit)'}
                </label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={
                    isCreatingManual
                      ? 'Contoh: Hebahan rasmi daripada memo pengurusan'
                      : 'Contoh: Pindaan tarikh baharu mengikut memo terbaharu'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingRecord(null);
                  setIsCreatingManual(false);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isCreatingManual ? 'Terbitkan Rekod' : 'Simpan Perubahan'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && isAdminMode && (
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
                Rekod <span className="font-bold">"{deleteTarget.title}"</span> akan dipadam secara
                kekal dan tindakan ini akan direkod dalam log audit.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
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
                  Log Audit Deadline {auditLogs.length}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditDrawerOpen(false)}
                aria-label="Tutup log audit"
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
                      <span className="font-bold text-slate-900">{log.deadlineTitle}</span>
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
                        {formatKLDateTimeDisplay(log.performedAt)}
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — AI DEADLINE CAPTURE & ADMIN REVIEW WORKSPACE (Modules B, C, D, E)
 *
 * Workflow:
 * Source Input (Screenshot/PDF/Pasted Text) -> AI Extraction (/api/deadlines/extract)
 * -> Drafts Saved (/deadline_drafts) -> Admin Review & Duplicate Resolution -> Publish (/deadlines)
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  History,
  Image as ImageIcon,
  Link2,
  Loader2,
  Paperclip,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DeadlineCategory,
  DeadlineDraft,
  DeadlineRecord,
  DeadlineSourceType,
  Staff,
} from '../types';
import {
  DEADLINE_CATEGORIES,
  computeDeadlineStatus,
  evaluateDraftReviewNeed,
  formatDeadlineCountdown,
  formatDueDateDisplay,
  formatDueTimeDisplay,
  validateDeadlineCandidate,
} from '../utils/deadlineStatus';
import {
  deleteDeadlineDraftFromFirestore,
  getProtectedSourceEvidenceUrl,
  publishApprovedDrafts,
  requestAiDeadlineExtraction,
  saveExtractedDraftsToFirestore,
  updateDeadlineDraftInFirestore,
  uploadDeadlineAttachmentFile,
  uploadDeadlineSourceFiles,
} from '../services/deadlineService';

interface AiDeadlineCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingDeadlines: DeadlineRecord[];
  pendingDrafts: DeadlineDraft[];
  staffList: Staff[];
  adminEmail: string;
  initialTab?: 'upload' | 'paste' | 'queue';
}

const ACCEPTED_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILES = 5;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;

export const AiDeadlineCaptureModal: React.FC<AiDeadlineCaptureModalProps> = ({
  isOpen,
  onClose,
  existingDeadlines,
  pendingDrafts,
  staffList,
  adminEmail,
  initialTab = 'upload',
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste' | 'queue'>(initialTab);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<Record<string, string>>({});
  const [pastedText, setPastedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const [isExtracting, setIsExtracting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [uploadingAttachmentFor, setUploadingAttachmentFor] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  // Local editable state synced with Firestore pendingDrafts
  const [draftEdits, setDraftEdits] = useState<Record<string, DeadlineDraft>>({});
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [expandedEvidenceIds, setExpandedEvidenceIds] = useState<Set<string>>(new Set());
  const [previewingPathUrl, setPreviewingPathUrl] = useState<Record<string, string>>({});
  const [staffSearchTerm, setStaffSearchTerm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setErrorMsg(null);
      setNoticeMsg(null);
    }
  }, [isOpen, initialTab]);

  // Unique departments from authoritative staff directory
  const availableDepartments = useMemo(() => {
    const set = new Set<string>(['Pengurusan', 'Akademik', 'Sokongan Akademik', 'Pentadbiran', 'HEA', 'HEP']);
    staffList.forEach((s) => {
      if (s.Bahagian?.trim()) set.add(s.Bahagian.trim());
      if (s.Unit?.trim()) set.add(s.Unit.trim());
      if (s.DepartmentID?.trim()) set.add(s.DepartmentID.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [staffList]);

  // Generate local image previews for selected files
  useEffect(() => {
    const urls: Record<string, string> = {};
    selectedFiles.forEach((file, idx) => {
      if (file.type.startsWith('image/')) {
        urls[`${file.name}_${idx}`] = URL.createObjectURL(file);
      }
    });
    setFilePreviews(urls);
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [selectedFiles]);

  const activePendingDrafts = useMemo(
    () => pendingDrafts.filter((d) => d.reviewStatus === 'pending' || d.reviewStatus === 'approved'),
    [pendingDrafts]
  );

  // Drafts currently shown in Review tab
  const displayedDrafts = useMemo(() => {
    const base = activeBatchId
      ? activePendingDrafts.filter((d) => d.submissionBatchId === activeBatchId)
      : activePendingDrafts;
    return base.map((d) => draftEdits[d.id] || d);
  }, [activePendingDrafts, activeBatchId, draftEdits]);

  // Sync newly arrived pending drafts into local edit map and select valid ones
  useEffect(() => {
    setDraftEdits((prev) => {
      const next = { ...prev };
      for (const d of activePendingDrafts) {
        if (!next[d.id]) {
          next[d.id] = d;
        }
      }
      return next;
    });
    if (activeBatchId) {
      const batchIds = activePendingDrafts
        .filter((d) => d.submissionBatchId === activeBatchId)
        .map((d) => d.id);
      setSelectedDraftIds(new Set(batchIds));
    }
  }, [activePendingDrafts, activeBatchId]);

  const updateLocalDraft = (draftId: string, patch: Partial<DeadlineDraft>) => {
    setDraftEdits((prev) => {
      const current = prev[draftId] || activePendingDrafts.find((d) => d.id === draftId);
      if (!current) return prev;
      const merged: DeadlineDraft = {
        ...current,
        ...patch,
      };
      // Recompute missingFields dynamically when key fields change
      const missing: string[] = [];
      if (!merged.dueDate?.trim()) missing.push('dueDate');
      if (!merged.requiredAction?.trim()) missing.push('requiredAction');
      merged.missingFields = missing;
      merged.requiresReview = evaluateDraftReviewNeed(merged);
      return { ...prev, [draftId]: merged };
    });
  };

  const handleFilesAdded = (incoming: FileList | File[]) => {
    setErrorMsg(null);
    const list = Array.from(incoming || []);
    const valid: File[] = [];
    for (const f of list) {
      const mime = (f.type || '').toLowerCase();
      const isPdfByName = f.name.toLowerCase().endsWith('.pdf');
      const isJpgByName = /\.(jpe?g|png|webp)$/i.test(f.name);
      if (!ACCEPTED_FILE_TYPES.includes(mime) && !isPdfByName && !isJpgByName) {
        setErrorMsg(`Format fail "${f.name}" tidak disokong. Sila muat naik JPG, PNG, WEBP atau PDF sahaja.`);
        continue;
      }
      if (f.size > MAX_SINGLE_FILE_BYTES) {
        setErrorMsg(`Saiz fail "${f.name}" melebihi had maksimum 10MB.`);
        continue;
      }
      valid.push(f);
    }

    setSelectedFiles((prev) => {
      const merged = [...prev, ...valid].slice(0, MAX_FILES);
      if (prev.length + valid.length > MAX_FILES) {
        setErrorMsg(`Maksimum ${MAX_FILES} fail dibenarkan bagi setiap analisis.`);
      }
      return merged;
    });
  };

  const handleAnalyzeWithAi = async () => {
    setErrorMsg(null);
    setNoticeMsg(null);

    const isUploadMode = activeTab === 'upload';
    if (isUploadMode && selectedFiles.length === 0) {
      setErrorMsg('Sila muat naik sekurang-kurangnya satu tangkapan skrin (JPG/PNG) atau dokumen PDF.');
      return;
    }
    if (!isUploadMode && !pastedText.trim()) {
      setErrorMsg('Sila tampal teks pengumuman, mesej WhatsApp atau notis terlebih dahulu.');
      return;
    }

    const inferredSourceType: DeadlineSourceType = isUploadMode
      ? selectedFiles.some((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
        ? 'PDF'
        : 'SCREENSHOT'
      : 'PASTED_TEXT';

    const batchId = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

    try {
      setIsExtracting(true);

      // 1. Call server-side Gemini multimodal extraction endpoint + upload private source evidence in parallel
      const [aiResult, storageUpload] = await Promise.all([
        requestAiDeadlineExtraction({
          sourceType: inferredSourceType,
          pastedText: isUploadMode ? pastedText.trim() : pastedText.trim(),
          files: isUploadMode ? selectedFiles : [],
          existingDeadlines,
          staffList,
        }),
        isUploadMode && selectedFiles.length > 0
          ? uploadDeadlineSourceFiles(selectedFiles, batchId)
          : Promise.resolve({ storagePaths: [], warning: undefined }),
      ]);

      if (!aiResult.extractedDeadlines || aiResult.extractedDeadlines.length === 0) {
        setErrorMsg(
          'Tiada tarikh akhir atau tindakan dapat dikesan daripada sumber tersebut. Pastikan maklumat tarikh atau arahan kelihatan jelas.'
        );
        return;
      }

      // 2. Save strictly to /deadline_drafts for Mandatory Admin Review (NEVER auto-publish)
      const savedDrafts = await saveExtractedDraftsToFirestore({
        batchId,
        sourceType: inferredSourceType,
        sourceEvidence: {
          type: inferredSourceType,
          fileNames: isUploadMode ? selectedFiles.map((f) => f.name) : undefined,
          mimeTypes: isUploadMode ? selectedFiles.map((f) => f.type || 'application/octet-stream') : undefined,
          storagePaths: storageUpload.storagePaths,
          textExcerpt: aiResult.sourceSummary,
          pastedText: pastedText.trim() ? pastedText.trim().slice(0, 6000) : undefined,
          uploadedAt: new Date().toISOString(),
          uploadedBy: adminEmail,
        },
        candidates: aiResult.extractedDeadlines,
        adminEmail,
      });

      setActiveBatchId(batchId);
      setSelectedDraftIds(new Set(savedDrafts.map((d) => d.id)));
      setActiveTab('queue');
      setNoticeMsg(
        `${savedDrafts.length} rekod tarikh akhir berjaya diekstrak ke Draf Semakan.${
          storageUpload.warning ? ` (${storageUpload.warning})` : ''
        }`
      );

      // Reset source inputs cleanly after successful extraction
      setSelectedFiles([]);
      setPastedText('');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menganalisis sumber menggunakan AI.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveDraftChanges = async (draft: DeadlineDraft) => {
    try {
      setSavingDraftId(draft.id);
      setErrorMsg(null);
      await updateDeadlineDraftInFirestore(draft.id, draft);
      setNoticeMsg(`Perubahan draf "${draft.title}" disimpan.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan perubahan draf.');
    } finally {
      setSavingDraftId(null);
    }
  };

  const handleDiscardDraft = async (draft: DeadlineDraft) => {
    try {
      setSavingDraftId(draft.id);
      setErrorMsg(null);
      await deleteDeadlineDraftFromFirestore(draft.id);
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
      setNoticeMsg(`Draf "${draft.title}" telah dibuang.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal membuang draf.');
    } finally {
      setSavingDraftId(null);
    }
  };

  const handlePublishSingleDraft = async (draft: DeadlineDraft) => {
    const check = validateDeadlineCandidate(draft);
    if (!check.valid) {
      setErrorMsg(`Semak semula "${draft.title}": ${check.errors.join(' ')}`);
      return;
    }

    try {
      setIsPublishing(true);
      setErrorMsg(null);
      const res = await publishApprovedDrafts({
        drafts: [draft],
        existingDeadlines,
        adminEmail,
      });
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draft.id);
        return next;
      });
      if (res.ignoredCount > 0) {
        setNoticeMsg(`Cadangan "${draft.title}" diabaikan dan direkod dalam log audit.`);
      } else if (res.updatedCount > 0) {
        setNoticeMsg(`Rekod sedia ada berjaya dikemas kini daripada draf "${draft.title}".`);
      } else {
        setNoticeMsg(`Tarikh akhir "${draft.title}" berjaya diterbitkan ke Deadline Hub.`);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menerbitkan rekod.');
    } finally {
      setIsPublishing(false);
    }
  };

  const selectedDraftsToPublish = useMemo(
    () => displayedDrafts.filter((d) => selectedDraftIds.has(d.id)),
    [displayedDrafts, selectedDraftIds]
  );

  const bulkValidationIssues = useMemo(() => {
    const issues: Array<{ id: string; title: string; errors: string[] }> = [];
    for (const d of selectedDraftsToPublish) {
      const res = validateDeadlineCandidate(d);
      if (!res.valid) {
        issues.push({ id: d.id, title: d.title, errors: res.errors });
      }
    }
    return issues;
  }, [selectedDraftsToPublish]);

  const canBulkPublish = selectedDraftsToPublish.length > 0 && bulkValidationIssues.length === 0;

  const handleBulkPublish = async () => {
    if (!canBulkPublish) return;
    try {
      setIsPublishing(true);
      setErrorMsg(null);
      const res = await publishApprovedDrafts({
        drafts: selectedDraftsToPublish,
        existingDeadlines,
        adminEmail,
      });
      setSelectedDraftIds(new Set());
      setNoticeMsg(
        `Terbitan selesai: ${res.createdCount} dicipta, ${res.updatedCount} dikemas kini, ${res.ignoredCount} diabaikan.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal melaksanakan terbitan pukal.');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleLoadProtectedSourceUrl = async (storagePath: string) => {
    try {
      const url = await getProtectedSourceEvidenceUrl(storagePath);
      setPreviewingPathUrl((prev) => ({ ...prev, [storagePath]: url }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuatkan bukti sumber terhad Admin.');
    }
  };

  const handleUploadSupportingAttachment = async (draft: DeadlineDraft, file: File) => {
    try {
      setUploadingAttachmentFor(draft.id);
      setErrorMsg(null);
      const uploaded = await uploadDeadlineAttachmentFile(file, draft.id);
      const nextAttachments = [...(draft.attachments || []), uploaded];
      updateLocalDraft(draft.id, { attachments: nextAttachments });
      await updateDeadlineDraftInFirestore(draft.id, { attachments: nextAttachments });
      setNoticeMsg(`Lampiran "${file.name}" berjaya dimuat naik.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memuat naik fail lampiran.');
    } finally {
      setUploadingAttachmentFor(null);
    }
  };

  if (!isOpen) return null;

  const currentStep = isExtracting ? 2 : activeTab === 'queue' ? 3 : 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 max-h-[94vh] flex flex-col overflow-hidden text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI Deadline Capture & Semakan Admin"
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 truncate">
                AI Deadline Capture & Semakan Admin
              </h2>
              <p className="text-xs text-slate-500 font-medium truncate">
                Ekstrak tarikh akhir daripada tangkapan skrin, PDF atau mesej WhatsApp secara automatik
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Step Workflow Indicator + Input Mode Switcher */}
        <div className="px-5 sm:px-7 py-3 border-b border-slate-100 bg-white flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold overflow-x-auto scrollbar-none">
            {[
              { step: 1, label: '1. Sumber Input' },
              { step: 2, label: '2. Analisis AI' },
              { step: 3, label: '3. Semak Draf' },
              { step: 4, label: '4. Terbit ke Hub' },
            ].map((s, idx) => (
              <React.Fragment key={s.step}>
                {idx > 0 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
                <span
                  className={`px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0 ${
                    currentStep === s.step
                      ? 'bg-indigo-600 text-white'
                      : currentStep > s.step
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {s.label}
                </span>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 self-start lg:self-auto">
            <button
              type="button"
              onClick={() => {
                setActiveTab('upload');
                setErrorMsg(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'upload'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Muat Naik Imej / PDF</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('paste');
                setErrorMsg(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'paste'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Tampal Teks</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveBatchId(null);
                setActiveTab('queue');
                setErrorMsg(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'queue'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Semak Draf ({activePendingDrafts.length})</span>
            </button>
          </div>
        </div>

        {/* Alerts */}
        {(errorMsg || noticeMsg) && (
          <div className="px-5 sm:px-7 pt-3 shrink-0 space-y-2">
            {errorMsg && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {noticeMsg && (
              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{noticeMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNoticeMsg(null)}
                  className="text-emerald-600 hover:text-emerald-800 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Scrollable Workspace Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-5">
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files) {
                    handleFilesAdded(e.dataTransfer.files);
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/70'
                    : 'border-slate-300 bg-slate-50/60 hover:border-indigo-400 hover:bg-indigo-50/30'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto mb-3">
                  <FileUp className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  Seret & lepas tangkapan skrin WhatsApp, poster atau dokumen PDF di sini
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Menyokong JPG, JPEG, PNG, WEBP dan PDF (maksimum {MAX_FILES} fail, 10MB setiap fail)
                </p>
                <label className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer transition-colors shadow-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Pilih Fail Daripada Peranti</span>
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFilesAdded(e.target.files);
                      }
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-slate-700">
                      Fail Dipilih ({selectedFiles.length}/{MAX_FILES})
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles([])}
                      className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                    >
                      Kosongkan Semua
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {selectedFiles.map((file, idx) => {
                      const previewUrl = filePreviews[`${file.name}_${idx}`];
                      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                      return (
                        <div
                          key={`${file.name}_${idx}`}
                          className="p-2.5 rounded-2xl border border-slate-200 bg-white flex items-center gap-3 shadow-2xs"
                        >
                          <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt={file.name}
                                className="w-full h-full object-cover"
                              />
                            ) : isPdf ? (
                              <FileText className="w-5 h-5 text-rose-600" />
                            ) : (
                              <ImageIcon className="w-5 h-5 text-indigo-600" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                            <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                              {(file.size / 1024).toFixed(0)} KB • {isPdf ? 'PDF' : 'Imej'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Buang fail"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nota / Konteks Tambahan (Pilihan)
                </label>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Mesej ini dihantar dalam grup Pensyarah Akademik mengenai pelanjutan tarikh..."
                  className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:outline-none text-xs text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={isExtracting || selectedFiles.length === 0}
                  onClick={handleAnalyzeWithAi}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menganalisis Sumber Dengan AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analisis Dengan AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 mb-1.5">
                  Tampal Mesej WhatsApp, E-mel, Pekeliling atau Pengumuman Rasmi
                </label>
                <p className="text-[11px] text-slate-500 mb-2">
                  AI akan mengekstrak tajuk, tarikh & masa akhir (Asia/Kuala_Lumpur), tindakan diperlukan, sasaran jabatan/staf, pautan penghantaran, serta memisahkan berbilang tarikh akhir secara automatik.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={10}
                  placeholder={`Contoh:\nAssalamualaikum & Salam Sejahtera,\nMakluman kepada semua pensyarah dan staf KPMBP.\n1. Tarikh akhir penghantaran markah penilaian berterusan (PB) adalah pada 28 November 2026 sebelum jam 5:00 petang melalui portal https://portal.example.edu.my.\n2. Pencalonan Anugerah Inovasi perlu dihantar selewat-lewatnya 4 Disember 2026 jam 12:00 tengah hari.`}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 focus:outline-none text-xs sm:text-sm text-slate-800 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  {pastedText.trim().length} aksara
                </span>
                <button
                  type="button"
                  disabled={isExtracting || !pastedText.trim()}
                  onClick={handleAnalyzeWithAi}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menganalisis Teks Dengan AI...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analisis Dengan AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'queue' && (
            <div className="space-y-4">
              {/* Queue Filter & Bulk Publish Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                      Draf Menunggu Kelulusan Admin ({displayedDrafts.length})
                    </h3>
                    {activeBatchId && (
                      <button
                        type="button"
                        onClick={() => setActiveBatchId(null)}
                        className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Papar Semua Draf ({activePendingDrafts.length})
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Rekod hanya diterbitkan ke Deadline Hub selepas disemak dan diluluskan oleh Master Admin.
                  </p>
                </div>

                {displayedDrafts.length > 0 && (
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedDraftIds.size === displayedDrafts.length) {
                          setSelectedDraftIds(new Set());
                        } else {
                          setSelectedDraftIds(new Set(displayedDrafts.map((d) => d.id)));
                        }
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      {selectedDraftIds.size === displayedDrafts.length
                        ? 'Nyahpilih Semua'
                        : 'Pilih Semua'}
                    </button>

                    <button
                      type="button"
                      disabled={!canBulkPublish || isPublishing}
                      onClick={handleBulkPublish}
                      title={
                        bulkValidationIssues.length > 0
                          ? `${bulkValidationIssues.length} draf dipilih mempunyai ralat pengesahan.`
                          : 'Terbitkan semua draf yang dipilih'
                      }
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {isPublishing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>
                        Lulus & Terbit Pilihan ({selectedDraftsToPublish.length})
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {bulkValidationIssues.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                  <div className="font-extrabold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Terbitan pukal disekat sehingga rekod bertanda ralat diselesaikan:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                    {bulkValidationIssues.map((issue) => (
                      <li key={issue.id}>
                        <span className="font-bold">{issue.title}:</span> {issue.errors.join(' ')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {displayedDrafts.length === 0 ? (
                <div className="p-10 text-center rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <Clock className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-sm font-extrabold text-slate-800">
                    Tiada draf menunggu semakan
                  </p>
                  <p className="text-xs text-slate-500">
                    Muat naik tangkapan skrin / PDF atau tampal teks pengumuman untuk mula mengekstrak tarikh akhir.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {displayedDrafts.map((draft, index) => {
                    const validation = validateDeadlineCandidate(draft);
                    const isSelected = selectedDraftIds.has(draft.id);
                    const isSaving = savingDraftId === draft.id;
                    const hasDuplicate = Boolean(
                      draft.duplicateMatch && draft.duplicateMatch.similarityLevel !== 'none'
                    );
                    const targetExisting = existingDeadlines.find(
                      (e) =>
                        e.id ===
                        (draft.targetExistingDeadlineId || draft.duplicateMatch?.matchedExistingId)
                    );
                    const computedPreviewStatus =
                      draft.dueDate && validation.valid
                        ? computeDeadlineStatus({
                            dueDate: draft.dueDate,
                            dueTime: draft.dueTime,
                            status: 'ACTIVE',
                          })
                        : null;
                    const staffFilter = (staffSearchTerm[draft.id] || '').trim().toLowerCase();
                    const filteredStaffChoices = staffList
                      .filter((s) => {
                        if (!staffFilter) return false;
                        return (
                          s.Nama.toLowerCase().includes(staffFilter) ||
                          (s.StaffID || s.ID || '').toLowerCase().includes(staffFilter) ||
                          (s.Unit || '').toLowerCase().includes(staffFilter)
                        );
                      })
                      .slice(0, 8);
                    const isEvidenceOpen = expandedEvidenceIds.has(draft.id);

                    return (
                      <div
                        key={draft.id}
                        className={`rounded-2xl border p-4 sm:p-5 space-y-4 transition-all ${
                          !validation.valid
                            ? 'border-rose-300 bg-rose-50/20'
                            : hasDuplicate
                            ? 'border-amber-300 bg-amber-50/15'
                            : 'border-slate-200 bg-white shadow-xs'
                        }`}
                      >
                        {/* Draft Card Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                setSelectedDraftIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(draft.id);
                                  else next.delete(draft.id);
                                  return next;
                                });
                              }}
                              aria-label={`Pilih draf ${draft.title}`}
                              className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[11px] font-mono font-bold text-slate-400">
                                  #{index + 1} • {draft.sourceType}
                                </span>
                                {validation.valid ? (
                                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                    Sedia Diterbitkan
                                  </span>
                                ) : (
                                  <span className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                    Perlu Semakan / Ralat
                                  </span>
                                )}
                                {hasDuplicate && (
                                  <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                                    Potensi Rekod Sedia Ada
                                  </span>
                                )}
                                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                                  Keyakinan AI: {Math.round((draft.confidence?.overall ?? 0) * 100)}%
                                </span>
                              </div>
                              <h4 className="text-sm font-extrabold text-slate-900 truncate">
                                {draft.title || 'Draf Tanpa Tajuk'}
                              </h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 flex-wrap">
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleSaveDraftChanges(draft)}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-1.5"
                            >
                              {isSaving ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3.5 h-3.5" />
                              )}
                              <span>Simpan Draf</span>
                            </button>

                            <button
                              type="button"
                              disabled={!validation.valid || isPublishing}
                              onClick={() => handlePublishSingleDraft(draft)}
                              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {draft.resolutionAction === 'ignore'
                                  ? 'Sahkan Abai'
                                  : draft.resolutionAction === 'update_existing'
                                  ? 'Lulus & Kemas Kini'
                                  : 'Lulus & Terbit'}
                              </span>
                            </button>

                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={() => handleDiscardDraft(draft)}
                              title="Padam draf"
                              className="p-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Ambiguity / Missing Info Warning */}
                        {(draft.ambiguousFields.length > 0 || draft.missingFields.length > 0) && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="font-extrabold flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>Maklumat Tidak Lengkap / Samar Dikesan</span>
                              </span>
                              {draft.ambiguousFields.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLocalDraft(draft.id, {
                                      ambiguousFields: [],
                                      ambiguityReason: '',
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 text-[11px] font-extrabold cursor-pointer"
                                >
                                  Tandakan Sudah Disemak Admin
                                </button>
                              )}
                            </div>
                            {draft.missingFields.length > 0 && (
                              <p className="text-[11px]">
                                Medan tiada dalam sumber:{' '}
                                <span className="font-bold">{draft.missingFields.join(', ')}</span>
                              </p>
                            )}
                            {draft.ambiguityReason && (
                              <p className="text-[11px]">{draft.ambiguityReason}</p>
                            )}
                            {draft.announcementDate && (
                              <p className="text-[11px] text-amber-800">
                                Tarikh surat/hebahan berasingan dikesan: <span className="font-mono font-bold">{draft.announcementDate}</span>
                              </p>
                            )}
                          </div>
                        )}

                        {/* Module D: Smart Duplicate & Update Detection Banner */}
                        {hasDuplicate && draft.duplicateMatch && (
                          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 space-y-3">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div>
                                <div className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                                  <History className="w-4 h-4 text-amber-700" />
                                  <span>POTENTIAL EXISTING DEADLINE ({draft.duplicateMatch.similarityLevel.toUpperCase()})</span>
                                </div>
                                <p className="text-[11px] text-amber-900 mt-0.5">
                                  {draft.duplicateMatch.rationale} ({draft.duplicateMatch.reasons.join(' • ')})
                                </p>
                              </div>
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-white border border-amber-300 text-amber-900">
                                Syor AI:{' '}
                                {draft.duplicateMatch.recommendation === 'update_existing'
                                  ? 'Kemas Kini Rekod Sedia Ada'
                                  : draft.duplicateMatch.recommendation === 'ignore'
                                  ? 'Abaikan'
                                  : 'Cipta Rekod Baharu'}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                              <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                                  Rekod Sedia Ada
                                </span>
                                <p className="font-extrabold text-slate-900">
                                  {targetExisting?.title || draft.duplicateMatch.matchedTitle}
                                </p>
                                <p className="text-[11px] font-mono text-slate-600 tabular-nums">
                                  Tarikh: {targetExisting?.dueDate || draft.duplicateMatch.matchedDueDate}{' '}
                                  {(targetExisting?.dueTime || draft.duplicateMatch.matchedDueTime)
                                    ? `• ${targetExisting?.dueTime || draft.duplicateMatch.matchedDueTime}`
                                    : ''}
                                </p>
                                {(targetExisting?.requiredAction || draft.duplicateMatch.matchedRequiredAction) && (
                                  <p className="text-[11px] text-slate-600 line-clamp-2">
                                    Tindakan: {targetExisting?.requiredAction || draft.duplicateMatch.matchedRequiredAction}
                                  </p>
                                )}
                              </div>

                              <div className="p-3 rounded-xl bg-white border border-indigo-200 space-y-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-500">
                                  Maklumat Baharu Diekstrak
                                </span>
                                <p className="font-extrabold text-slate-900">{draft.title}</p>
                                <p className="text-[11px] font-mono text-indigo-700 tabular-nums">
                                  Tarikh: {draft.dueDate || '(Tiada)'}{' '}
                                  {draft.dueTime ? `• ${draft.dueTime}` : ''}
                                </p>
                                {draft.requiredAction && (
                                  <p className="text-[11px] text-slate-600 line-clamp-2">
                                    Tindakan: {draft.requiredAction}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* 3 Explicit Admin Actions */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {(
                                [
                                  { id: 'update_existing', label: 'Kemas Kini Rekod Sedia Ada' },
                                  { id: 'create', label: 'Cipta Rekod Baharu' },
                                  { id: 'ignore', label: 'Abaikan Hebahan Baharu' },
                                ] as const
                              ).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    updateLocalDraft(draft.id, {
                                      resolutionAction: opt.id,
                                      targetExistingDeadlineId:
                                        opt.id === 'update_existing'
                                          ? draft.targetExistingDeadlineId ||
                                            draft.duplicateMatch?.matchedExistingId ||
                                            ''
                                          : '',
                                    })
                                  }
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                    draft.resolutionAction === opt.id
                                      ? 'bg-amber-900 text-white border-amber-900'
                                      : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>

                            {draft.resolutionAction === 'update_existing' && (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                <div>
                                  <label className="block text-[11px] font-bold text-amber-950 mb-1">
                                    Rekod Sedia Ada Untuk Dikemas Kini
                                  </label>
                                  <select
                                    value={draft.targetExistingDeadlineId || ''}
                                    onChange={(e) =>
                                      updateLocalDraft(draft.id, {
                                        targetExistingDeadlineId: e.target.value,
                                      })
                                    }
                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-semibold text-slate-800"
                                  >
                                    <option value="">-- Pilih Rekod --</option>
                                    {existingDeadlines.map((ex) => (
                                      <option key={ex.id} value={ex.id}>
                                        {ex.title} ({ex.dueDate})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[11px] font-bold text-amber-950 mb-1">
                                    Sebab Kemas Kini (Direkod dalam Log Audit)
                                  </label>
                                  <input
                                    type="text"
                                    value={draft.updateReason || ''}
                                    onChange={(e) =>
                                      updateLocalDraft(draft.id, { updateReason: e.target.value })
                                    }
                                    placeholder="Contoh: Pelanjutan tarikh tutup rasmi"
                                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs text-slate-800"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Editable Structured Form Fields */}
                        {draft.resolutionAction !== 'ignore' && (
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs">
                            <div className="md:col-span-8">
                              <label className="block font-bold text-slate-700 mb-1">
                                Tajuk Tarikh Akhir *
                              </label>
                              <input
                                type="text"
                                value={draft.title}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { title: e.target.value })
                                }
                                className={`w-full px-3 py-2 rounded-xl border bg-white font-semibold text-slate-900 ${
                                  validation.fieldErrors.title
                                    ? 'border-rose-400'
                                    : 'border-slate-200 focus:border-indigo-500'
                                }`}
                              />
                              {validation.fieldErrors.title && (
                                <p className="text-[11px] text-rose-600 mt-0.5 font-semibold">
                                  {validation.fieldErrors.title}
                                </p>
                              )}
                            </div>

                            <div className="md:col-span-4">
                              <label className="block font-bold text-slate-700 mb-1">
                                Kategori
                              </label>
                              <select
                                value={draft.category}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, {
                                    category: e.target.value as DeadlineCategory,
                                  })
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800"
                              >
                                {DEADLINE_CATEGORIES.map((cat) => (
                                  <option key={cat} value={cat}>
                                    {cat}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="md:col-span-4">
                              <label className="block font-bold text-slate-700 mb-1">
                                Tarikh Akhir (Asia/Kuala_Lumpur) *
                              </label>
                              <input
                                type="date"
                                value={draft.dueDate}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { dueDate: e.target.value })
                                }
                                className={`w-full px-3 py-2 rounded-xl border bg-white font-mono text-slate-900 ${
                                  validation.fieldErrors.dueDate
                                    ? 'border-rose-400'
                                    : 'border-slate-200 focus:border-indigo-500'
                                }`}
                              />
                              {validation.fieldErrors.dueDate && (
                                <p className="text-[11px] text-rose-600 mt-0.5 font-semibold">
                                  {validation.fieldErrors.dueDate}
                                </p>
                              )}
                            </div>

                            <div className="md:col-span-4">
                              <div className="flex items-center justify-between mb-1">
                                <label className="font-bold text-slate-700">
                                  Masa Akhir (24h, Pilihan)
                                </label>
                                {draft.dueTime && (
                                  <button
                                    type="button"
                                    onClick={() => updateLocalDraft(draft.id, { dueTime: '' })}
                                    className="text-[10px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
                                  >
                                    Kosongkan Masa
                                  </button>
                                )}
                              </div>
                              <input
                                type="time"
                                value={draft.dueTime}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { dueTime: e.target.value })
                                }
                                className={`w-full px-3 py-2 rounded-xl border bg-white font-mono text-slate-900 ${
                                  validation.fieldErrors.dueTime
                                    ? 'border-rose-400'
                                    : 'border-slate-200 focus:border-indigo-500'
                                }`}
                              />
                              <p className="text-[10.5px] text-slate-400 mt-0.5">
                                {draft.dueTime
                                  ? formatDueTimeDisplay(draft.dueTime)
                                  : 'Tiada masa khusus (tamat 11:59 PM)'}
                              </p>
                            </div>

                            <div className="md:col-span-4 flex flex-col justify-center p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Pratonton Status (MYT)
                              </span>
                              {computedPreviewStatus ? (
                                <>
                                  <span className="font-extrabold text-slate-800 mt-0.5">
                                    {computedPreviewStatus} •{' '}
                                    {formatDeadlineCountdown(draft.dueDate, draft.dueTime, 'ACTIVE')}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {formatDueDateDisplay(draft.dueDate)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-rose-600 font-bold mt-0.5">
                                  Tarikh akhir diperlukan
                                </span>
                              )}
                            </div>

                            <div className="md:col-span-6">
                              <label className="block font-bold text-slate-700 mb-1">
                                Tindakan Diperlukan
                              </label>
                              <input
                                type="text"
                                value={draft.requiredAction}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { requiredAction: e.target.value })
                                }
                                placeholder="Contoh: Muat naik laporan & lengkapkan borang"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900"
                              />
                            </div>

                            <div className="md:col-span-6">
                              <label className="block font-bold text-slate-700 mb-1">
                                Sasaran Audiens (Dipisahkan Koma)
                              </label>
                              <input
                                type="text"
                                value={(draft.targetAudience || []).join(', ')}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, {
                                    targetAudience: e.target.value
                                      .split(',')
                                      .map((v) => v.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="Contoh: Semua Pensyarah, Ketua Jabatan"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900"
                              />
                            </div>

                            <div className="md:col-span-8">
                              <label className="block font-bold text-slate-700 mb-1">
                                Pautan Tindakan / Borang (URL)
                              </label>
                              <div className="relative">
                                <Link2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                  type="url"
                                  value={draft.actionUrl}
                                  onChange={(e) =>
                                    updateLocalDraft(draft.id, { actionUrl: e.target.value })
                                  }
                                  placeholder="https://..."
                                  className={`w-full pl-8 pr-3 py-2 rounded-xl border bg-white text-slate-900 ${
                                    validation.fieldErrors.actionUrl
                                      ? 'border-rose-400'
                                      : 'border-slate-200'
                                  }`}
                                />
                              </div>
                              {validation.fieldErrors.actionUrl && (
                                <p className="text-[11px] text-rose-600 mt-0.5 font-semibold">
                                  {validation.fieldErrors.actionUrl}
                                </p>
                              )}
                            </div>

                            <div className="md:col-span-4">
                              <label className="block font-bold text-slate-700 mb-1">
                                Label Butang Tindakan
                              </label>
                              <input
                                type="text"
                                value={draft.actionLabel}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { actionLabel: e.target.value })
                                }
                                placeholder="Buka Pautan Tindakan"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900"
                              />
                            </div>

                            <div className="md:col-span-6">
                              <label className="block font-bold text-slate-700 mb-1">
                                Penerangan Ringkas
                              </label>
                              <textarea
                                rows={2}
                                value={draft.description}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { description: e.target.value })
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                              />
                            </div>

                            <div className="md:col-span-6">
                              <label className="block font-bold text-slate-700 mb-1">
                                Arahan Terperinci
                              </label>
                              <textarea
                                rows={2}
                                value={draft.instructions}
                                onChange={(e) =>
                                  updateLocalDraft(draft.id, { instructions: e.target.value })
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-800"
                              />
                            </div>

                            {/* Target Departments Selector */}
                            <div className="md:col-span-6 space-y-1.5">
                              <label className="block font-bold text-slate-700">
                                Jabatan / Unit Terlibat
                              </label>
                              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl border border-slate-200 bg-slate-50/60">
                                {availableDepartments.map((dept) => {
                                  const active = (draft.targetDepartments || []).some(
                                    (d) => d.toLowerCase() === dept.toLowerCase()
                                  );
                                  return (
                                    <button
                                      key={dept}
                                      type="button"
                                      onClick={() => {
                                        const cur = draft.targetDepartments || [];
                                        const next = active
                                          ? cur.filter((d) => d.toLowerCase() !== dept.toLowerCase())
                                          : [...cur, dept];
                                        updateLocalDraft(draft.id, { targetDepartments: next });
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

                            {/* Target Individual Staff Picker */}
                            <div className="md:col-span-6 space-y-1.5">
                              <label className="block font-bold text-slate-700">
                                Individu Staf Terlibat ({(draft.targetStaffIds || []).length})
                              </label>
                              <input
                                type="text"
                                value={staffSearchTerm[draft.id] || ''}
                                onChange={(e) =>
                                  setStaffSearchTerm((prev) => ({
                                    ...prev,
                                    [draft.id]: e.target.value,
                                  }))
                                }
                                placeholder="Cari nama atau ID staf untuk tambah..."
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs"
                              />
                              {filteredStaffChoices.length > 0 && (
                                <div className="border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 max-h-28 overflow-y-auto">
                                  {filteredStaffChoices.map((stf) => {
                                    const sId = stf.StaffID || stf.ID;
                                    const alreadyAdded = (draft.targetStaffIds || []).includes(sId);
                                    return (
                                      <button
                                        key={sId}
                                        type="button"
                                        onClick={() => {
                                          const cur = draft.targetStaffIds || [];
                                          const next = alreadyAdded
                                            ? cur.filter((id) => id !== sId)
                                            : [...cur, sId];
                                          updateLocalDraft(draft.id, { targetStaffIds: next });
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
                              {(draft.targetStaffIds || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {(draft.targetStaffIds || []).map((sid) => {
                                    const match = staffList.find(
                                      (s) => (s.StaffID || s.ID) === sid
                                    );
                                    return (
                                      <button
                                        key={sid}
                                        type="button"
                                        onClick={() =>
                                          updateLocalDraft(draft.id, {
                                            targetStaffIds: (draft.targetStaffIds || []).filter(
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

                            {/* Public Supporting Attachments */}
                            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-600 flex items-center gap-1">
                                  <Paperclip className="w-3.5 h-3.5" />
                                  Lampiran Sokongan ({(draft.attachments || []).length}):
                                </span>
                                {(draft.attachments || []).map((att, attIdx) => (
                                  <span
                                    key={`${att.url}_${attIdx}`}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold"
                                  >
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="hover:underline"
                                    >
                                      {att.name}
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateLocalDraft(draft.id, {
                                          attachments: (draft.attachments || []).filter(
                                            (_, i) => i !== attIdx
                                          ),
                                        })
                                      }
                                      className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </span>
                                ))}
                                <label className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-indigo-700 cursor-pointer">
                                  {uploadingAttachmentFor === draft.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Plus className="w-3 h-3" />
                                  )}
                                  <span>Muat Naik Lampiran</span>
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) handleUploadSupportingAttachment(draft, f);
                                      e.target.value = '';
                                    }}
                                    className="hidden"
                                  />
                                </label>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedEvidenceIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(draft.id)) next.delete(draft.id);
                                    else next.add(draft.id);
                                    return next;
                                  })
                                }
                                className="text-[11px] font-bold text-slate-600 hover:text-indigo-700 cursor-pointer"
                              >
                                {isEvidenceOpen
                                  ? 'Sembunyi Bukti Sumber Asal'
                                  : 'Lihat Bukti Sumber Asal (Admin)'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Collapsible Admin-Only Source Evidence */}
                        {isEvidenceOpen && (
                          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                            <div className="font-extrabold text-slate-700">
                              Bukti Sumber Asal (Akses Terhad Master Admin)
                            </div>
                            {draft.sourceExcerpt && (
                              <p className="text-[11px] text-slate-600 italic bg-white p-2.5 rounded-lg border border-slate-200">
                                "{draft.sourceExcerpt}"
                              </p>
                            )}
                            {draft.sourceEvidence?.pastedText && (
                              <pre className="text-[11px] text-slate-700 whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-slate-200 max-h-40 overflow-y-auto font-sans">
                                {draft.sourceEvidence.pastedText}
                              </pre>
                            )}
                            {(draft.sourceEvidence?.storagePaths || []).length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {draft.sourceEvidence.storagePaths!.map((sp, spIdx) => {
                                  const signedUrl = previewingPathUrl[sp];
                                  return signedUrl ? (
                                    <a
                                      key={sp}
                                      href={signedUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[11px] font-bold"
                                    >
                                      Buka Fail Sumber #{spIdx + 1}
                                    </a>
                                  ) : (
                                    <button
                                      key={sp}
                                      type="button"
                                      onClick={() => handleLoadProtectedSourceUrl(sp)}
                                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                                    >
                                      Muat Pautan Sumber #{spIdx + 1}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

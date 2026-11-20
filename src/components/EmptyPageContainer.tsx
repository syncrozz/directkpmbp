/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — EMPTY PAGE CONTAINER (PAGES KOSONG)
 * SES v4.4 Specification (Level 2 Child Container for Level 3 Grandchildren)
 * 
 * Renders a clean, structured container page for child navigation items
 * configured as "Pages Kosong". Displays hierarchy breadcrumbs, container overview,
 * first-page PDF preview thumbnail cards, or a helpful empty state.
 */

import React, { useState, useRef, useEffect } from 'react';
import { NavigationItem } from '../types';
import { renderNavIcon, saveNavigationItems } from '../services/navigationService';
import {
  generateThumbnailForItem,
  generateBulkThumbnails,
  isEligibleDrivePdf,
  extractGoogleDriveFileId,
  applyValidatedThumbnailOutcome,
} from '../services/pdfThumbnailService';
import {
  Folder,
  FolderOpen,
  FolderTree,
  Plus,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  Layers,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';

interface EmptyPageContainerProps {
  item: NavigationItem;
  parentItem?: NavigationItem;
  grandchildren: NavigationItem[];
  allItems?: NavigationItem[];
  onSelectGrandchild: (grandchild: NavigationItem) => void;
  onSelectParent?: (parentId: string) => void;
  isAdminMode?: boolean;
  onOpenNavManager?: () => void;
}

function extractSafeHostname(url?: string): string | null {
  if (!url || !/^https?:\/\//i.test(url.trim())) return null;
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

/**
 * Validates that a PDF document thumbnail is a real, persistently stored
 * Firebase Storage HTTPS URL matching the item's current Drive file ID.
 * Rejects local /thumbnails/ assets, data/blob URIs, ephemeral filesystem URLs,
 * and failed/pending statuses.
 */
function getValidPersistentPdfThumbnailUrl(
  docItem: NavigationItem,
  brokenSet: Set<string>
): string | null {
  if (!docItem.isActive || brokenSet.has(docItem.id)) return null;
  if (!isEligibleDrivePdf(docItem)) return null;
  if (docItem.thumbnailStatus !== 'generated' && docItem.thumbnailStatus !== 'ready') {
    return null;
  }

  const rawUrl = (docItem.thumbnailUrl || '').trim();
  if (!rawUrl || rawUrl.startsWith('/thumbnails/')) return null;

  const expectedFileId = extractGoogleDriveFileId(docItem.driveUrl);
  if (docItem.thumbnailFileId && expectedFileId && docItem.thumbnailFileId !== expectedFileId) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    const isFirebaseStorageHost =
      host === 'firebasestorage.googleapis.com' ||
      host.endsWith('.firebasestorage.app') ||
      host === 'storage.googleapis.com';
    if (!isFirebaseStorageHost) return null;
    return rawUrl;
  } catch {
    return null;
  }
}

export const EmptyPageContainer: React.FC<EmptyPageContainerProps> = ({
  item,
  grandchildren,
  allItems = [],
  onSelectGrandchild,
  isAdminMode = false,
  onOpenNavManager,
}) => {
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [brokenThumbIds, setBrokenThumbIds] = useState<Set<string>>(new Set());
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ completed: number; total: number } | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
  const latestAllItemsRef = useRef<NavigationItem[]>(allItems);
  const latestGrandchildrenRef = useRef<NavigationItem[]>(grandchildren);

  useEffect(() => {
    latestAllItemsRef.current = allItems;
    latestGrandchildrenRef.current = grandchildren;
  }, [allItems, grandchildren]);

  const childLevelLabel =
    item.type === 'parent' ? 'Bravo' : item.type === 'child' ? 'Charlie' : 'Delta';

  const eligiblePdfs = grandchildren.filter(isEligibleDrivePdf);
  const readyThumbnailsCount = eligiblePdfs.filter(
    (g) =>
      Boolean(g.thumbnailUrl) &&
      (g.thumbnailStatus === 'generated' || g.thumbnailStatus === 'ready') &&
      !brokenThumbIds.has(g.id)
  ).length;

  const resolveFullNavigationList = (): NavigationItem[] => {
    const cached = localStorage.getItem('kpmbp_navigation_items_v4');
    const currentAll = latestAllItemsRef.current;
    const currentGrandchildren = latestGrandchildrenRef.current;
    let fullList: NavigationItem[] = currentAll.length > 0 ? currentAll : currentGrandchildren;
    if (cached && fullList.length <= currentGrandchildren.length) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > fullList.length) {
          fullList = parsed;
        }
      } catch {
        // fallback
      }
    }
    return fullList;
  };

  // Single Item Thumbnail Regeneration (Admin) — strictly non-fatal
  const handleRegenerateThumbnail = async (e: React.MouseEvent, gc: NavigationItem) => {
    e.stopPropagation();
    if (generatingIds.has(gc.id)) return;

    setGeneratingIds((prev) => new Set(prev).add(gc.id));
    setBrokenThumbIds((prev) => {
      if (!prev.has(gc.id)) return prev;
      const next = new Set(prev);
      next.delete(gc.id);
      return next;
    });
    setNotification(null);

    try {
      const baselineGeneratedAt = gc.thumbnailGeneratedAt;
      const result = await generateThumbnailForItem(gc, true);
      const updatedList = resolveFullNavigationList().map((itm) =>
        itm.id === gc.id
          ? applyValidatedThumbnailOutcome(itm, result.item, baselineGeneratedAt)
          : itm
      );
      try {
        await saveNavigationItems(updatedList);
      } catch (saveErr: any) {
        console.warn('[EmptyPageContainer] Non-fatal thumbnail status save notice:', saveErr?.message || saveErr);
      }

      if (result.success) {
        setNotification({
          type: 'success',
          message: `Thumbnail bagi "${gc.name}" berjaya dijana dan dimuat naik ke Firebase Storage.`,
        });
      } else {
        setNotification({
          type: 'warning',
          message: `Thumbnail bagi "${gc.name}" gagal dijana (${result.error || 'sumber PDF tidak dapat dicapai'}), namun dokumen masih boleh dibuka seperti biasa.`,
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'warning',
        message: `Penjanaan thumbnail gagal (${err?.message || 'ralat tidak diketahui'}), namun dokumen "${gc.name}" masih boleh dibuka seperti biasa.`,
      });
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(gc.id);
        return next;
      });
    }
  };

  // Bulk Generation for all eligible grandchildren in this container (Admin)
  const handleBulkGenerate = async (onlyFailed = false) => {
    if (isBulkGenerating || eligiblePdfs.length === 0) return;

    const targetEligible = onlyFailed
      ? eligiblePdfs.filter((g) => g.thumbnailStatus === 'failed' || g.thumbnailStatus === 'error' || !g.thumbnailUrl)
      : eligiblePdfs;

    if (targetEligible.length === 0) {
      setNotification({
        type: 'success',
        message: 'Semua thumbnail dokumen telah tersedia dalam status berjaya.',
      });
      return;
    }

    setIsBulkGenerating(true);
    setBulkProgress({ completed: 0, total: targetEligible.length });
    setNotification(null);

    try {
      const fullList = resolveFullNavigationList();
      const result = await generateBulkThumbnails(
        fullList,
        true,
        (p) => {
          setBulkProgress({ completed: p.completed, total: p.total });
        },
        () => resolveFullNavigationList()
      );

      setNotification({
        type: result.failureCount > 0 ? 'warning' : 'success',
        message:
          result.failureCount > 0
            ? `Selesai (tidak menyekat paparan): ${result.successCount} berjaya, ${result.failureCount} gagal, ${result.skippedCount} dilangkau. Semua dokumen kekal boleh dibuka.`
            : `Selesai: ${result.successCount} thumbnail berjaya dijana & disimpan ke Firebase Storage (${result.failureCount} gagal, ${result.skippedCount} dilangkau).`,
      });
    } catch (err: any) {
      setNotification({
        type: 'warning',
        message: err?.message || 'Ralat semasa memproses thumbnail pukal. Semua dokumen masih boleh dibuka.',
      });
    } finally {
      setIsBulkGenerating(false);
      setBulkProgress(null);
    }
  };

  // Classify each item consistently across navigation levels
  const classifyItem = (gc: NavigationItem): 'container' | 'pdf' | 'link' | 'module' => {
    const nestedChildren = allItems.filter((sub) => sub.parentId === gc.id && sub.isActive);
    const isDrive = gc.displayType === 'drive' || Boolean(gc.driveUrl);
    const isExternalLink = !isDrive && /^https?:\/\//i.test(gc.destination || '');
    const isContainer =
      gc.displayType === 'empty_page' ||
      (!isDrive && !isExternalLink && gc.destination === gc.id && nestedChildren.length > 0);

    if (isContainer) return 'container';
    if (isDrive) return 'pdf';
    if (isExternalLink) return 'link';
    return 'module';
  };

  const indexedEntries = grandchildren.map((gc, idx) => ({
    gc,
    displayOrder: idx + 1,
    kind: classifyItem(gc),
  }));

  const containerEntries = indexedEntries.filter((e) => e.kind === 'container');
  const pdfEntries = indexedEntries.filter((e) => e.kind === 'pdf');
  const linkAndModuleEntries = indexedEntries.filter((e) => e.kind === 'link' || e.kind === 'module');
  const activeGroupCount =
    (containerEntries.length > 0 ? 1 : 0) +
    (pdfEntries.length > 0 ? 1 : 0) +
    (linkAndModuleEntries.length > 0 ? 1 : 0);

  const renderContainerCard = (gc: NavigationItem, displayOrder: number) => {
    const nestedItems = allItems
      .filter((sub) => sub.parentId === gc.id && sub.isActive)
      .sort((a, b) => a.order - b.order);
    const nestedCount = nestedItems.length;

    // Only eligible active Delta PDF documents are shown in PDF thumbnail slots
    const nestedPdfItems = nestedItems.filter(
      (sub) => sub.displayType !== 'empty_page' && isEligibleDrivePdf(sub)
    );
    const previewPdfDocs = nestedPdfItems.slice(0, 3);
    const extraPdfCount = Math.max(0, nestedPdfItems.length - 3);
    const nonPdfItems = nestedItems.filter(
      (sub) => sub.displayType === 'empty_page' || !isEligibleDrivePdf(sub)
    );

    const customDesc =
      gc.displayTitle && gc.displayTitle.trim() && gc.displayTitle.trim() !== gc.name.trim()
        ? gc.displayTitle.trim()
        : '';

    return (
      <button
        key={gc.id}
        type="button"
        onClick={() => onSelectGrandchild(gc)}
        className="glass-panel w-full h-full p-4 rounded-2xl sm:rounded-3xl border border-amber-200/90 hover:border-amber-400 bg-white hover:bg-gradient-to-br hover:from-white hover:to-amber-50/40 transition-all cursor-pointer shadow-2xs hover:shadow-md group flex flex-col justify-between gap-3.5 text-left focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <div className="space-y-3 min-w-0">
          {/* Container Header Row */}
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/90 text-amber-600 group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-500 transition-colors flex items-center justify-center shrink-0 shadow-2xs">
              <Folder className="w-5 h-5 group-hover:hidden" />
              <FolderOpen className="w-5 h-5 hidden group-hover:block" />
            </div>

            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                <span className="font-mono text-amber-800">
                  #{displayOrder} · Bekas Folder
                </span>
                <span className="tabular-nums text-amber-900 shrink-0">
                  {nestedCount} item
                </span>
              </div>

              <h4 className="font-sans font-extrabold text-slate-900 group-hover:text-amber-900 transition-colors text-sm sm:text-[15px] leading-snug line-clamp-2">
                {gc.name}
              </h4>

              {customDesc && (
                <p className="text-xs text-slate-500 font-medium leading-snug line-clamp-1">
                  {customDesc}
                </p>
              )}
            </div>
          </div>

          {/* Option B: Real Document Thumbnail Preview Shelf (Up to 3 active Delta PDFs) */}
          {previewPdfDocs.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {previewPdfDocs.map((docItem) => {
                  const persistentThumbUrl = getValidPersistentPdfThumbnailUrl(
                    docItem,
                    brokenThumbIds
                  );
                  return (
                    <div key={docItem.id} className="min-w-0 space-y-1.5">
                      <div className="w-full aspect-[3/4] rounded-xl border border-slate-200/90 bg-slate-50 overflow-hidden flex items-center justify-center shadow-2xs group-hover:border-amber-200/90 transition-colors">
                        {persistentThumbUrl ? (
                          <img
                            src={persistentThumbUrl}
                            alt={docItem.name}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-full h-full object-cover object-top bg-white"
                            onError={() => {
                              setBrokenThumbIds((prev) => new Set(prev).add(docItem.id));
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-1.5 bg-gradient-to-b from-slate-50 to-rose-50/40 text-center">
                            <FileText className="w-5 h-5 text-rose-500 shrink-0" />
                            <span className="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider">
                              PDF
                            </span>
                          </div>
                        )}
                      </div>
                      <p
                        title={docItem.name}
                        className="text-[10.5px] font-bold text-slate-700 leading-tight line-clamp-2"
                      >
                        {docItem.name}
                      </p>
                    </div>
                  );
                })}
              </div>

              {(extraPdfCount > 0 || nonPdfItems.length > 0) && (
                <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500 pt-0.5">
                  {extraPdfCount > 0 ? (
                    <span className="text-amber-800 tabular-nums">+{extraPdfCount} lagi</span>
                  ) : (
                    <span />
                  )}
                  {nonPdfItems.length > 0 && (
                    <span className="text-slate-500 tabular-nums truncate">
                      +{nonPdfItems.length} pautan/modul
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : nonPdfItems.length > 0 ? (
            /* Non-PDF items inside container: show link/module/folder indicators (never PDF thumbnails) */
            <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-2.5 space-y-1.5">
              {nonPdfItems.slice(0, 3).map((sub) => {
                const isSubExtLink = /^https?:\/\//i.test(sub.destination || '');
                const isSubFolder = sub.displayType === 'empty_page';
                return (
                  <div
                    key={sub.id}
                    className="flex items-center gap-2 text-xs text-slate-700 font-semibold min-w-0"
                  >
                    {isSubFolder ? (
                      <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : isSubExtLink ? (
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Layers className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    )}
                    <span className="truncate">{sub.name}</span>
                  </div>
                );
              })}
              {nonPdfItems.length > 3 && (
                <div className="text-[11px] font-bold text-amber-800 tabular-nums pl-5">
                  +{nonPdfItems.length - 3} lagi
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50/40 border border-dashed border-amber-200/80 px-3 py-3 text-xs text-slate-500 font-medium">
              Belum ada dokumen ditambah di dalam bekas ini.
            </div>
          )}
        </div>

        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-extrabold text-amber-700 group-hover:text-amber-800">
          <span>Buka Senarai Kandungan</span>
          <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 shrink-0" />
        </div>
      </button>
    );
  };

  const renderLinkOrModuleCard = (
    gc: NavigationItem,
    displayOrder: number,
    kind: 'link' | 'module'
  ) => {
    const isLink = kind === 'link';
    const hostname = isLink ? extractSafeHostname(gc.destination) : null;
    const customDesc =
      gc.displayTitle && gc.displayTitle.trim() && gc.displayTitle.trim() !== gc.name.trim()
        ? gc.displayTitle.trim()
        : '';
    const subtitle =
      customDesc ||
      (isLink
        ? hostname
          ? `Destinasi luar: ${hostname}`
          : 'Pautan laman web luaran rasmi'
        : 'Modul interaktif sistem direktori KPMBP');

    return (
      <button
        key={gc.id}
        type="button"
        onClick={() => onSelectGrandchild(gc)}
        className={`glass-panel w-full h-full p-4 rounded-2xl sm:rounded-3xl bg-white transition-all cursor-pointer shadow-2xs hover:shadow-md group flex flex-col justify-between gap-3 text-left focus-visible:outline-hidden focus-visible:ring-2 ${
          isLink
            ? 'border border-emerald-200/90 hover:border-emerald-400 hover:bg-gradient-to-br hover:from-white hover:to-emerald-50/40 focus-visible:ring-emerald-500'
            : 'border border-indigo-200/80 hover:border-indigo-400 hover:bg-gradient-to-br hover:from-white hover:to-indigo-50/40 focus-visible:ring-indigo-500'
        }`}
      >
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`w-11 h-11 rounded-2xl border transition-colors flex items-center justify-center shrink-0 shadow-2xs ${
              isLink
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white group-hover:border-emerald-600'
                : 'bg-indigo-50 border-indigo-200 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600'
            }`}
          >
            {isLink ? (
              <ExternalLink className="w-5 h-5" />
            ) : (
              renderNavIcon(gc.icon || 'Layers', 'w-5 h-5')
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
              <span className={`font-mono ${isLink ? 'text-emerald-800' : 'text-indigo-800'}`}>
                #{displayOrder} · {isLink ? 'Pautan Luar' : 'Modul'}
              </span>
              {hostname && (
                <span className="truncate max-w-[130px] text-slate-500 font-medium">
                  {hostname}
                </span>
              )}
            </div>

            <h4
              className={`font-sans font-extrabold text-slate-900 transition-colors text-sm sm:text-[15px] leading-snug line-clamp-2 ${
                isLink ? 'group-hover:text-emerald-800' : 'group-hover:text-indigo-800'
              }`}
            >
              {gc.name}
            </h4>

            <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
              {subtitle}
            </p>
          </div>
        </div>

        <div
          className={`pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-extrabold ${
            isLink
              ? 'text-emerald-700 group-hover:text-emerald-800'
              : 'text-indigo-700 group-hover:text-indigo-800'
          }`}
        >
          <span>{isLink ? 'Buka pautan luar' : 'Buka modul platform'}</span>
          {isLink ? (
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 shrink-0" />
          )}
        </div>
      </button>
    );
  };

  const renderPdfCard = (gc: NavigationItem, displayOrder: number) => {
    const isEligible = isEligibleDrivePdf(gc);
    const isGenerating =
      generatingIds.has(gc.id) ||
      gc.thumbnailStatus === 'processing' ||
      gc.thumbnailStatus === 'generating';
    const effectiveThumbnailUrl = gc.thumbnailUrl;
    const isImgBroken = brokenThumbIds.has(gc.id);
    const hasThumbnail =
      Boolean(effectiveThumbnailUrl) &&
      gc.thumbnailStatus !== 'failed' &&
      gc.thumbnailStatus !== 'error' &&
      !isGenerating &&
      !isImgBroken;
    const isFailed =
      !isGenerating &&
      (gc.thumbnailStatus === 'failed' || gc.thumbnailStatus === 'error' || isImgBroken);

    return (
      <div
        key={gc.id}
        role="button"
        tabIndex={0}
        onClick={() => onSelectGrandchild(gc)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectGrandchild(gc);
          }
        }}
        className="glass-panel h-full p-4 rounded-3xl border border-slate-200/80 hover:border-indigo-400 bg-white hover:bg-gradient-to-br hover:from-white hover:to-indigo-50/30 transition-all cursor-pointer shadow-2xs hover:shadow-lg group flex flex-col justify-between gap-3 text-left relative overflow-hidden focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        <div className="space-y-3">
          {/* First Page PDF Preview Thumbnail Display */}
          <div className="w-full aspect-[4/3] bg-gradient-to-b from-slate-50 via-slate-100/70 to-slate-200/50 rounded-2xl overflow-hidden relative border border-slate-200/90 flex items-center justify-center p-2 group-hover:border-indigo-300 transition-colors shadow-inner">
            {isGenerating ? (
              <div className="flex flex-col items-center justify-center gap-2 text-indigo-600">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="text-[10px] font-bold text-slate-500">
                  Menjana thumbnail muka surat 1...
                </span>
              </div>
            ) : hasThumbnail ? (
              <img
                src={effectiveThumbnailUrl}
                alt={`Lakaran muka surat 1 - ${gc.name}`}
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain rounded drop-shadow-sm transition-transform duration-300 group-hover:scale-[1.02]"
                loading="lazy"
                onError={() => {
                  setBrokenThumbIds((prev) => new Set(prev).add(gc.id));
                }}
              />
            ) : (
              /* Fallback PDF Card (Consistent Card Dimensions, Always Clickable) */
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center p-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-2xs group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] font-extrabold text-slate-700 block">
                    Dokumen PDF Rasmi
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {isFailed && isAdminMode ? (
                      <span className="text-amber-700 font-bold" title={gc.thumbnailError}>
                        Thumbnail gagal — klik kad untuk buka
                      </span>
                    ) : (
                      'Klik untuk melihat kandungan'
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Top Badges */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-white/90 backdrop-blur-xs text-slate-700 border border-slate-200 shadow-2xs font-extrabold">
                #{displayOrder}
              </span>
            </div>

            <div className="absolute top-2.5 right-2.5 flex items-center gap-1">
              <span className="px-2 py-0.5 rounded-lg bg-slate-900/80 backdrop-blur-xs text-[9.5px] font-extrabold text-white uppercase tracking-wider flex items-center gap-1 shadow-2xs">
                <FileText className="w-3 h-3 text-rose-400" />
                <span>PDF</span>
              </span>

              {/* Admin Instant Single Regenerate Button */}
              {isAdminMode && isEligible && (
                <button
                  type="button"
                  onClick={(e) => handleRegenerateThumbnail(e, gc)}
                  disabled={isGenerating}
                  title="Jana Semula Thumbnail untuk dokumen ini"
                  className="p-1.5 bg-white/90 hover:bg-white text-indigo-700 hover:text-indigo-900 rounded-lg shadow-2xs border border-indigo-100 transition-all cursor-pointer active:scale-90"
                >
                  <RotateCcw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          {/* Document Title & Icon */}
          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0 border border-indigo-100">
              {renderNavIcon(gc.icon, 'w-3.5 h-3.5')}
            </div>
            <h4 className="font-sans font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm leading-snug line-clamp-2">
              {gc.name}
            </h4>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5 text-left animate-fadeIn">
      {/* 1. Compact Context-Aware Container Header */}
      <div className="glass-panel rounded-2xl sm:rounded-3xl px-4 py-3.5 sm:px-5 sm:py-4 border border-white/60 shadow-xs bg-white/95 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white flex items-center justify-center shadow-xs shadow-amber-200 shrink-0">
              <FolderOpen className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex items-center gap-2 flex-wrap">
              <h2 className="font-sans font-black text-slate-900 text-lg sm:text-xl tracking-tight leading-tight truncate">
                {item.name}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-amber-50 text-amber-900 border border-amber-200/80 tabular-nums shrink-0">
                {grandchildren.length}{' '}
                {grandchildren.length > 0 && pdfEntries.length === grandchildren.length
                  ? 'dokumen'
                  : 'item'}
              </span>
            </div>
          </div>

          {/* Admin Fast-track Buttons */}
          {isAdminMode && (
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {eligiblePdfs.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleBulkGenerate(false)}
                  disabled={isBulkGenerating}
                  title="Jana Semula Semua Thumbnail PDF di halaman ini"
                  className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {isBulkGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>
                        Menjana... ({bulkProgress?.completed}/{bulkProgress?.total})
                      </span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Jana Thumbnail ({readyThumbnailsCount}/{eligiblePdfs.length})</span>
                    </>
                  )}
                </button>
              )}

              {onOpenNavManager && (
                <button
                  type="button"
                  onClick={onOpenNavManager}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Urus / Tambah {childLevelLabel}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : notification.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : notification.type === 'warning' ? (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
          >
            ×
          </button>
        </div>
      )}

      {/* 2. Content Section: Separated by Visual Content Group for Consistent Card Proportions */}
      {grandchildren.length > 0 ? (
        <div className="space-y-6">
          {/* Group A: Container / Folder Cards (Compact Folder Layout) */}
          {containerEntries.length > 0 && (
            <section className="space-y-3" aria-label="Senarai Bekas Kandungan">
              {activeGroupCount > 1 && (
                <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-2 px-1">
                  <FolderTree className="w-3.5 h-3.5 text-amber-600" />
                  <span>Bekas Kandungan ({containerEntries.length})</span>
                </h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 items-stretch">
                {containerEntries.map(({ gc, displayOrder }) =>
                  renderContainerCard(gc, displayOrder)
                )}
              </div>
            </section>
          )}

          {/* Group B: PDF Document Cards (Preserved 4:3 Thumbnail Preview) */}
          {pdfEntries.length > 0 && (
            <section className="space-y-3" aria-label="Senarai Dokumen PDF">
              {activeGroupCount > 1 && (
                <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-2 px-1">
                  <FileText className="w-3.5 h-3.5 text-rose-600" />
                  <span>Dokumen PDF ({pdfEntries.length})</span>
                </h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
                {pdfEntries.map(({ gc, displayOrder }) => renderPdfCard(gc, displayOrder))}
              </div>
            </section>
          )}

          {/* Group C: External Link & Module Cards (Compact Link / Module Layout) */}
          {linkAndModuleEntries.length > 0 && (
            <section className="space-y-3" aria-label="Senarai Pautan Luar dan Modul">
              {activeGroupCount > 1 && (
                <h3 className="text-xs font-extrabold text-slate-600 uppercase tracking-wider flex items-center gap-2 px-1">
                  <Layers className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Pautan Luar &amp; Modul ({linkAndModuleEntries.length})</span>
                </h3>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 items-stretch">
                {linkAndModuleEntries.map(({ gc, displayOrder, kind }) =>
                  renderLinkOrModuleCard(gc, displayOrder, kind as 'link' | 'module')
                )}
              </div>
            </section>
          )}
        </div>
      ) : (
        /* Clean Empty State when Container has no items yet */
        <div className="glass-panel rounded-3xl p-8 sm:p-10 text-center max-w-lg mx-auto space-y-4 border border-dashed border-amber-200/90 bg-amber-50/30">
          <div className="w-14 h-14 bg-white border border-amber-200 rounded-2xl flex items-center justify-center mx-auto text-amber-600 shadow-sm">
            <FolderTree className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="font-sans font-black text-slate-900 text-base sm:text-lg">
              Tiada Dokumen Buat Masa Ini
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto font-medium">
              Kandungan bagi bahagian <b>"{item.name}"</b> belum ditambah lagi.
            </p>
          </div>

          {isAdminMode && onOpenNavManager && (
            <div className="pt-1">
              <button
                type="button"
                onClick={onOpenNavManager}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah {childLevelLabel} di bawah {item.name}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

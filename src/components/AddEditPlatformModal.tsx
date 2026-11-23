/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — ADD / EDIT PLATFORM MODAL
 * SYNCROZZ ENGINEERING STANDARD
 *
 * Dedicated Administrator CRUD modal for external Platform links
 * stored in /platforms/directkpmbp/platformLinks/{platformId}.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  ExternalLink,
  Loader2,
  Globe,
  Image as ImageIcon,
  Trash2,
  Check,
  AlertCircle,
  Upload,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ArrowUpDown,
  Camera,
  RefreshCw,
} from 'lucide-react';
import { PlatformLink, PlatformThumbnailSource, PortalMetadata } from '../types';
import {
  requestUrlMetadata,
  uploadPlatformAsset,
  requestPlatformHomepageSnapshot,
  cleanupOrphanPlatformAssetUrl,
  resolvePlatformVisual,
  normalizePlatformUrl,
} from '../services/platformService';

interface AddEditPlatformModalProps {
  isOpen: boolean;
  onClose: () => void;
  platform: PlatformLink | null;
  onSave: (platform: PlatformLink) => Promise<void>;
  onDelete?: (platformId: string) => Promise<void>;
  existingCount: number;
}

export const AddEditPlatformModal: React.FC<AddEditPlatformModalProps> = ({
  isOpen,
  onClose,
  platform,
  onSave,
  onDelete,
  existingCount,
}) => {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [thumbnailSource, setThumbnailSource] = useState<PlatformThumbnailSource>('placeholder');
  const [thumbnailGeneratedAt, setThumbnailGeneratedAt] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  const [detectedMeta, setDetectedMeta] = useState<PortalMetadata | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);
  const [detectState, setDetectState] = useState<'idle' | 'loading' | 'success' | 'partial' | 'error'>('idle');
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [snapshotFailedFallbackApplied, setSnapshotFailedFallbackApplied] = useState(false);
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);

  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewThumbFailed, setPreviewThumbFailed] = useState(false);
  const [previewLogoFailed, setPreviewLogoFailed] = useState(false);

  const [manuallyModified, setManuallyModified] = useState({
    name: false,
    description: false,
    logoUrl: false,
    thumbnailUrl: false,
  });

  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const thumbFileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionUploadedUrlsRef = useRef<Set<string>>(new Set());
  const snapshotInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const handleCloseSafely = () => {
    const initialThumb = platform?.thumbnailUrl?.trim();
    const pendingToClean = Array.from(sessionUploadedUrlsRef.current).filter(
      (uploaded) => uploaded && uploaded !== initialThumb
    );
    sessionUploadedUrlsRef.current.clear();
    if (pendingToClean.length > 0) {
      Promise.all(
        pendingToClean.map((assetUrl) => cleanupOrphanPlatformAssetUrl(assetUrl, platform?.id || ''))
      ).catch(() => {});
    }
    onClose();
  };

  // Body scroll lock & Escape close
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        handleCloseSafely();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isSaving]);

  useEffect(() => {
    if (!isOpen) return;

    sessionUploadedUrlsRef.current.clear();
    snapshotInFlightRef.current = null;

    if (platform) {
      setUrl(platform.url || '');
      setName(platform.name || '');
      setDescription(platform.description || '');
      setLogoUrl(platform.logoUrl || '');
      setThumbnailUrl(platform.thumbnailUrl || '');
      const inferredSource: PlatformThumbnailSource =
        platform.thumbnailSource ||
        (platform.thumbnailUrl
          ? platform.detectedMeta?.ogImage === platform.thumbnailUrl
            ? 'og_image'
            : 'custom_upload'
          : platform.detectedMeta?.ogImage
            ? 'og_image'
            : platform.logoUrl || platform.detectedMeta?.favicon || platform.detectedMeta?.pwaIcon
              ? 'favicon'
              : 'placeholder');
      setThumbnailSource(inferredSource);
      setThumbnailGeneratedAt(platform.thumbnailGeneratedAt);
      setSortOrder(platform.sortOrder ?? existingCount + 1);
      setIsActive(platform.isActive !== false);

      if (platform.detectedMeta) {
        setDetectedMeta({
          url: platform.url,
          title: platform.detectedMeta.title,
          description: platform.detectedMeta.description,
          ogTitle: platform.detectedMeta.ogTitle || platform.detectedMeta.title,
          ogDescription: platform.detectedMeta.ogDescription || platform.detectedMeta.description,
          ogImage: platform.detectedMeta.ogImage,
          ogUrl: platform.detectedMeta.ogUrl,
          ogSiteName: platform.detectedMeta.ogSiteName,
          favicon: platform.detectedMeta.favicon,
          manifestIcons: platform.detectedMeta.pwaIcon ? [{ src: platform.detectedMeta.pwaIcon }] : undefined,
        });
      } else {
        setDetectedMeta(null);
      }

      setManuallyModified({
        name: true,
        description: true,
        logoUrl: Boolean(platform.logoUrl),
        thumbnailUrl: Boolean(platform.thumbnailUrl && inferredSource === 'custom_upload'),
      });
    } else {
      setUrl('');
      setName('');
      setDescription('');
      setLogoUrl('');
      setThumbnailUrl('');
      setThumbnailSource('placeholder');
      setThumbnailGeneratedAt(undefined);
      setSortOrder(existingCount + 1);
      setIsActive(true);
      setDetectedMeta(null);
      setManuallyModified({
        name: false,
        description: false,
        logoUrl: false,
        thumbnailUrl: false,
      });
    }

    setDetectState('idle');
    setDetectStatus(null);
    setDetectError(null);
    setIsGeneratingSnapshot(false);
    setSnapshotFailedFallbackApplied(false);
    setSnapshotNotice(null);
    setErrorMessage(null);
    setConfirmingDelete(false);
    setPreviewThumbFailed(false);
    setPreviewLogoFailed(false);
  }, [isOpen, platform, existingCount]);

  if (!isOpen) return null;

  const applyFallbackThumbnail = (
    meta: PortalMetadata | null,
    failureReason: string,
    currentLogo: string
  ) => {
    const ogImg = meta?.ogImage?.trim();
    const fav = meta?.manifestIcons?.[0]?.src || meta?.favicon || currentLogo.trim();

    if (ogImg) {
      setThumbnailUrl(ogImg);
      setThumbnailSource('og_image');
    } else if (fav) {
      setThumbnailUrl('');
      setThumbnailSource('favicon');
    } else {
      setThumbnailUrl('');
      setThumbnailSource('placeholder');
    }
    setThumbnailGeneratedAt(undefined);
    setSnapshotFailedFallbackApplied(true);
    setSnapshotNotice(failureReason);
    setPreviewThumbFailed(false);
  };

  const handleDetectMetadata = async (
    targetUrl?: string,
    options: { captureSnapshot?: boolean; forceSnapshot?: boolean } = { captureSnapshot: true }
  ) => {
    const raw = (targetUrl ?? url).trim();
    if (!raw) {
      setDetectState('error');
      setDetectError('Sila masukkan URL platform terlebih dahulu.');
      return;
    }

    const formattedUrl = normalizePlatformUrl(raw);
    setUrl(formattedUrl);

    const shouldCaptureSnapshot =
      Boolean(options.forceSnapshot) ||
      (options.captureSnapshot !== false && !manuallyModified.thumbnailUrl);

    if (shouldCaptureSnapshot && snapshotInFlightRef.current === formattedUrl) {
      return;
    }

    try {
      setIsDetecting(true);
      setDetectState('loading');
      setDetectStatus(
        shouldCaptureSnapshot
          ? 'Mengesan metadata & menangkap paparan halaman utama (1440x810)...'
          : 'Sedang menganalisis metadata platform...'
      );
      setDetectError(null);

      if (shouldCaptureSnapshot) {
        setIsGeneratingSnapshot(true);
        snapshotInFlightRef.current = formattedUrl;
      }

      const [metaOutcome, snapOutcome] = await Promise.all([
        requestUrlMetadata(formattedUrl)
          .then((res) => ({ ok: true as const, res }))
          .catch((err) => ({ ok: false as const, err })),
        shouldCaptureSnapshot
          ? requestPlatformHomepageSnapshot(formattedUrl, thumbnailUrl)
          : Promise.resolve(null),
      ]);

      let latestMeta: PortalMetadata | null = detectedMeta;
      let resolvedLogo = logoUrl;

      if (metaOutcome.ok) {
        const { data: meta } = metaOutcome.res;
        latestMeta = meta;
        setDetectedMeta(meta);

        if (!manuallyModified.name || !name.trim()) {
          const detectedName = meta.ogTitle || meta.title || meta.manifestName || meta.ogSiteName;
          if (detectedName) setName(detectedName.slice(0, 200));
        }

        if (!manuallyModified.description || !description.trim()) {
          const detectedDesc = meta.ogDescription || meta.description;
          if (detectedDesc) setDescription(detectedDesc.slice(0, 1000));
        }

        if (!manuallyModified.logoUrl && !logoUrl.trim()) {
          const iconCandidate = meta.manifestIcons?.[0]?.src || meta.favicon;
          if (iconCandidate) {
            resolvedLogo = iconCandidate;
            setLogoUrl(iconCandidate);
            setPreviewLogoFailed(false);
          }
        }
      }

      if (snapOutcome) {
        if (snapOutcome.ok) {
          if (!snapOutcome.reusedExisting) {
            sessionUploadedUrlsRef.current.add(snapOutcome.thumbnailUrl);
          }
          setThumbnailUrl(snapOutcome.thumbnailUrl);
          setThumbnailSource('homepage_snapshot');
          setThumbnailGeneratedAt(snapOutcome.thumbnailGeneratedAt);
          setSnapshotFailedFallbackApplied(false);
          setSnapshotNotice(null);
          setPreviewThumbFailed(false);
          setManuallyModified((prev) => ({ ...prev, thumbnailUrl: false }));
        } else {
          console.warn('[PlatformSnapshot] Fallback applied:', snapOutcome.code, snapOutcome.error);
          if (!manuallyModified.thumbnailUrl) {
            applyFallbackThumbnail(latestMeta, snapOutcome.error, resolvedLogo);
          } else {
            setSnapshotFailedFallbackApplied(true);
            setSnapshotNotice(snapOutcome.error);
          }
        }
      } else if (metaOutcome.ok && !manuallyModified.thumbnailUrl && !thumbnailUrl.trim()) {
        // Lightweight debounce metadata detection before snapshot click
        const meta = metaOutcome.res.data;
        if (meta.ogImage) {
          setThumbnailUrl(meta.ogImage);
          setThumbnailSource('og_image');
        } else if (meta.manifestIcons?.[0]?.src || meta.favicon) {
          setThumbnailSource('favicon');
        } else {
          setThumbnailSource('placeholder');
        }
      }

      if (metaOutcome.ok && (!snapOutcome || snapOutcome.ok)) {
        const status = metaOutcome.res.status;
        if (status === 'success') {
          setDetectState('success');
          setDetectStatus(
            snapOutcome?.ok
              ? 'Metadata & snapshot halaman utama (WebP 640x360) berjaya dijana.'
              : 'Metadata platform berjaya dikesan secara automatik.'
          );
        } else {
          setDetectState('partial');
          setDetectStatus(
            snapOutcome?.ok
              ? 'Snapshot halaman utama berjaya dijana. Maklumat teks separa dikesan.'
              : 'Metadata separa dikesan. Anda boleh melengkapkan maklumat secara manual.'
          );
        }
      } else if (metaOutcome.ok && snapOutcome && !snapOutcome.ok) {
        setDetectState('partial');
        setDetectStatus('Metadata platform dikesan, tetapi snapshot halaman utama gagal — fallback digunakan.');
      } else if (snapOutcome && 'thumbnailUrl' in snapOutcome) {
        setDetectState('partial');
        setDetectStatus('Snapshot halaman utama berjaya dijana. Sila semak nama & deskripsi.');
      } else if ('err' in metaOutcome) {
        // Do not block registration if both metadata and snapshot fail
        setDetectState('partial');
        setDetectStatus(null);
        setDetectError(
          metaOutcome.err?.message ||
            'Pengesanan automatik terhad. Fallback digunakan dan anda masih boleh mengisi maklumat secara manual.'
        );
      }
    } finally {
      snapshotInFlightRef.current = null;
      setIsGeneratingSnapshot(false);
      setIsDetecting(false);
    }
  };

  const handleRegenerateSnapshot = async () => {
    const raw = url.trim();
    if (!raw) {
      setErrorMessage('Sila masukkan URL platform sebelum menjana semula snapshot.');
      return;
    }

    const formattedUrl = normalizePlatformUrl(raw);
    setUrl(formattedUrl);
    if (snapshotInFlightRef.current === formattedUrl) return;

    try {
      setIsGeneratingSnapshot(true);
      snapshotInFlightRef.current = formattedUrl;
      setErrorMessage(null);
      setSnapshotNotice(null);

      const snapOutcome = await requestPlatformHomepageSnapshot(formattedUrl, thumbnailUrl);
      if ('thumbnailUrl' in snapOutcome) {
        if (!snapOutcome.reusedExisting) {
          sessionUploadedUrlsRef.current.add(snapOutcome.thumbnailUrl);
        }
        setThumbnailUrl(snapOutcome.thumbnailUrl);
        setThumbnailSource('homepage_snapshot');
        setThumbnailGeneratedAt(snapOutcome.thumbnailGeneratedAt);
        setSnapshotFailedFallbackApplied(false);
        setSnapshotNotice(null);
        setPreviewThumbFailed(false);
        setManuallyModified((prev) => ({ ...prev, thumbnailUrl: false }));
      } else {
        console.warn('[PlatformSnapshot] Regenerate failed, applying fallback:', snapOutcome.code, snapOutcome.error);
        applyFallbackThumbnail(detectedMeta, snapOutcome.error, logoUrl);
      }
    } finally {
      snapshotInFlightRef.current = null;
      setIsGeneratingSnapshot(false);
    }
  };

  const handleUrlChange = (val: string) => {
    setUrl(val);
    setDetectState('idle');
    setDetectStatus(null);
    setDetectError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = val.trim();
    if (
      trimmed.length > 7 &&
      (trimmed.startsWith('http://') || trimmed.startsWith('https://') || (trimmed.includes('.') && !trimmed.endsWith('.')))
    ) {
      debounceTimerRef.current = setTimeout(() => {
        handleDetectMetadata(trimmed, { captureSnapshot: false });
      }, 700);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingLogo(true);
      setErrorMessage(null);
      const uploaded = await uploadPlatformAsset(file, 'logo');
      setLogoUrl(uploaded);
      setManuallyModified((prev) => ({ ...prev, logoUrl: true }));
      setPreviewLogoFailed(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat naik logo platform.');
    } finally {
      setIsUploadingLogo(false);
      if (logoFileInputRef.current) logoFileInputRef.current.value = '';
    }
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingThumbnail(true);
      setErrorMessage(null);
      const uploaded = await uploadPlatformAsset(file, 'thumbnail');
      sessionUploadedUrlsRef.current.add(uploaded);
      setThumbnailUrl(uploaded);
      setThumbnailSource('custom_upload');
      setThumbnailGeneratedAt(new Date().toISOString());
      setSnapshotFailedFallbackApplied(false);
      setSnapshotNotice(null);
      setManuallyModified((prev) => ({ ...prev, thumbnailUrl: true }));
      setPreviewThumbFailed(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Gagal memuat naik thumbnail platform.');
    } finally {
      setIsUploadingThumbnail(false);
      if (thumbFileInputRef.current) thumbFileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Sila masukkan nama platform.');
      return;
    }
    if (!url.trim()) {
      setErrorMessage('Sila masukkan URL platform.');
      return;
    }

    const finalUrl = normalizePlatformUrl(url);
    const detectedData: Record<string, string> = {};
    if (detectedMeta) {
      const dt = detectedMeta.ogTitle || detectedMeta.title;
      if (dt) {
        detectedData.title = dt;
        detectedData.ogTitle = dt;
      }
      const dd = detectedMeta.ogDescription || detectedMeta.description;
      if (dd) {
        detectedData.description = dd;
        detectedData.ogDescription = dd;
      }
      if (detectedMeta.ogImage) detectedData.ogImage = detectedMeta.ogImage;
      if (detectedMeta.ogUrl) detectedData.ogUrl = detectedMeta.ogUrl;
      if (detectedMeta.ogSiteName) detectedData.ogSiteName = detectedMeta.ogSiteName;
      if (detectedMeta.favicon) detectedData.favicon = detectedMeta.favicon;
      const pwa = detectedMeta.manifestIcons?.[0]?.src;
      if (pwa) detectedData.pwaIcon = pwa;
      if (detectedMeta.manifestName) detectedData.manifestName = detectedMeta.manifestName;
    }

    const resolvedEffectiveSource: PlatformThumbnailSource = thumbnailUrl.trim()
      ? thumbnailSource === 'homepage_snapshot' || thumbnailSource === 'custom_upload' || thumbnailSource === 'og_image'
        ? thumbnailSource
        : 'custom_upload'
      : logoUrl.trim() || detectedMeta?.favicon || detectedMeta?.manifestIcons?.[0]?.src
        ? 'favicon'
        : 'placeholder';

    const payload: PlatformLink = {
      id: platform?.id || `platform_${Date.now()}`,
      name: name.trim().slice(0, 200),
      url: finalUrl,
      description: description.trim().slice(0, 1000),
      logoUrl: logoUrl.trim(),
      thumbnailUrl: thumbnailUrl.trim(),
      thumbnailSource: resolvedEffectiveSource,
      ...(thumbnailGeneratedAt ? { thumbnailGeneratedAt } : {}),
      sortOrder: Number.isFinite(Number(sortOrder)) && Number(sortOrder) >= 0 ? Number(sortOrder) : existingCount + 1,
      isActive,
      createdAt: platform?.createdAt || new Date().toISOString(),
      ...(Object.keys(detectedData).length > 0
        ? { detectedMeta: detectedData }
        : platform?.detectedMeta
          ? { detectedMeta: platform.detectedMeta }
          : {}),
    };

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSave(payload);

      // Clean up any temporary session-uploaded snapshots/assets discarded before final save
      const initialThumb = platform?.thumbnailUrl?.trim();
      const discardedUploads = Array.from(sessionUploadedUrlsRef.current).filter(
        (uploaded) => uploaded && uploaded !== payload.thumbnailUrl && uploaded !== initialThumb
      );
      sessionUploadedUrlsRef.current.clear();
      if (discardedUploads.length > 0) {
        Promise.all(
          discardedUploads.map((assetUrl) => cleanupOrphanPlatformAssetUrl(assetUrl, payload.id))
        ).catch(() => {});
      }

      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ralat semasa menyimpan platform ke Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!platform?.id || !onDelete) return;
    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onDelete(platform.id);
      sessionUploadedUrlsRef.current.clear();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ralat semasa memadam platform.');
    } finally {
      setIsSaving(false);
    }
  };

  const visual = resolvePlatformVisual({
    url: url.trim() || 'https://bpenawar.kpm.edu.my/',
    logoUrl,
    thumbnailUrl,
    thumbnailSource,
    detectedMeta: {
      ogImage: detectedMeta?.ogImage,
      favicon: detectedMeta?.favicon,
      pwaIcon: detectedMeta?.manifestIcons?.[0]?.src,
    },
  });

  const getThumbnailStatusLabel = (): { label: string; tone: string } => {
    if (previewThumbFailed && thumbnailSource === 'og_image') {
      return logoUrl.trim() || detectedMeta?.favicon
        ? { label: 'Favicon Used', tone: 'bg-amber-50 text-amber-800 border-amber-200' }
        : { label: 'Default Placeholder Used', tone: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
    switch (thumbnailSource) {
      case 'homepage_snapshot':
        return { label: 'Homepage Snapshot Generated', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'og_image':
        return { label: 'OG Image Used', tone: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
      case 'favicon':
        return { label: 'Favicon Used', tone: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'custom_upload':
        return { label: 'Custom Image Used', tone: 'bg-violet-50 text-violet-800 border-violet-200' };
      default:
        return { label: 'Default Placeholder Used', tone: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const thumbBadge = getThumbnailStatusLabel();

  const domainDisplay = (url.trim() || 'https://contoh-platform.edu.my')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="platform-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) handleCloseSafely();
      }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90dvh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 text-left overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="shrink-0 px-5 sm:px-7 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 id="platform-modal-title" className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                {platform ? 'Kemaskini Platform' : 'Tambah Platform Baharu'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                Pengurusan Pautan Platform Luar di bawah Rujukan Kolej
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseSafely}
            disabled={isSaving}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-5">
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Live Card Preview */}
            <div className="space-y-2.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-600" />
                  Pratonton Kad Platform
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${thumbBadge.tone}`}>
                    {thumbBadge.label}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Susunan #{sortOrder}
                  </span>
                  <span
                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                  >
                    {isActive ? 'Dipaparkan' : 'Disembunyikan'}
                  </span>
                </div>
              </div>

              <div className={`glass-card rounded-[22px] border border-slate-200 shadow-sm overflow-hidden flex flex-col ${!isActive ? 'opacity-60' : ''}`}>
                {isGeneratingSnapshot ? (
                  <div className="relative w-full aspect-video bg-slate-100 border-b border-slate-100 flex flex-col items-center justify-center gap-2 text-slate-600">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                    <span className="text-xs font-bold">Menangkap paparan halaman utama (1440×810 → WebP 640×360)...</span>
                  </div>
                ) : visual.thumbnail && !previewThumbFailed ? (
                  <div className="relative w-full aspect-video bg-slate-100 overflow-hidden border-b border-slate-100">
                    <img
                      src={visual.thumbnail}
                      alt={name || 'Pratonton Platform'}
                      onError={() => setPreviewThumbFailed(true)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent" />
                  </div>
                ) : (
                  <div className="p-4 bg-gradient-to-r from-emerald-50/90 via-white to-teal-50/70 border-b border-emerald-100/70 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-emerald-100 flex items-center justify-center overflow-hidden shrink-0">
                      {visual.logo && !previewLogoFailed ? (
                        <img
                          src={visual.logo}
                          alt=""
                          onError={() => setPreviewLogoFailed(true)}
                          className="w-7 h-7 object-contain"
                        />
                      ) : (
                        <span className="text-base font-black text-emerald-700">
                          {(name.trim() || 'P').charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-extrabold text-emerald-800 block truncate">
                        {domainDisplay}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">Platform Rasmi / Rujukan</span>
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {visual.thumbnail && !previewThumbFailed && visual.logo && !previewLogoFailed && (
                      <img
                        src={visual.logo}
                        alt=""
                        onError={() => setPreviewLogoFailed(true)}
                        className="w-5 h-5 rounded-md object-contain bg-white border border-slate-200 p-0.5 shrink-0"
                      />
                    )}
                    <h4 className="font-sans font-extrabold text-slate-900 text-sm sm:text-base leading-snug truncate">
                      {name.trim() || 'Nama Platform'}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2">
                    {description.trim() || 'Penerangan ringkas fungsi dan akses platform luar...'}
                  </p>
                  <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[10px] font-mono text-slate-400 truncate max-w-[210px] flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-300 shrink-0" />
                      <span>{domainDisplay}</span>
                    </span>
                    <span className="text-xs font-extrabold text-emerald-700 flex items-center gap-1">
                      <span>Buka Platform</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1. URL & Auto-detection */}
            <div className="space-y-1.5 p-4 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-extrabold text-emerald-950">
                  1. URL Platform <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Pengesanan metadata automatik
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    placeholder="https://contoh-platform.edu.my"
                    className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {isDetecting && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 animate-spin" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDetectMetadata()}
                  disabled={isDetecting || !url.trim()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0"
                >
                  {isDetecting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Mengesan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Kesan Maklumat</span>
                    </>
                  )}
                </button>
              </div>

              {detectState === 'success' && (
                <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 mt-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{detectStatus}</span>
                </div>
              )}
              {detectState === 'partial' && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 mt-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{detectStatus}</span>
                </div>
              )}
              {detectState === 'error' && (
                <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 mt-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{detectError}</span>
                </div>
              )}
            </div>

            {/* 2. Platform Name */}
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1">
                <span>2. Nama Platform</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                maxLength={200}
                onChange={(e) => {
                  setName(e.target.value);
                  setManuallyModified((prev) => ({ ...prev, name: true }));
                }}
                placeholder="Contoh: Google Workspace KPMBP / Sistem Pengurusan Pembelajaran"
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* 3. Description */}
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700 block">
                3. Penerangan / Deskripsi
              </label>
              <textarea
                rows={3}
                value={description}
                maxLength={1000}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setManuallyModified((prev) => ({ ...prev, description: true }));
                }}
                placeholder="Penerangan ringkas mengenai kegunaan dan pautan platform..."
                className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            {/* 4. Logo & 5. Thumbnail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Logo */}
              <div className="space-y-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>4. Logo Platform</span>
                  </label>
                  {logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoUrl('');
                        setManuallyModified((prev) => ({ ...prev, logoUrl: false }));
                        setPreviewLogoFailed(false);
                      }}
                      className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                    >
                      Padam
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => {
                    setLogoUrl(e.target.value);
                    setManuallyModified((prev) => ({ ...prev, logoUrl: true }));
                    setPreviewLogoFailed(false);
                  }}
                  placeholder="https://.../logo.png atau muat naik"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  type="file"
                  ref={logoFileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/gif"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  className="w-full px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> : <Upload className="w-3.5 h-3.5 text-emerald-600" />}
                  <span>Muat Naik Logo</span>
                </button>
              </div>

              {/* Thumbnail & Homepage Snapshot Controls */}
              <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-indigo-600" />
                    <span>5. Thumbnail Kad (16:9)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${thumbBadge.tone}`}>
                      {thumbBadge.label}
                    </span>
                    {thumbnailUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setThumbnailUrl('');
                          setThumbnailSource(
                            logoUrl.trim() || detectedMeta?.favicon ? 'favicon' : 'placeholder'
                          );
                          setThumbnailGeneratedAt(undefined);
                          setSnapshotFailedFallbackApplied(false);
                          setSnapshotNotice(null);
                          setManuallyModified((prev) => ({ ...prev, thumbnailUrl: false }));
                          setPreviewThumbFailed(false);
                        }}
                        className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                      >
                        Padam
                      </button>
                    )}
                  </div>
                </div>

                {snapshotFailedFallbackApplied && (
                  <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-semibold text-amber-900 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-extrabold">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>Snapshot Failed — Fallback Applied</span>
                    </div>
                    {snapshotNotice && (
                      <p className="text-[10px] text-amber-800 leading-snug">{snapshotNotice}</p>
                    )}
                  </div>
                )}

                <input
                  type="text"
                  value={thumbnailUrl}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setThumbnailUrl(nextVal);
                    setThumbnailSource(nextVal.trim() ? 'custom_upload' : logoUrl.trim() ? 'favicon' : 'placeholder');
                    setSnapshotFailedFallbackApplied(false);
                    setManuallyModified((prev) => ({ ...prev, thumbnailUrl: Boolean(nextVal.trim()) }));
                    setPreviewThumbFailed(false);
                  }}
                  placeholder="Snapshot automatik atau URL imej 16:9"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <input
                  type="file"
                  ref={thumbFileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                  onChange={handleThumbnailUpload}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerateSnapshot}
                    disabled={isGeneratingSnapshot || isDetecting || !url.trim()}
                    className="w-full px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingSnapshot ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-700" />
                    )}
                    <span>Jana Semula Snapshot</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => thumbFileInputRef.current?.click()}
                    disabled={isUploadingThumbnail || isGeneratingSnapshot}
                    className="w-full px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isUploadingThumbnail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    ) : (
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                    )}
                    <span>Guna Imej Sendiri</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 6. Display Order & 7. Visibility */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
                  <span>6. Susunan Paparan</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value || '0', 10))}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                <p className="text-[10px] text-slate-500 font-medium">
                  Nombor lebih kecil dipaparkan terlebih dahulu.
                </p>
              </div>

              <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  {isActive ? <Eye className="w-3.5 h-3.5 text-emerald-600" /> : <EyeOff className="w-3.5 h-3.5 text-rose-500" />}
                  <span>7. Keterlihatan Awam</span>
                </label>
                <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-700">
                    {isActive ? 'Aktif (Dipaparkan)' : 'Disembunyikan'}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isActive}
                    onClick={() => setIsActive((prev) => !prev)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                        isActive ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  Hanya platform aktif kelihatan kepada pelawat umum.
                </p>
              </div>
            </div>

            {/* Delete Confirmation Box */}
            {platform && onDelete && confirmingDelete && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-rose-900">
                  Adakah anda pasti mahu memadam platform "{platform.name}"? Tindakan ini tidak boleh dikembalikan.
                </p>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isSaving}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Ya, Padam Platform</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fixed Footer */}
          <div className="shrink-0 px-5 sm:px-7 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2 flex-wrap">
            <div>
              {platform && onDelete && !confirmingDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={isSaving}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Padam</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={handleCloseSafely}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Simpan Platform</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

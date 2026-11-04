/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — FULL CUSTOM PORTAL METADATA OVERRIDE & EDITOR
 * SYNCROZZ ENGINEERING STANDARD
 * 
 * Features:
 * - Full manual override for all metadata fields (Name, Description, Image, Icon, URL, Audience, Category)
 * - Strict Image Priority hierarchy:
 *   1. Admin uploaded custom image / Admin custom image URL
 *   2. Admin supplied custom icon / Admin custom icon URL
 *   3. Automatically detected Open Graph image
 *   4. Automatically detected PWA image/icon or Favicon
 *   5. System default placeholder
 * - Metadata Priority: Admin manual values always take precedence. Re-detection never clobbers custom edits.
 * - Selective reset: Admin can reset individual fields to detected values.
 * - Firebase Storage upload with offline Base64 fallback.
 * - Broken image handling with graceful fallback.
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
  RefreshCw,
  Layers,
  ChevronRight,
  RotateCcw,
  Tag,
  Sliders,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { PortalLink, PortalMetadata } from '../types';
import { requestUrlMetadata, uploadPortalAsset, resolvePortalVisual } from '../services/portalService';

interface AddEditPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  portal: PortalLink | null;
  onSave: (portal: PortalLink) => Promise<void>;
  onDelete?: (portalId: string) => Promise<void>;
  existingCount: number;
}

const CATEGORY_PRESETS = [
  'Portal Rasmi',
  'Akademik & Peperiksaan',
  'Kewangan & Biasiswa',
  'Perpustakaan & Rujukan',
  'Aplikasi & Komunikasi',
  'Hebahan & Integriti',
];

export const AddEditPortalModal: React.FC<AddEditPortalModalProps> = ({
  isOpen,
  onClose,
  portal,
  onSave,
  onDelete,
  existingCount,
}) => {
  // Core Form Fields (Manual Overrides)
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [audience, setAudience] = useState<'Pelajar' | 'Staf' | 'Kedua-dua'>('Kedua-dua');
  const [category, setCategory] = useState('Portal Rasmi');
  const [customCategory, setCustomCategory] = useState('');
  const [imageUrl, setImageUrl] = useState(''); // Custom Image
  const [iconUrl, setIconUrl] = useState(''); // Custom Icon
  const [sortOrder, setSortOrder] = useState(1);
  const [isActive, setIsActive] = useState(true);

  // Auto-Detected Metadata (Preserved alongside manual overrides)
  const [detectedMeta, setDetectedMeta] = useState<PortalMetadata | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectState, setDetectState] = useState<'idle' | 'loading' | 'success' | 'partial' | 'error'>('idle');
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingIcon, setIsUploadingIcon] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tracking manual modifications to prevent detection clobbering
  const [manuallyModified, setManuallyModified] = useState<{
    title: boolean;
    desc: boolean;
    imageUrl: boolean;
    iconUrl: boolean;
  }>({
    title: false,
    desc: false,
    imageUrl: false,
    iconUrl: false,
  });

  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [activePreviewFav, setActivePreviewFav] = useState('');
  const [previewFavFailed, setPreviewFavFailed] = useState(false);

  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronize active preview favicon whenever url, detectedMeta, or iconUrl changes
  useEffect(() => {
    let googleFallbackFav = '';
    try {
      const rawUrl = url.trim() || 'https://bpenawar.kpm.edu.my/';
      const host = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname;
      if (host) {
        googleFallbackFav = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
      }
    } catch {}

    const initialFav = detectedMeta?.favicon || iconUrl || googleFallbackFav;
    setActivePreviewFav(initialFav);
    setPreviewFavFailed(false);
  }, [url, detectedMeta?.favicon, iconUrl]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Lock body scroll and listen for Escape key to close modal safely
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollBarWidth > 0) {
      document.body.style.paddingRight = `${scrollBarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (!isSaving) {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSaving, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    if (portal) {
      setUrl(portal.url || '');
      setTitle(portal.title || '');
      setDesc(portal.desc || '');
      setAudience(portal.audience || 'Kedua-dua');
      
      const cat = portal.category || 'Portal Rasmi';
      if (CATEGORY_PRESETS.includes(cat)) {
        setCategory(cat);
        setCustomCategory('');
      } else {
        setCategory('Lain-lain');
        setCustomCategory(cat);
      }

      setImageUrl(portal.imageUrl || '');
      setIconUrl(portal.iconUrl || '');
      setSortOrder(portal.sortOrder || existingCount + 1);
      setIsActive(portal.isActive !== false);

      // Rehydrate any stored detected metadata if available
      if (portal.detectedMeta) {
        setDetectedMeta({
          url: portal.url,
          title: portal.detectedMeta.title,
          description: portal.detectedMeta.description,
          ogTitle: portal.detectedMeta.ogTitle || portal.detectedMeta.title,
          ogDescription: portal.detectedMeta.ogDescription || portal.detectedMeta.description,
          ogImage: portal.detectedMeta.ogImage,
          ogUrl: portal.detectedMeta.ogUrl,
          ogSiteName: portal.detectedMeta.ogSiteName,
          favicon: portal.detectedMeta.favicon,
          manifestIcons: portal.detectedMeta.pwaIcon ? [{ src: portal.detectedMeta.pwaIcon }] : undefined,
        });
      } else {
        setDetectedMeta(null);
      }

      setManuallyModified({
        title: true,
        desc: true,
        imageUrl: Boolean(portal.imageUrl),
        iconUrl: Boolean(portal.iconUrl),
      });
    } else {
      setUrl('');
      setTitle('');
      setDesc('');
      setAudience('Kedua-dua');
      setCategory('Portal Rasmi');
      setCustomCategory('');
      setImageUrl('');
      setIconUrl('');
      setSortOrder(existingCount + 1);
      setIsActive(true);
      setDetectedMeta(null);
      setManuallyModified({
        title: false,
        desc: false,
        imageUrl: false,
        iconUrl: false,
      });
    }

    setDetectState('idle');
    setDetectStatus(null);
    setErrorMessage(null);
    setPreviewImageFailed(false);
  }, [isOpen, portal, existingCount]);

  if (!isOpen) return null;

  // Compute Active Visual using strict Priority Hierarchy
  const resolvedVisual = resolvePortalVisual({
    imageUrl,
    iconUrl,
    faviconUrl: detectedMeta?.favicon,
    detectedMeta: {
      ogImage: detectedMeta?.ogImage,
      favicon: detectedMeta?.favicon,
      pwaIcon: detectedMeta?.manifestIcons?.[0]?.src,
    },
  });

  // Source label for Admin transparency
  const visualPriorityBadge = (() => {
    switch (resolvedVisual.source) {
      case 'custom_image':
        return { label: 'Imej Tersuai Admin', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'custom_icon':
        return { label: 'Ikon Tersuai Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'og_image':
        return { label: 'Imej Open Graph Dikesan', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'pwa_icon':
        return { label: 'Ikon PWA Dikesan', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'favicon':
        return { label: 'Favicon Laman Dikesan', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      default:
        return { label: 'Placeholder Sistem', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  })();

  // Smart URL Metadata Detection
  const handleDetectMetadata = async (targetUrl?: string) => {
    const toCheck = (targetUrl || url).trim();
    if (!toCheck) {
      setDetectState('error');
      setDetectStatus(null);
      setDetectError('Sila masukkan URL portal terlebih dahulu.');
      return;
    }

    let formattedUrl = toCheck;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
      setUrl(formattedUrl);
    }

    try {
      setIsDetecting(true);
      setDetectState('loading');
      setDetectStatus('Sedang menghubungi pelayan dan menganalisis metadata...');
      setDetectError(null);

      const { status, data: meta } = await requestUrlMetadata(formattedUrl);
      setDetectedMeta(meta);

      // Rule: METADATA PRIORITY — Do not overwrite manually customized values
      if (!manuallyModified.title || !title.trim()) {
        const detectedTitle = meta.ogTitle || meta.title || meta.manifestName;
        if (detectedTitle) setTitle(detectedTitle);
      }

      if (!manuallyModified.desc || !desc.trim()) {
        const detectedDesc = meta.ogDescription || meta.description;
        if (detectedDesc) setDesc(detectedDesc);
      }

      // If Admin hasn't customized image or icon, adopt detected assets
      if (!manuallyModified.imageUrl && !imageUrl.trim() && meta.ogImage) {
        setImageUrl(meta.ogImage);
        setPreviewImageFailed(false);
      }

      if (!manuallyModified.iconUrl && !iconUrl.trim()) {
        const pwaIcon = meta.manifestIcons?.[0]?.src;
        if (pwaIcon) {
          setIconUrl(pwaIcon);
        } else if (meta.favicon) {
          setIconUrl(meta.favicon);
        }
      }

      if (status === 'success') {
        setDetectState('success');
        setDetectStatus('Metadata lengkap (OG Image, Tajuk & Deskripsi) berjaya dikesan secara automatik.');
      } else {
        setDetectState('partial');
        setDetectStatus('Metadata separa dikesan (sesetengah maklumat seperti imej tiada).');
      }
      setDetectError(null);
    } catch (err: any) {
      console.warn('[MetadataDetect Notice]:', err?.message || err);
      setDetectState('error');
      setDetectStatus(null);
      setDetectError(
        err?.message || 'Pengesanan metadata tidak berjaya. Anda boleh mengisi semua maklumat secara manual di bawah.'
      );
      // Strictly preserve previous metadata fields; do not overwrite on failure
    } finally {
      setIsDetecting(false);
    }
  };

  /**
   * Sanitizes pasted URL and prevents accidental double-paste (e.g. "https://uppkpmbp.ik-one.biz/https://uppkpmbp.ik-one.biz/")
   */
  const cleanPastedUrl = (raw: string): string => {
    if (!raw) return '';
    let trimmed = raw.trim();

    // 1. Exact string duplication check (e.g. str + str)
    if (trimmed.length > 8 && trimmed.length % 2 === 0) {
      const half = trimmed.length / 2;
      if (trimmed.slice(0, half) === trimmed.slice(half)) {
        trimmed = trimmed.slice(0, half);
      }
    }

    // 2. Double http(s):// scheme check
    const matches = trimmed.match(/https?:\/\/[^\s]+/gi);
    if (matches && matches.length > 1) {
      trimmed = matches[0];
    } else {
      const doubleSchemeMatch = trimmed.match(/^(https?:\/\/[^/]+.*?)(https?:\/\/.*)$/i);
      if (doubleSchemeMatch) {
        trimmed = doubleSchemeMatch[1];
      }
    }

    return trimmed;
  };

  // Debounced URL Change Handler
  const handleUrlChange = (newVal: string) => {
    const cleaned = cleanPastedUrl(newVal);
    setUrl(cleaned);
    setDetectState('idle');
    setDetectStatus(null);
    setDetectError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = cleaned.trim();
    // Auto-trigger if URL has valid prefix or dot pattern
    if (
      trimmed.length > 7 &&
      (trimmed.startsWith('http://') || trimmed.startsWith('https://') || (trimmed.includes('.') && !trimmed.endsWith('.')))
    ) {
      debounceTimerRef.current = setTimeout(() => {
        handleDetectMetadata(trimmed);
      }, 650);
    }
  };

  // Immediate URL Paste Handler
  const handleUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    // Prevent default browser paste that causes double insertion alongside state update
    e.preventDefault();
    const rawPasted = e.clipboardData.getData('text');
    const pastedText = cleanPastedUrl(rawPasted);
    if (pastedText) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      let target = pastedText;
      if (!/^https?:\/\//i.test(target) && target.includes('.')) {
        target = `https://${target}`;
      }
      setUrl(target);
      setDetectState('idle');
      setDetectStatus(null);
      setDetectError(null);

      // Trigger detection immediately without debounce
      setTimeout(() => {
        handleDetectMetadata(target);
      }, 50);
    }
  };

  // Upload Custom Image File to Firebase Storage
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingImage(true);
      setErrorMessage(null);
      const uploadedUrl = await uploadPortalAsset(file, 'image');
      setImageUrl(uploadedUrl);
      setManuallyModified((prev) => ({ ...prev, imageUrl: true }));
      setPreviewImageFailed(false);
    } catch (uploadErr: any) {
      setErrorMessage(uploadErr?.message || 'Gagal memuat naik imej.');
    } finally {
      setIsUploadingImage(false);
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
  };

  // Upload Custom Icon File to Firebase Storage
  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingIcon(true);
      setErrorMessage(null);
      const uploadedUrl = await uploadPortalAsset(file, 'icon');
      setIconUrl(uploadedUrl);
      setManuallyModified((prev) => ({ ...prev, iconUrl: true }));
    } catch (uploadErr: any) {
      setErrorMessage(uploadErr?.message || 'Gagal memuat naik ikon.');
    } finally {
      setIsUploadingIcon(false);
      if (iconFileInputRef.current) iconFileInputRef.current.value = '';
    }
  };

  // Selective Reset Handlers
  const resetTitleToDetected = () => {
    const val = detectedMeta?.ogTitle || detectedMeta?.title || detectedMeta?.manifestName;
    if (val) {
      setTitle(val);
      setManuallyModified((prev) => ({ ...prev, title: false }));
    }
  };

  const resetDescToDetected = () => {
    const val = detectedMeta?.ogDescription || detectedMeta?.description;
    if (val) {
      setDesc(val);
      setManuallyModified((prev) => ({ ...prev, desc: false }));
    }
  };

  const resetImageToDetected = () => {
    if (detectedMeta?.ogImage) {
      setImageUrl(detectedMeta.ogImage);
      setManuallyModified((prev) => ({ ...prev, imageUrl: false }));
      setPreviewImageFailed(false);
    }
  };

  const resetIconToDetected = () => {
    const val = detectedMeta?.manifestIcons?.[0]?.src || detectedMeta?.favicon;
    if (val) {
      setIconUrl(val);
      setManuallyModified((prev) => ({ ...prev, iconUrl: false }));
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Sila masukkan nama / tajuk portal.');
      return;
    }
    if (!url.trim()) {
      setErrorMessage('Sila masukkan URL portal.');
      return;
    }

    let finalUrl = cleanPastedUrl(url.trim());
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const finalCategory = category === 'Lain-lain' 
      ? (customCategory.trim() || 'Portal Rasmi') 
      : category;

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

    const portalPayload: PortalLink = {
      id: portal?.id || `portal_${Date.now()}`,
      title: title.trim(),
      desc: desc.trim(),
      url: finalUrl,
      audience,
      category: finalCategory,
      imageUrl: imageUrl.trim() || '',
      iconUrl: iconUrl.trim() || '',
      faviconUrl: detectedMeta?.favicon || portal?.faviconUrl || '',
      sortOrder: Number(sortOrder) || existingCount + 1,
      isActive,
      createdAt: portal?.createdAt || new Date().toISOString(),
      ...(Object.keys(detectedData).length > 0 
        ? { detectedMeta: detectedData } 
        : portal?.detectedMeta ? { detectedMeta: portal.detectedMeta } : {}),
    };

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onSave(portalPayload);
      onClose();
    } catch (saveErr: any) {
      setErrorMessage(saveErr?.message || 'Ralat semasa menyimpan portal ke Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!portal?.id || !onDelete) return;
    const confirmDelete = window.confirm(`Adakah anda pasti mahu memadamkan portal "${portal.title}"?`);
    if (!confirmDelete) return;

    try {
      setIsSaving(true);
      await onDelete(portal.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Ralat semasa memadamkan portal.');
    } finally {
      setIsSaving(false);
    }
  };

  const domainDisplay = (url.trim() || 'https://bpenawar.kpm.edu.my/')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

  const previewSiteName = detectedMeta?.ogSiteName || domainDisplay.split('/')[0] || 'Portal Rasmi';

  let googleFallbackFav = '';
  try {
    const rawUrl = url.trim() || 'https://bpenawar.kpm.edu.my/';
    const host = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`).hostname;
    if (host) {
      googleFallbackFav = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
    }
  } catch {}

  const handlePreviewFavError = () => {
    if (activePreviewFav !== googleFallbackFav && googleFallbackFav) {
      setActivePreviewFav(googleFallbackFav);
    } else {
      setPreviewFavFailed(true);
    }
  };

  const hasHeroImage = Boolean(resolvedVisual.url && (resolvedVisual.source === 'og_image' || resolvedVisual.source === 'custom_image') && !previewImageFailed);

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-md overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSaving) {
          onClose();
        }
      }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90dvh] flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-100 text-left overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Header */}
        <div className="shrink-0 px-5 sm:px-7 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 id="portal-modal-title" className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                {portal ? 'Kemaskini Portal & Override Penuh' : 'Tambah Portal Baharu & Tetapan Penuh'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                Pengesanan Automatik Metadata & Kawalan Override Manual Penuh
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Form wrapping scrollable content and fixed footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Live Smart Card Preview */}
            <div className="space-y-2.5 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Pratonton Langsung Kad Interaktif
            </span>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${visualPriorityBadge.color}`}>
                {visualPriorityBadge.label}
              </span>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                isActive 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {isActive ? 'Aktif' : 'Dinyahaktifkan'}
              </span>
            </div>
          </div>

          {/* Interactive Card Replica */}
          <div className={`glass-card rounded-[22px] border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between transition-all ${
            !isActive ? 'opacity-65' : ''
          }`}>
            {/* Visual Header / Hero */}
            {hasHeroImage ? (
              <div className="relative w-full aspect-[2.1/1] sm:aspect-[2.4/1] bg-slate-100 overflow-hidden border-b border-slate-100">
                <img
                  src={resolvedVisual.url}
                  alt={title || 'Pratonton Portal'}
                  onError={() => setPreviewImageFailed(true)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent opacity-60" />
                <div className="absolute bottom-2.5 left-3 flex items-center flex-wrap gap-1.5 z-10">
                  <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-2xs border ${
                    audience === 'Pelajar'
                      ? 'bg-blue-600/90 text-white border-blue-400/40'
                      : audience === 'Staf'
                        ? 'bg-amber-600/90 text-white border-amber-400/40'
                        : 'bg-indigo-600/90 text-white border-indigo-400/40'
                  }`}>
                    {audience}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900/70 text-slate-100 backdrop-blur-md border border-white/20">
                    {category === 'Lain-lain' ? (customCategory || 'Lain-lain') : category}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gradient-to-r from-indigo-50/80 via-white/80 to-purple-50/70 border-b border-indigo-100/60 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-white shadow-xs border border-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
                    {activePreviewFav && !previewFavFailed ? (
                      <img
                        src={activePreviewFav}
                        alt=""
                        onError={handlePreviewFavError}
                        className="w-5 h-5 object-contain"
                      />
                    ) : (
                      <span className="text-xs font-black text-indigo-700">
                        {title.trim() ? title.trim().charAt(0).toUpperCase() : 'P'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      {previewSiteName}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] font-bold px-2 py-0.2 rounded-full border ${
                        audience === 'Pelajar'
                          ? 'bg-blue-50 text-blue-700 border-blue-100'
                          : audience === 'Staf'
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                            : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      }`}>
                        {audience}
                      </span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                        {category === 'Lain-lain' ? (customCategory || 'Lain-lain') : category}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Content Body */}
            <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
              <div className="space-y-1.5">
                {hasHeroImage && (
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
                    {activePreviewFav && !previewFavFailed ? (
                      <img
                        src={activePreviewFav}
                        alt=""
                        onError={handlePreviewFavError}
                        className="w-3.5 h-3.5 rounded-xs object-contain shrink-0"
                      />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="font-mono text-slate-600 font-semibold truncate max-w-[220px]">
                      {previewSiteName}
                    </span>
                  </div>
                )}
                <h4 className="font-sans font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                  {title.trim() || 'Nama / Tajuk Portal'}
                </h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3">
                  {desc.trim() || 'Penerangan ringkas portal serta perkhidmatan sistem digital kolej...'}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-[10px] font-mono text-slate-400 truncate max-w-[200px] flex items-center gap-1">
                  <Globe className="w-3 h-3 text-slate-300 shrink-0" />
                  <span>{domainDisplay}</span>
                </span>
                <span className="text-xs font-extrabold text-indigo-600 flex items-center gap-1">
                  <span>Buka Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Inputs Container */}
        <div className="space-y-5">
          
          {/* 1. URL & Detection Bar */}
          <div className="space-y-1.5 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-extrabold text-indigo-950">
                1. Alamat Portal <span className="text-rose-500">*</span>
              </label>
              <span className="text-[10px] text-indigo-600 font-semibold">
                Kesan maklumat automatik
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  onPaste={handleUrlPaste}
                  placeholder="https://bpenawar.kpm.edu.my/spmp/ atau tampal URL..."
                  className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {isDetecting && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-600 animate-spin" />
                )}
              </div>

              <button
                type="button"
                onClick={() => handleDetectMetadata()}
                disabled={isDetecting || !url.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs shrink-0"
              >
                {isDetecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengesan...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Kesan Semula</span>
                  </>
                )}
              </button>
            </div>

            {/* 5-State Feedback Banner */}
            {detectState === 'loading' && (
              <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-800 bg-indigo-50/90 p-2.5 rounded-xl border border-indigo-200 mt-2 animate-pulse">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin shrink-0" />
                <span>Sedang mengesan maklumat portal...</span>
              </div>
            )}

            {detectState === 'success' && (
              <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-800 bg-emerald-50/90 p-2.5 rounded-xl border border-emerald-200 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{detectStatus || 'Maklumat portal berjaya dikesan secara automatik.'}</span>
              </div>
            )}

            {detectState === 'partial' && (
              <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-800 bg-amber-50/90 p-2.5 rounded-xl border border-amber-200 mt-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{detectStatus || 'Metadata separa dikesan (sesetengah aset seperti Open Graph image tiada pada laman ini).'}</span>
              </div>
            )}

            {detectState === 'error' && (
              <div className="flex items-start gap-2.5 text-[11px] font-semibold text-rose-800 bg-rose-50/90 p-2.5 rounded-xl border border-rose-200 mt-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold">Pengesanan Metadata Gagal</p>
                  <p className="text-[10px] text-rose-700 font-normal mt-0.5 leading-snug">
                    {detectError || 'Pelayan tidak dapat membaca metadata URL ini. Maklumat sedia ada dikekalkan dan anda boleh mengisi atau mengedit borang secara manual.'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 2. Portal Name */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span>2. Nama Portal</span>
                  <span className="text-rose-500">*</span>
                  {manuallyModified.title && (
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Tersuai
                    </span>
                  )}
                </label>

                {detectedMeta && (detectedMeta.ogTitle || detectedMeta.title) && title !== (detectedMeta.ogTitle || detectedMeta.title) && (
                  <button
                    type="button"
                    onClick={resetTitleToDetected}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Gunakan Nilai Dikesan</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setManuallyModified((prev) => ({ ...prev, title: true }));
                }}
                placeholder="Contoh: Portal SPMP Pelajar"
                className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* 3. Portal Description */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span>3. Penerangan Portal</span>
                  {manuallyModified.desc && (
                    <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      Tersuai
                    </span>
                  )}
                </label>

                {detectedMeta && (detectedMeta.ogDescription || detectedMeta.description) && desc !== (detectedMeta.ogDescription || detectedMeta.description) && (
                  <button
                    type="button"
                    onClick={resetDescToDetected}
                    className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Gunakan Deskripsi Dikesan</span>
                  </button>
                )}
              </div>
              <textarea
                rows={2}
                value={desc}
                onChange={(e) => {
                  setDesc(e.target.value);
                  setManuallyModified((prev) => ({ ...prev, desc: true }));
                }}
                placeholder="Penerangan ringkas mengenai portal dan fungsi..."
                className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* 4. Audience Selector */}
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700">
                4. Sasaran Pengguna
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Pelajar', 'Staf', 'Kedua-dua'] as const).map((aud) => (
                  <button
                    key={aud}
                    type="button"
                    onClick={() => setAudience(aud)}
                    className={`py-2 px-2 text-xs font-extrabold rounded-xl border text-center transition-all cursor-pointer ${
                      audience === aud
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {aud}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Category Selector */}
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700">
                5. Kategori Portal
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                {CATEGORY_PRESETS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="Lain-lain">Lain-lain</option>
              </select>

              {category === 'Lain-lain' && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Masukkan nama kategori..."
                  className="w-full mt-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              )}
            </div>

            {/* 6. Custom Portal Image */}
            <div className="space-y-1.5 md:col-span-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>6. Gambar Portal</span>
                </label>

                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setManuallyModified((prev) => ({ ...prev, imageUrl: false }));
                      setPreviewImageFailed(false);
                    }}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                  >
                    Padam Gambar
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value);
                    setManuallyModified((prev) => ({ ...prev, imageUrl: true }));
                    setPreviewImageFailed(false);
                  }}
                  placeholder="https://.../portal-image.png atau muat naik fail imej"
                  className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />

                <input
                  type="file"
                  ref={imageFileInputRef}
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                  onChange={handleImageUpload}
                />

                <button
                  type="button"
                  onClick={() => imageFileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  title="Pilih fail imej dari komputer/peranti (Dimampatkan secara automatik)"
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95 shadow-2xs hover:border-indigo-300"
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{isUploadingImage ? 'Mengoptimumkan...' : 'Muat Naik Imej'}</span>
                </button>
              </div>

              {/* Detected OG Image Option & Reset */}
              {detectedMeta?.ogImage && (
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
                  <span>Open Graph Dikesan:</span>
                  <button
                    type="button"
                    onClick={resetImageToDetected}
                    className="text-indigo-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Guna OG Image Dikesan</span>
                  </button>
                </div>
              )}
            </div>

            {/* 7. Custom Portal Icon */}
            <div className="space-y-1.5 md:col-span-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-600" />
                  <span>7. Ikon Portal</span>
                </label>

                {iconUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setIconUrl('');
                      setManuallyModified((prev) => ({ ...prev, iconUrl: false }));
                    }}
                    className="text-[10px] text-rose-600 hover:text-rose-800 font-bold cursor-pointer"
                  >
                    Padam Ikon
                  </button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={iconUrl}
                  onChange={(e) => {
                    setIconUrl(e.target.value);
                    setManuallyModified((prev) => ({ ...prev, iconUrl: true }));
                  }}
                  placeholder="https://.../favicon.ico atau muat naik fail ikon"
                  className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />

                <input
                  type="file"
                  ref={iconFileInputRef}
                  accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                  className="hidden"
                  onChange={handleIconUpload}
                />

                <button
                  type="button"
                  onClick={() => iconFileInputRef.current?.click()}
                  disabled={isUploadingIcon}
                  title="Pilih fail ikon dari komputer/peranti (Dimampatkan secara automatik)"
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95 shadow-2xs hover:border-purple-300"
                >
                  {isUploadingIcon ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  <span>{isUploadingIcon ? 'Mengoptimumkan...' : 'Muat Naik Ikon'}</span>
                </button>
              </div>

              {/* Detected Icon / Favicon Options */}
              {(detectedMeta?.favicon || detectedMeta?.manifestIcons?.[0]?.src) && (
                <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500">
                  <span>Ikon Dikesan:</span>
                  {detectedMeta.favicon && (
                    <button
                      type="button"
                      onClick={() => {
                        setIconUrl(detectedMeta.favicon!);
                        setManuallyModified((prev) => ({ ...prev, iconUrl: false }));
                      }}
                      className="text-purple-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Guna Favicon Dikesan</span>
                    </button>
                  )}
                  {detectedMeta.manifestIcons?.[0]?.src && (
                    <button
                      type="button"
                      onClick={() => {
                        setIconUrl(detectedMeta.manifestIcons![0].src);
                        setManuallyModified((prev) => ({ ...prev, iconUrl: false }));
                      }}
                      className="text-purple-600 hover:underline font-bold cursor-pointer flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Guna Ikon PWA</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sort Order */}
            <div className="space-y-1">
              <label className="text-xs font-extrabold text-slate-700">
                Susunan Paparan (Sort Order)
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
              <div>
                <p className="text-xs font-bold text-slate-800">Status Aktif</p>
                <p className="text-[11px] text-slate-500">
                  {isActive ? 'Kelihatan kepada umum' : 'Disembunyikan daripada umum'}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
              </label>
            </div>

          </div>
        </div>
      </div>

      {/* Sticky / Fixed Action Footer */}
      <div className="shrink-0 px-5 sm:px-7 py-4 bg-slate-50 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 z-10">
        <div>
          {portal && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSaving}
              className="w-full sm:w-auto px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>Padam Portal</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-200/80 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold transition-colors cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSaving || isDetecting || isUploadingImage || isUploadingIcon}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyimpan ke Firestore...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Simpan Portal</span>
              </>
            )}
          </button>
        </div>
      </div>

    </form>

  </div>
</div>
);

if (typeof document === 'undefined') {
  return modalContent;
}

return createPortal(modalContent, document.body);
};

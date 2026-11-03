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
  CheckCircle2
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
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
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

  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const iconFileInputRef = useRef<HTMLInputElement>(null);

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
          ogTitle: portal.detectedMeta.title,
          ogDescription: portal.detectedMeta.description,
          ogImage: portal.detectedMeta.ogImage,
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
        return { label: 'Keutamaan 1: Imej Tersuai Admin', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
      case 'custom_icon':
        return { label: 'Keutamaan 2: Ikon Tersuai Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'og_image':
        return { label: 'Keutamaan 3: Imej Open Graph (Dikesan)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'pwa_icon':
        return { label: 'Keutamaan 4: Ikon PWA (Dikesan)', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'favicon':
        return { label: 'Keutamaan 4: Favicon Laman (Dikesan)', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      default:
        return { label: 'Keutamaan 5: Placeholder Sistem Lalai', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  })();

  // Smart URL Metadata Detection
  const handleDetectMetadata = async (targetUrl?: string) => {
    const toCheck = (targetUrl || url).trim();
    if (!toCheck) {
      setErrorMessage('Sila masukkan URL portal terlebih dahulu.');
      return;
    }

    let formattedUrl = toCheck;
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = `https://${formattedUrl}`;
      setUrl(formattedUrl);
    }

    try {
      setIsDetecting(true);
      setErrorMessage(null);
      setDetectStatus('Sedang mengesan metadata laman web...');

      const meta = await requestUrlMetadata(formattedUrl);
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
      }

      if (!manuallyModified.iconUrl && !iconUrl.trim()) {
        const pwaIcon = meta.manifestIcons?.[0]?.src;
        if (pwaIcon) {
          setIconUrl(pwaIcon);
        } else if (meta.favicon) {
          setIconUrl(meta.favicon);
        }
      }

      setDetectStatus('Metadata berjaya dikesan secara automatik.');
    } catch (err: any) {
      console.warn('Metadata detection notice:', err);
      setDetectStatus(null);
      setErrorMessage(
        err?.message || 'Pengesanan metadata automatik tidak berjaya. Anda boleh mengisi semua maklumat secara manual di bawah.'
      );
    } finally {
      setIsDetecting(false);
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

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    const finalCategory = category === 'Lain-lain' 
      ? (customCategory.trim() || 'Portal Rasmi') 
      : category;

    const detectedData: Record<string, string> = {};
    if (detectedMeta) {
      const dt = detectedMeta.ogTitle || detectedMeta.title;
      if (dt) detectedData.title = dt;
      const dd = detectedMeta.ogDescription || detectedMeta.description;
      if (dd) detectedData.description = dd;
      if (detectedMeta.ogImage) detectedData.ogImage = detectedMeta.ogImage;
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
      faviconUrl: detectedMeta?.favicon || '',
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-3xl my-6 bg-white rounded-3xl p-5 sm:p-8 shadow-2xl border border-slate-100 text-left space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center shadow-xs">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                {portal ? 'Kemaskini Portal & Override Penuh' : 'Tambah Portal Baharu & Tetapan Penuh'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Kawalan Metadata Tersuai Penuh (Full Custom Metadata Override)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-bold text-rose-700 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="leading-snug">{errorMessage}</span>
          </div>
        )}

        {/* Live Card Preview with Image Priority Indicator */}
        <div className="space-y-2 p-4 bg-slate-50/70 rounded-2xl border border-slate-200/70">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              Pratonton Langsung Kad Portal
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

          <div className={`p-5 glass-card rounded-[24px] border border-slate-200 shadow-sm flex flex-col justify-between transition-all ${
            !isActive ? 'opacity-65' : ''
          }`}>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                    audience === 'Pelajar' 
                      ? 'bg-blue-50 text-blue-700 border-blue-100' 
                      : audience === 'Staf' 
                        ? 'bg-amber-50 text-amber-700 border-amber-100' 
                        : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}>
                    Sesuai: {audience}
                  </span>
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {category === 'Lain-lain' ? (customCategory || 'Lain-lain') : category}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Visual Render according to Image Priority */}
                  {resolvedVisual.url && !previewImageFailed ? (
                    <img 
                      src={resolvedVisual.url} 
                      alt="" 
                      className="w-6 h-6 rounded-md object-contain bg-white border border-slate-200 p-0.5 shadow-2xs" 
                      onError={() => setPreviewImageFailed(true)}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center justify-center text-[11px] font-black shadow-2xs">
                      {title.trim() ? title.trim().charAt(0).toUpperCase() : 'P'}
                    </div>
                  )}
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                </div>
              </div>

              <h4 className="font-sans font-extrabold text-slate-900 text-sm">
                {title.trim() || 'Nama / Tajuk Portal'}
              </h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed">
                {desc.trim() || 'Penerangan ringkas portal serta perkhidmatan sistem digital kolej...'}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {url.trim() || 'https://bpenawar.kpm.edu.my/'}
              </span>
              <span className="text-xs font-extrabold text-indigo-700 flex items-center gap-1">
                Buka Portal <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>
        </div>

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* 1. URL & Detection Bar */}
          <div className="space-y-1.5 p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
            <label className="block text-xs font-extrabold text-indigo-950">
              1. Alamat Laman Web / Portal URL (Boleh Disunting) <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setDetectStatus(null);
                  }}
                  placeholder="https://bpenawar.kpm.edu.my/spmp/"
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
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
                    <span>Kesan Metadata Laman</span>
                  </>
                )}
              </button>
            </div>

            {detectStatus && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-800 bg-white/90 p-2 rounded-lg border border-indigo-100 mt-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>{detectStatus}</span>
              </div>
            )}
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* 2. Portal Name (Manual Override) */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span>2. Nama / Tajuk Portal (Manual Override)</span>
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
                    <span>Gunakan Nilai Dikesan ({detectedMeta.ogTitle || detectedMeta.title})</span>
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

            {/* 3. Portal Description (Manual Override) */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-700 flex items-center gap-1.5">
                  <span>3. Penerangan Ringkas Portal (Manual Override)</span>
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
                4. Sasaran Pengguna (Audience)
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
                5. Kategori Portal (Configurable)
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
                <option value="Lain-lain">Lain-lain (Tersuai)</option>
              </select>

              {category === 'Lain-lain' && (
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Masukkan nama kategori tersuai..."
                  className="w-full mt-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              )}
            </div>

            {/* 6. Custom Portal Image (Keutamaan 1 & 2) */}
            <div className="space-y-1.5 md:col-span-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>6. Gambar Portal (Upload / URL Tersuai — Keutamaan 1)</span>
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
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isUploadingImage ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  )}
                  <span>{isUploadingImage ? 'Memuat Naik...' : 'Muat Naik Imej (Firebase)'}</span>
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

            {/* 7. Custom Portal Icon (Keutamaan 2 & 4) */}
            <div className="space-y-1.5 md:col-span-2 p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-600" />
                  <span>7. Ikon Portal (Upload / URL Ikon Tersuai — Keutamaan 2)</span>
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
                  className="px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {isUploadingIcon ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-purple-600" />
                  )}
                  <span>{isUploadingIcon ? 'Memuat Naik...' : 'Muat Naik Ikon'}</span>
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

          {/* Action Footer */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              {portal && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isSaving}
                  className="w-full sm:w-auto px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
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
                className="flex-1 sm:flex-none px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-extrabold transition-colors cursor-pointer"
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
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — DEDICATED PLATFORM HUB
 * SYNCROZZ ENGINEERING STANDARD
 *
 * Independent tab under Rujukan Kolej displaying external Platform links
 * stored in /platforms/directkpmbp/platformLinks/{platformId}.
 */

import React, { useState, useEffect } from 'react';
import {
  Layers,
  ExternalLink,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  Shield,
  Globe,
  Check,
  X,
} from 'lucide-react';
import { PlatformLink, PlatformSyncStatus } from '../types';
import {
  subscribeToPlatformLinks,
  savePlatformLink,
  deletePlatformLink,
  togglePlatformVisibility,
  resolvePlatformVisual,
  getPlatformSiteName,
} from '../services/platformService';
import { AddEditPlatformModal } from './AddEditPlatformModal';

interface PlatformHubProps {
  isAdminMode?: boolean;
  platformsData?: PlatformLink[];
  syncStatusProp?: PlatformSyncStatus;
  syncErrorProp?: string | null;
  isLoadingProp?: boolean;
  searchQuery?: string;
}

interface PlatformCardProps {
  platform: PlatformLink;
  isAdminMode: boolean;
  onEdit: (platform: PlatformLink) => void;
  onToggleVisibility: (platform: PlatformLink) => void;
  onDelete: (platform: PlatformLink) => void;
}

const PlatformCard: React.FC<PlatformCardProps> = ({
  platform,
  isAdminMode,
  onEdit,
  onToggleVisibility,
  onDelete,
}) => {
  const visual = resolvePlatformVisual(platform);
  const siteName = getPlatformSiteName(platform);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setThumbFailed(false);
    setLogoFailed(false);
  }, [platform.id, visual.thumbnail, visual.logo]);

  const hasThumbnail = Boolean(visual.thumbnail && !thumbFailed);
  const domainDisplay = platform.url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

  return (
    <a
      href={platform.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Buka platform ${platform.name}`}
      className={`group flex flex-col glass-card rounded-[24px] border border-white/60 hover:border-emerald-300 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden relative text-left no-underline cursor-pointer ${
        platform.isActive === false ? 'opacity-65 bg-slate-100/75' : 'bg-white/85'
      }`}
    >
      {/* Admin Controls Overlay */}
      {isAdminMode && (
        <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleVisibility(platform);
            }}
            title={platform.isActive === false ? 'Aktifkan Paparan' : 'Sembunyikan Paparan'}
            aria-label={platform.isActive === false ? 'Aktifkan Paparan' : 'Sembunyikan Paparan'}
            className={`p-2 rounded-xl shadow-md border transition-all cursor-pointer backdrop-blur-md ${
              platform.isActive === false
                ? 'bg-amber-50/95 hover:bg-emerald-600 text-amber-700 hover:text-white border-amber-200'
                : 'bg-white/95 hover:bg-amber-600 text-slate-600 hover:text-white border-slate-200/80'
            }`}
          >
            {platform.isActive === false ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit(platform);
            }}
            title="Kemaskini Platform"
            aria-label="Kemaskini Platform"
            className="p-2 rounded-xl bg-white/95 hover:bg-indigo-600 text-slate-600 hover:text-white shadow-md border border-slate-200/80 transition-all cursor-pointer backdrop-blur-md"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete(platform);
            }}
            title="Padam Platform"
            aria-label="Padam Platform"
            className="p-2 rounded-xl bg-white/95 hover:bg-rose-600 text-slate-600 hover:text-white shadow-md border border-slate-200/80 transition-all cursor-pointer backdrop-blur-md"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Visual Thumbnail or Header */}
      {hasThumbnail ? (
        <div className="relative w-full aspect-video bg-slate-100 overflow-hidden border-b border-slate-100/80">
          <img
            src={visual.thumbnail}
            alt={platform.name}
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-75 group-hover:opacity-40 transition-opacity" />

          {isAdminMode && (
            <div className="absolute bottom-2.5 left-3 flex items-center gap-1.5 z-10">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-900/75 text-white backdrop-blur-md border border-white/20">
                #{platform.sortOrder ?? 1}
              </span>
              {platform.isActive === false && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-600/90 text-white backdrop-blur-md">
                  Tersembunyi
                </span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full p-4 bg-gradient-to-r from-emerald-50/90 via-white/85 to-teal-50/75 border-b border-emerald-100/60 flex items-center justify-between">
          <div className={`flex items-center gap-3 ${isAdminMode ? 'pr-28' : ''}`}>
            <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-emerald-100 flex items-center justify-center overflow-hidden shrink-0">
              {visual.logo && !logoFailed ? (
                <img
                  src={visual.logo}
                  alt=""
                  onError={() => setLogoFailed(true)}
                  className="w-6 h-6 object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-base font-black text-emerald-700">
                  {(platform.name || 'P').trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-extrabold text-slate-700 block truncate">
                {siteName}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {isAdminMode && (
                  <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                    Susunan #{platform.sortOrder ?? 1}
                  </span>
                )}
                {platform.isActive === false && (
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    Tersembunyi
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {hasThumbnail && (
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
              {visual.logo && !logoFailed ? (
                <img
                  src={visual.logo}
                  alt=""
                  onError={() => setLogoFailed(true)}
                  className="w-4 h-4 rounded-xs object-contain shrink-0 bg-white p-0.5 border border-slate-200/60"
                  loading="lazy"
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span className="font-mono text-slate-600 font-semibold truncate max-w-[200px]">
                {siteName}
              </span>
            </div>
          )}

          <h4 className="font-sans font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-emerald-700 transition-colors line-clamp-2 leading-snug">
            {platform.name}
          </h4>

          {platform.description && (
            <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3">
              {platform.description}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100/90 flex items-center justify-between text-xs gap-2">
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px] sm:max-w-[210px] flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-300 shrink-0" />
            <span className="truncate">{domainDisplay}</span>
          </span>
          <span className="text-xs font-extrabold text-emerald-700 group-hover:text-emerald-800 flex items-center gap-1 shrink-0 group-hover:translate-x-0.5 transition-transform">
            <span>Buka Platform</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
};

export const PlatformHub: React.FC<PlatformHubProps> = ({
  isAdminMode = false,
  platformsData,
  syncStatusProp,
  syncErrorProp,
  isLoadingProp,
  searchQuery = '',
}) => {
  const [localPlatforms, setLocalPlatforms] = useState<PlatformLink[]>([]);
  const [localSyncStatus, setLocalSyncStatus] = useState<PlatformSyncStatus>('loading');
  const [localSyncError, setLocalSyncError] = useState<string | null>(null);
  const [localIsLoading, setLocalIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlatform, setEditingPlatform] = useState<PlatformLink | null>(null);
  const [platformToDelete, setPlatformToDelete] = useState<PlatformLink | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const hasExternalData = platformsData !== undefined;

  useEffect(() => {
    if (hasExternalData) return;
    const unsubscribe = subscribeToPlatformLinks((result) => {
      setLocalPlatforms(result.platforms);
      setLocalSyncStatus(result.status);
      setLocalSyncError(result.errorMessage || null);
      setLocalIsLoading(false);
    });
    return () => unsubscribe();
  }, [hasExternalData]);

  const platforms = hasExternalData ? platformsData : localPlatforms;
  const syncStatus = syncStatusProp ?? localSyncStatus;
  const syncError = syncErrorProp ?? localSyncError;
  const isLoading = isLoadingProp ?? localIsLoading;

  const filteredPlatforms = platforms.filter((item) => {
    if (!isAdminMode && item.isActive === false) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      (item.detectedMeta?.ogSiteName || '').toLowerCase().includes(q)
    );
  });

  const handleToggleVisibility = async (target: PlatformLink) => {
    try {
      const nextActive = target.isActive === false;
      await togglePlatformVisibility(target.id, nextActive);
      setFeedback({
        type: 'success',
        text: `Platform "${target.name}" kini ${nextActive ? 'dipaparkan kepada umum' : 'disembunyikan'}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal menukar status keterlihatan platform.',
      });
    }
  };

  const handleConfirmQuickDelete = async () => {
    if (!platformToDelete) return;
    try {
      await deletePlatformLink(platformToDelete.id);
      setFeedback({
        type: 'success',
        text: `Platform "${platformToDelete.name}" berjaya dipadam.`,
      });
      setPlatformToDelete(null);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Gagal memadam platform.',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 text-left">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50/80 border border-emerald-100 flex items-center justify-center text-emerald-700 font-extrabold">
            <Layers className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Senarai Platform ({filteredPlatforms.length})
          </h2>

          {isAdminMode && syncStatus === 'permission_denied' && (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Akses Terhad
            </span>
          )}
        </div>

        {/* Admin Add Action (Search consolidated into GlobalSmartSearch) */}
        {isAdminMode && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditingPlatform(null);
                setIsModalOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Platform</span>
            </button>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Permission / Network Error Notices */}
      {isAdminMode && syncStatus === 'permission_denied' && (
        <div className="p-4 bg-amber-50/90 border border-amber-300/80 rounded-2xl flex items-start gap-3 shadow-2xs">
          <div className="p-2 rounded-xl bg-amber-200/80 text-amber-900 shrink-0 mt-0.5">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-extrabold text-amber-950">Status Firestore: Akses Terhad</h4>
            <p className="text-[11px] text-amber-900 font-medium leading-relaxed mt-1">
              {syncError}
            </p>
          </div>
        </div>
      )}

      {isAdminMode && syncStatus === 'error_network' && (
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2.5 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-[11px] text-slate-600 font-medium">{syncError}</p>
        </div>
      )}

      {/* Quick Delete Confirmation Banner */}
      {isAdminMode && platformToDelete && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs font-bold text-rose-900">
            Padam platform <strong>"{platformToDelete.name}"</strong> daripada pangkalan data?
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPlatformToDelete(null)}
              className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleConfirmQuickDelete}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold cursor-pointer flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Padam Sekarang</span>
            </button>
          </div>
        </div>
      )}

      {/* Platform Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4.5">
        {filteredPlatforms.map((platform) => (
          <PlatformCard
            key={platform.id}
            platform={platform}
            isAdminMode={isAdminMode}
            onEdit={(target) => {
              setEditingPlatform(target);
              setIsModalOpen(true);
            }}
            onToggleVisibility={handleToggleVisibility}
            onDelete={(target) => setPlatformToDelete(target)}
          />
        ))}

        {isLoading && (
          <>
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="glass-card rounded-[24px] border border-white/60 shadow-sm overflow-hidden animate-pulse space-y-3"
              >
                <div className="h-28 bg-slate-200/70 w-full" />
                <div className="p-4 sm:p-5 space-y-3">
                  <div className="h-4 w-3/4 bg-slate-200/70 rounded-md" />
                  <div className="h-3 w-full bg-slate-200/70 rounded-md" />
                  <div className="pt-3 border-t border-slate-100 flex justify-between">
                    <div className="h-3 w-24 bg-slate-200/70 rounded-md" />
                    <div className="h-3 w-20 bg-slate-200/70 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {!isLoading && filteredPlatforms.length === 0 && (
          <div className="col-span-full py-12 text-center glass-panel rounded-3xl border border-slate-200/70 p-6 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-800">
                {searchQuery.trim()
                  ? 'Tiada platform yang sepadan dengan carian.'
                  : 'Tiada Rekod Platform Lagi'}
              </h4>
              <p className="text-xs text-slate-500 font-medium max-w-md mx-auto leading-relaxed">
                {searchQuery.trim()
                  ? 'Sila cuba kata kunci lain atau kosongkan carian.'
                  : isAdminMode
                    ? 'Koleksi platform masih kosong. Klik "Tambah Platform" untuk menambah pautan platform luar rasmi.'
                    : 'Tiada pautan platform luar tersedia pada masa ini.'}
              </p>
            </div>
            {isAdminMode && !searchQuery.trim() && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlatform(null);
                    setIsModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Platform Pertama</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Platform Modal */}
      {isAdminMode && (
        <AddEditPlatformModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingPlatform(null);
          }}
          platform={editingPlatform}
          existingCount={platforms.length}
          onSave={async (saved) => {
            await savePlatformLink(saved);
            setFeedback({
              type: 'success',
              text: editingPlatform
                ? `Maklumat platform "${saved.name}" berjaya dikemaskini.`
                : `Platform "${saved.name}" berjaya ditambah.`,
            });
          }}
          onDelete={async (platformId) => {
            await deletePlatformLink(platformId);
            setFeedback({
              type: 'success',
              text: 'Platform berjaya dipadam daripada pangkalan data.',
            });
          }}
        />
      )}
    </div>
  );
};

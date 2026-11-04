/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Link, 
  Info, 
  ExternalLink, 
  Search, 
  Sparkles, 
  ChevronRight, 
  FileText, 
  Shield, 
  HelpCircle, 
  Plus,
  Pencil,
  Database,
  Check,
  AlertCircle,
  Loader2,
  Globe
} from 'lucide-react';
import { PortalLink, PortalSyncStatus } from '../types';
import { 
  DEFAULT_PORTAL_LINKS, 
  subscribeToPortalLinks, 
  savePortalLink, 
  deletePortalLink, 
  migrateDefaultPortals,
  resolvePortalVisual,
  getPortalSiteName
} from '../services/portalService';
import { AddEditPortalModal } from './AddEditPortalModal';

interface CampusReferenceHubProps {
  isAdminMode?: boolean;
  onNavigateToTimetables?: () => void;
}

interface SmartPortalCardProps {
  link: PortalLink;
  isAdminMode: boolean;
  onEdit: (link: PortalLink) => void;
}

const SmartPortalCard: React.FC<SmartPortalCardProps> = ({ link, isAdminMode, onEdit }) => {
  const visual = resolvePortalVisual(link);
  const siteName = getPortalSiteName(link);
  const primaryFav = link.detectedMeta?.favicon || link.faviconUrl;
  let googleFallbackFav = '';
  try {
    const host = new URL(link.url).hostname;
    googleFallbackFav = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
  } catch {}

  const [currentFav, setCurrentFav] = useState(primaryFav || googleFallbackFav);
  const [imageFailed, setImageFailed] = useState(false);
  const [favFailed, setFavFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [link.id, visual.url]);

  useEffect(() => {
    setCurrentFav(primaryFav || googleFallbackFav);
    setFavFailed(false);
  }, [link.id, primaryFav, googleFallbackFav]);

  const handleFavError = () => {
    if (currentFav !== googleFallbackFav && googleFallbackFav) {
      setCurrentFav(googleFallbackFav);
    } else {
      setFavFailed(true);
    }
  };

  const hasHeroImage = Boolean(
    visual.url &&
    (visual.source === 'og_image' || visual.source === 'custom_image') &&
    !imageFailed
  );

  const domainDisplay = link.url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');

  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block glass-card rounded-[24px] border border-white/60 hover:border-indigo-300 shadow-xs hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden relative text-left no-underline cursor-pointer ${
        link.isActive === false ? 'opacity-65 bg-slate-100/70' : 'bg-white/85'
      }`}
      aria-label={`Buka portal ${link.title}`}
    >
      {/* Admin-only Edit Button: Icon-only pencil in top-right corner */}
      {isAdminMode && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEdit(link);
          }}
          title="Kemaskini Portal"
          aria-label="Kemaskini Portal"
          className="absolute top-3 right-3 z-30 p-2 rounded-xl bg-white/95 hover:bg-indigo-600 text-slate-600 hover:text-white shadow-md border border-slate-200/80 transition-all cursor-pointer group/btn backdrop-blur-md"
        >
          <Pencil className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110" />
        </button>
      )}

      {/* Hero Visual Banner (OG Image / Custom Image) */}
      {hasHeroImage ? (
        <div className="relative w-full aspect-[2/1] sm:aspect-[2.2/1] bg-slate-100 overflow-hidden border-b border-slate-100/80">
          <img
            src={visual.url}
            alt={link.title}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent opacity-75 group-hover:opacity-40 transition-opacity" />

          {/* Badges on hero banner */}
          <div className="absolute bottom-2.5 left-3 flex items-center flex-wrap gap-1.5 z-10 pr-12">
            <span
              className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full backdrop-blur-md shadow-2xs border ${
                link.audience === 'Pelajar'
                  ? 'bg-blue-600/90 text-white border-blue-400/40'
                  : link.audience === 'Staf'
                    ? 'bg-amber-600/90 text-white border-amber-400/40'
                    : 'bg-indigo-600/90 text-white border-indigo-400/40'
              }`}
            >
              Sesuai: {link.audience}
            </span>
            {link.category && link.category !== 'portal' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900/75 text-slate-100 backdrop-blur-md border border-white/20">
                {link.category}
              </span>
            )}
          </div>
        </div>
      ) : (
        /* Fallback Header Banner */
        <div className="relative w-full p-4 bg-gradient-to-r from-indigo-50/90 via-white/80 to-purple-50/70 border-b border-indigo-100/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 pr-12">
            <div className="w-10 h-10 rounded-xl bg-white shadow-xs border border-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
              {currentFav && !favFailed ? (
                <img
                  src={currentFav}
                  alt=""
                  onError={handleFavError}
                  className="w-5 h-5 object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-sm font-black text-indigo-700">
                  {(link.title || 'P').trim().charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-extrabold text-slate-700">
                {siteName}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9px] font-bold px-2 py-0.2 rounded-full border ${
                    link.audience === 'Pelajar'
                      ? 'bg-blue-50 text-blue-700 border-blue-100'
                      : link.audience === 'Staf'
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                  }`}
                >
                  Sesuai: {link.audience}
                </span>
                {link.category && link.category !== 'portal' && (
                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-purple-50 text-purple-700 border border-purple-100">
                    {link.category}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-3">
        <div className="space-y-1.5">
          {/* Identity line if hero visual was displayed */}
          {hasHeroImage && (
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium">
              {currentFav && !favFailed ? (
                <img
                  src={currentFav}
                  alt=""
                  onError={handleFavError}
                  className="w-3.5 h-3.5 rounded-xs object-contain shrink-0 bg-white p-0.5 border border-slate-200/60 shadow-2xs"
                  loading="lazy"
                />
              ) : (
                <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span className="font-mono text-slate-600 font-semibold truncate max-w-[200px]">
                {siteName}
              </span>
              {link.isActive === false && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                  Tidak Aktif
                </span>
              )}
            </div>
          )}

          <h4 className="font-sans font-extrabold text-slate-900 text-sm sm:text-base group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug">
            {link.title}
          </h4>
          <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-3">
            {link.desc}
          </p>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100/90 flex items-center justify-between text-xs">
          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[150px] sm:max-w-[210px] flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-300 shrink-0" />
            <span>{domainDisplay}</span>
          </span>
          <span className="text-xs font-extrabold text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1 shrink-0 group-hover:translate-x-0.5 transition-transform">
            <span>Buka Portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
};

export const CampusReferenceHub: React.FC<CampusReferenceHubProps> = ({ 
  isAdminMode = false, 
  onNavigateToTimetables 
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Dynamic Portals State (Initialized to empty to prevent flashing deleted records on refresh)
  const [portalLinks, setPortalLinks] = useState<PortalLink[]>([]);
  const [isPortalsMigrated, setIsPortalsMigrated] = useState(false);
  const [portalSyncStatus, setPortalSyncStatus] = useState<PortalSyncStatus>('loading');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [isLoadingPortals, setIsLoadingPortals] = useState(true);
  const [editingPortal, setEditingPortal] = useState<PortalLink | null>(null);
  const [isAddEditPortalOpen, setIsAddEditPortalOpen] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to real-time portal records in Firestore
  useEffect(() => {
    const unsubscribe = subscribeToPortalLinks((result) => {
      setPortalLinks(result.portals);
      setIsPortalsMigrated(result.isMigrated);
      setPortalSyncStatus(result.status);
      setSyncErrorMessage(result.errorMessage || null);
      setIsLoadingPortals(false);
    });
    return () => unsubscribe();
  }, []);

  const handleRunMigration = async () => {
    try {
      setIsMigrating(true);
      setMigrationNotice(null);
      const res = await migrateDefaultPortals();
      if (res.success) {
        setIsPortalsMigrated(true);
        setMigrationNotice({
          type: 'success',
          text: `Migrasi berjaya! Sebanyak ${res.migratedCount} portal asal telah dipindahkan ke Firestore (Jumlah di Firestore: ${res.total}).`,
        });
      } else {
        setMigrationNotice({
          type: 'error',
          text: res.error || 'Ralat semasa menjalankan migrasi ke Firestore.',
        });
      }
    } catch (err: any) {
      setMigrationNotice({
        type: 'error',
        text: err?.message || 'Ralat semasa menjalankan migrasi.',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Searching logic for dynamic portals
  const filteredPortals = portalLinks.filter((item) => {
    // Ordinary users only see active portals; Admin sees both with status badge
    if (!isAdminMode && item.isActive === false) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.audience.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.detectedMeta?.ogSiteName && item.detectedMeta.ogSiteName.toLowerCase().includes(q)) ||
      (item.detectedMeta?.ogTitle && item.detectedMeta.ogTitle.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6 text-left">
      {/* SECTION: Quick Portals Links */}
      <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center flex-wrap gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                  <Link className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  Portal Kolej ({filteredPortals.length})
                </h3>

                {/* Firestore vs Fallback Data Source Indicator */}
                {portalSyncStatus === 'ready_migrated' ? (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Firestore Dinamik
                  </span>
                ) : portalSyncStatus === 'permission_denied' ? (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Fallback Simpanan Asal
                  </span>
                ) : portalSyncStatus === 'ready_empty' ? (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    Sedia Untuk Migrasi
                  </span>
                ) : null}
              </div>

              {/* Admin-only Add Portal Button */}
              {isAdminMode && (
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPortal(null);
                      setIsAddEditPortalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Portal</span>
                  </button>
                </div>
              )}
            </div>

            {/* State A: Controlled One-Time Migration Banner (ONLY when genuinely loaded and empty) */}
            {isAdminMode && !isPortalsMigrated && portalSyncStatus === 'ready_empty' && (
              <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-950">
                      Migrasi Terkawal: 6 Portal Asal ke Firestore
                    </h4>
                    <p className="text-[11px] text-amber-800 font-medium leading-relaxed mt-0.5">
                      Pangkalan data Firestore telah disahkan dan sedia. Laksanakan migrasi 1-kali untuk memindahkan 6 portal asal ke pangkalan data dinamik dengan perlindungan rekod duplikat.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRunMigration}
                  disabled={isMigrating}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                >
                  {isMigrating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Memindahkan...</span>
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5" />
                      <span>Laksana Migrasi 6 Portal</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* State C: Permission Denied Notice (Admin Only) */}
            {isAdminMode && portalSyncStatus === 'permission_denied' && (
              <div className="p-4 bg-amber-50/90 border border-amber-300/80 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-amber-200/80 text-amber-900 shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-extrabold text-amber-950">
                        Status Firestore: Akses Terhad
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/90 text-amber-900">
                        Fallback Aktif
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 font-medium leading-relaxed mt-1">
                      Sambungan ke Firestore disekat oleh peraturan keselamatan projek <span className="font-mono font-bold bg-amber-200/60 px-1 py-0.5 rounded">syncrozz-platform</span>. Rekod portal sedang dipaparkan dengan selamat menggunakan simpanan asal. Untuk mengaktifkan penyegerakan dinamik, sila terbitkan peraturan <span className="font-mono font-bold bg-amber-200/60 px-1 py-0.5 rounded">firestore.rules</span> pada Firebase Console.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* State D: Network / Connection Failure Notice (Admin Only) */}
            {isAdminMode && portalSyncStatus === 'error_network' && (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-2.5 shadow-2xs">
                <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                <p className="text-[11px] text-slate-600 font-medium">
                  {syncErrorMessage || 'Gagal menghubungi pelayan Firestore kerana ralat rangkaian. Portal dipaparkan dalam mod luar talian.'}
                </p>
              </div>
            )}

            {/* Migration Feedback Banner */}
            {migrationNotice && (
              <div className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                migrationNotice.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {migrationNotice.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{migrationNotice.text}</span>
              </div>
            )}

            {/* Portals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
              {filteredPortals.map((link) => (
                <SmartPortalCard
                  key={link.id}
                  link={link}
                  isAdminMode={isAdminMode}
                  onEdit={(target) => {
                    setEditingPortal(target);
                    setIsAddEditPortalOpen(true);
                  }}
                />
              ))}

              {isLoadingPortals && (
                <>
                  <div className="glass-card rounded-[24px] border border-white/60 shadow-sm overflow-hidden animate-pulse space-y-3">
                    <div className="h-32 bg-slate-200/70 w-full" />
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="h-4 w-3/4 bg-slate-200/70 rounded-md" />
                      <div className="h-3 w-full bg-slate-200/70 rounded-md" />
                      <div className="pt-3 border-t border-slate-100 flex justify-between">
                        <div className="h-3 w-28 bg-slate-200/70 rounded-md" />
                        <div className="h-3 w-16 bg-slate-200/70 rounded-md" />
                      </div>
                    </div>
                  </div>
                  <div className="glass-card rounded-[24px] border border-white/60 shadow-sm overflow-hidden animate-pulse space-y-3">
                    <div className="h-32 bg-slate-200/70 w-full" />
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="h-4 w-3/4 bg-slate-200/70 rounded-md" />
                      <div className="h-3 w-full bg-slate-200/70 rounded-md" />
                      <div className="pt-3 border-t border-slate-100 flex justify-between">
                        <div className="h-3 w-28 bg-slate-200/70 rounded-md" />
                        <div className="h-3 w-16 bg-slate-200/70 rounded-md" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isLoadingPortals && filteredPortals.length === 0 && (
                <div className="col-span-full py-10 text-center glass-panel rounded-2xl border border-slate-200/60 p-6 space-y-2">
                  <Search className="w-7 h-7 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 font-semibold">
                    {searchQuery.trim()
                      ? 'Tiada pautan portal yang sepadan dengan carian.'
                      : isAdminMode
                        ? 'Tiada rekod portal dalam pangkalan data. Sila klik "Tambah Portal" untuk memulakan.'
                        : 'Tiada pautan portal tersedia pada masa ini.'}
                  </p>
                </div>
              )}
            </div>
          </div>

      {/* Dynamic Portal Management Modal */}
      {isAdminMode && (
        <AddEditPortalModal
          isOpen={isAddEditPortalOpen}
          onClose={() => {
            setIsAddEditPortalOpen(false);
            setEditingPortal(null);
          }}
          portal={editingPortal}
          existingCount={portalLinks.length}
          onSave={async (savedPortal) => {
            await savePortalLink(savedPortal);
          }}
          onDelete={async (portalId) => {
            await deletePortalLink(portalId);
          }}
        />
      )}
    </div>
  );
};

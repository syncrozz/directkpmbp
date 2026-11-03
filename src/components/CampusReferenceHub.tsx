/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Link, 
  BookOpen, 
  MapPin, 
  Info, 
  ExternalLink, 
  Clock, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  ChevronRight, 
  FileText, 
  Shield, 
  HelpCircle, 
  Clock3, 
  Compass,
  Plus,
  Pencil,
  Database,
  Check,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { CampusLocationMap } from './CampusLocationMap';
import { PortalLink, PortalSyncStatus } from '../types';
import { 
  DEFAULT_PORTAL_LINKS, 
  subscribeToPortalLinks, 
  savePortalLink, 
  deletePortalLink, 
  migrateDefaultPortals,
  resolvePortalVisual
} from '../services/portalService';
import { AddEditPortalModal } from './AddEditPortalModal';

interface CalendarEvent {
  id: string;
  title: string;
  dateRange: string;
  status: 'Sedang Berjalan' | 'Akan Datang' | 'Selesai';
  type: 'akademik' | 'aktiviti' | 'cuti';
}

interface RuleItem {
  id: string;
  title: string;
  desc: string;
  details: string[];
}

interface CampusReferenceHubProps {
  isAdminMode?: boolean;
  onNavigateToTimetables?: () => void;
}

const PortalCardVisual: React.FC<{ link: PortalLink }> = ({ link }) => {
  const visual = resolvePortalVisual(link);
  const [hasError, setHasError] = useState(false);

  if (visual.url && !hasError) {
    return (
      <img
        src={visual.url}
        alt=""
        className="w-5 h-5 rounded object-contain bg-white/90 border border-slate-200/80 p-0.5 shadow-2xs"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div className="w-5 h-5 rounded bg-indigo-50 border border-indigo-200/80 text-indigo-700 flex items-center justify-center text-[10px] font-black shadow-2xs">
      {(link.title || 'P').trim().charAt(0).toUpperCase()}
    </div>
  );
};

export const CampusReferenceHub: React.FC<CampusReferenceHubProps> = ({ 
  isAdminMode = false, 
  onNavigateToTimetables 
}) => {
  const [activeRefTab, setActiveRefTab] = useState<'portal' | 'peta' | 'takwim' | 'panduan'>('portal');
  const [searchQuery, setSearchQuery] = useState('');

  // Dynamic Portals State
  const [portalLinks, setPortalLinks] = useState<PortalLink[]>(DEFAULT_PORTAL_LINKS);
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

  const calendarEvents: CalendarEvent[] = [
    {
      id: 'e1',
      title: 'Sesi Kuliah Semester I Sesi 2026/2027 Bermula',
      dateRange: '20 Julai 2026',
      status: 'Akan Datang',
      type: 'akademik'
    },
    {
      id: 'e2',
      title: 'Minggu Silaturrahim (MSR) Pelajar Baharu',
      dateRange: '15 Julai – 19 Julai 2026',
      status: 'Akan Datang',
      type: 'aktiviti'
    },
    {
      id: 'e3',
      title: 'Cuti Pertengahan Semester I Sesi 2026/2027',
      dateRange: '05 September – 13 September 2026',
      status: 'Akan Datang',
      type: 'cuti'
    },
    {
      id: 'e4',
      title: 'Peperiksaan Akhir Semester I Sesi 2026/2027',
      dateRange: '26 Oktober – 10 November 2026',
      status: 'Akan Datang',
      type: 'akademik'
    },
    {
      id: 'e5',
      title: 'Cuti Akhir Semester I',
      dateRange: '11 November – 29 November 2026',
      status: 'Akan Datang',
      type: 'cuti'
    },
    {
      id: 'e6',
      title: 'Sesi Penilaian Prestasi Mengajar Pensyarah (SPMP)',
      dateRange: '01 Oktober – 15 Oktober 2026',
      status: 'Akan Datang',
      type: 'akademik'
    }
  ];

  const collegeRules: RuleItem[] = [
    {
      id: 'r1',
      title: 'Etika Pemakaian & Rupa Diri (Staf & Pelajar)',
      desc: 'Setiap warga KPM Bandar Penawar mesti mematuhi etika pakaian formal mengikut pekeliling MARA sepanjang waktu kuliah/pejabat.',
      details: [
        'Pelajar Lelaki: Baju kemeja lengan panjang lengkap bertali leher, seluar slack hitam/gelap, rambut pendek kemas.',
        'Pelajar Perempuan: Baju kurung lengkap bertudung kemas (bagi muslim), pemakaian kasut bertutup (sukan/formal).',
        'Staf Akademik/Sokongan: Pakaian pejabat rasmi. Hari Khamis digalakkan memakai pakaian Batik Malaysia.'
      ]
    },
    {
      id: 'r2',
      title: 'Peraturan Keluar Masuk Kampus (Outing & Balik Bermalam)',
      desc: 'Sistem kemasukan dikawal selia oleh unit pengawal keselamatan dan HEP demi kesejahteraan komuniti kampus.',
      details: [
        'Outing Mingguan: Hari Rabu (selepas kelas - 6.30 PM), Jumaat (12.30 PM - 7.00 PM), Sabtu & Ahad (8.00 AM - 7.00 PM).',
        'Balik Bermalam (Homeleave): Pelajar dibenarkan pulang ke rumah dengan kelulusan Warden/HEP melalui borang digital sekurang-kurangnya 3 hari awal.',
        'Kawalan Pagar: Pagar utama ditutup sepenuhnya selepas jam 11:00 malam setiap hari.'
      ]
    },
    {
      id: 'r3',
      title: 'Panduan Am Perpustakaan Al-Ghazali',
      desc: 'Waktu operasi dan tatatertib di dalam dewan perpustakaan utama.',
      details: [
        'Waktu Operasi: Isnin hingga Jumaat (8.15 AM – 4.45 PM). Ditutup pada hari Sabtu, Ahad, dan cuti am.',
        'Pinjaman Buku: Setiap pelajar dibenarkan meminjam maksimum 4 buah buku pada satu masa selama 14 hari berturut-turut.',
        'Larangan: Dilarang membawa makanan, beg galas, minuman manis, atau membuat bising yang mengganggu fokus pembaca lain.'
      ]
    }
  ];

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
      item.url.toLowerCase().includes(q)
    );
  });

  const filteredCalendar = calendarEvents.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.dateRange.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRules = collegeRules.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.details.some(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-left">
      {/* Segmented Selector for reference types with soft pastel themes */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveRefTab('portal')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'portal'
              ? 'bg-purple-100/90 text-purple-950 border-2 border-purple-500 shadow-xs'
              : 'bg-purple-50/70 text-purple-800 hover:bg-purple-100/70 border border-purple-200/60'
          }`}
        >
          <Link className={`w-3.5 h-3.5 ${activeRefTab === 'portal' ? 'text-purple-600' : 'text-purple-500'}`} />
          Portal Kolej
        </button>
        <button
          onClick={() => setActiveRefTab('peta')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'peta'
              ? 'bg-blue-100/90 text-blue-950 border-2 border-blue-500 shadow-xs'
              : 'bg-blue-50/70 text-blue-800 hover:bg-blue-100/70 border border-blue-200/60'
          }`}
        >
          <Compass className={`w-3.5 h-3.5 ${activeRefTab === 'peta' ? 'text-blue-600' : 'text-blue-500'}`} />
          Peta Lokasi Kampus
        </button>
        <button
          onClick={() => setActiveRefTab('takwim')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'takwim'
              ? 'bg-emerald-100/90 text-emerald-950 border-2 border-emerald-500 shadow-xs'
              : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70 border border-emerald-200/60'
          }`}
        >
          <Calendar className={`w-3.5 h-3.5 ${activeRefTab === 'takwim' ? 'text-emerald-600' : 'text-emerald-500'}`} />
          Takwim Akademik
        </button>
        <button
          onClick={() => setActiveRefTab('panduan')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'panduan'
              ? 'bg-amber-100/90 text-amber-950 border-2 border-amber-500 shadow-xs'
              : 'bg-amber-50/70 text-amber-800 hover:bg-amber-100/70 border border-amber-200/60'
          }`}
        >
          <BookOpen className={`w-3.5 h-3.5 ${activeRefTab === 'panduan' ? 'text-amber-600' : 'text-amber-500'}`} />
          Panduan & Peraturan
        </button>
      </div>

      {/* Dynamic Content Panels based on Active Tab */}
      <div className="space-y-8">
        
        {/* SECTION: Campus Location Map */}
        {activeRefTab === 'peta' && (
          <CampusLocationMap />
        )}

        {/* SECTION: Quick Portals Links */}
        {activeRefTab === 'portal' && (
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
                        Status Firestore: Akses Terhad (Missing or insufficient permissions)
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
                  {syncErrorMessage || 'Gagal menghubungi pelayan Firestore (Ralat Rangkaian). Portal dipaparkan dalam mod luar talian (Fallback).'}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPortals.map((link) => (
                <div 
                  key={link.id} 
                    className={`p-5.5 glass-card rounded-[24px] flex flex-col justify-between border border-white/55 shadow-sm hover:scale-[1.01] transition-transform duration-300 relative group ${
                      link.isActive === false ? 'opacity-65 bg-slate-100/60' : ''
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                            link.audience === 'Pelajar' 
                              ? 'bg-blue-50 text-blue-700 border-blue-100' 
                              : link.audience === 'Staf' 
                                ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                          }`}>
                            Sesuai: {link.audience}
                          </span>

                          {link.category && link.category !== 'portal' && (
                            <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-100 capitalize">
                              {link.category}
                            </span>
                          )}

                          {link.isActive === false && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                              Tidak Aktif
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* Admin-only Edit Button: Icon-only pencil */}
                          {isAdminMode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingPortal(link);
                                setIsAddEditPortalOpen(true);
                              }}
                              title="Kemaskini Portal"
                              aria-label="Kemaskini Portal"
                              className="p-1.5 rounded-lg bg-white/90 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-200 shadow-2xs transition-all cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <PortalCardVisual link={link} />
                        </div>
                      </div>

                      <h4 className="font-sans font-extrabold text-slate-900 text-sm">{link.title}</h4>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">{link.desc}</p>
                    </div>

                    <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[200px]">
                        {link.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                      </span>
                      <a 
                        href={link.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-xs font-extrabold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 shrink-0"
                      >
                        Buka Portal <ChevronRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}

              {filteredPortals.length === 0 && (
                <div className="col-span-full py-8 text-center glass-panel rounded-2xl border border-slate-200/60 p-6 space-y-2">
                  <Search className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-500 font-semibold">
                    Tiada pautan portal yang sepadan dengan carian.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION: Academic Calendar Events */}
        {activeRefTab === 'takwim' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Takwim Akademik Sesi 2026/2027 ({filteredCalendar.length})
              </h3>
            </div>

            <div className="glass-panel rounded-[26px] overflow-hidden border border-white/55 shadow-sm">
              <div className="divide-y divide-slate-100/80">
                {filteredCalendar.map((event) => {
                  const borderLColor = event.type === 'akademik' 
                    ? 'border-l-4 border-indigo-500' 
                    : event.type === 'cuti' 
                      ? 'border-l-4 border-rose-500' 
                      : 'border-l-4 border-emerald-500';

                  return (
                    <div 
                      key={event.id}
                      className={`p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-white/50 transition-colors ${borderLColor}`}
                    >
                      <div className="flex items-start gap-3.5 text-left">
                        <div className="p-2.5 rounded-xl bg-white/80 border border-slate-100 text-indigo-700 shadow-2xs">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-sans font-extrabold text-slate-900 text-[13px]">{event.title}</h4>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 font-semibold">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{event.dateRange}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-md border ${
                          event.type === 'akademik' 
                            ? 'bg-blue-50 text-blue-800 border-blue-100' 
                            : event.type === 'cuti' 
                              ? 'bg-red-50 text-red-800 border-red-100' 
                              : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                        }`}>
                          {event.type.toUpperCase()}
                        </span>
                        <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-md bg-white border border-slate-100 text-slate-600 flex items-center gap-1 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {event.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredCalendar.length === 0 && (
                  <p className="p-6 text-xs text-gray-500">Tiada acara takwim yang sepadan dengan carian.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION: Rules & Student Guide */}
        {activeRefTab === 'panduan' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Panduan Am, Polisi & Peraturan Kolej ({filteredRules.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {filteredRules.map((rule) => (
                <div 
                  key={rule.id} 
                  className="p-6.5 glass-card rounded-[26px] border border-white/55 shadow-sm bg-gradient-to-b from-white/70 to-white/40 hover:scale-[1.005] transition-all text-left"
                >
                  <div className="space-y-2 border-b border-slate-100 pb-3.5">
                    <h4 className="font-sans font-extrabold text-slate-900 text-sm flex items-center gap-2.5">
                      <Shield className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                      {rule.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">{rule.desc}</p>
                  </div>
                  <div className="mt-4.5 space-y-3">
                    {rule.details.map((detail, idx) => (
                      <div key={idx} className="flex gap-3 text-xs text-slate-600 font-semibold leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredRules.length === 0 && (
                <p className="text-xs text-gray-500">Tiada maklumat peraturan ditemui.</p>
              )}
            </div>
          </div>
        )}

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

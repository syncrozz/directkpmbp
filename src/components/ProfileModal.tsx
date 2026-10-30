/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, MessageCircle, Mail, GraduationCap, Award, Building2, Hash, Pencil, Camera, ChevronRight, Calendar, ExternalLink, Car, MapPin, Lock, ShieldCheck, Copy, Check } from 'lucide-react';
import { Staff, StaffCommittee } from '../types';
import { getGredBadgeStyle } from '../utils/gredColors';
import { getBahagianTheme } from '../utils/bahagianColors';
import { getStaffGrade } from '../utils/staffGrade';
import { sortCommitteesBySeniority } from '../utils/committeeService';
import { StaffAvatar } from './StaffAvatar';

interface ProfileModalProps {
  staff: Staff | null;
  committees?: StaffCommittee[];
  onClose: () => void;
  isAdminMode?: boolean;
  onEditStaff?: (staff: Staff) => void;
  onOpenCommittee?: (staff: Staff) => void;
  onOpenAdminPin?: () => void;
}

export const parseQualificationLines = (raw: string | undefined): string[] => {
  if (!raw || !raw.trim()) return [];
  // Split on newlines or semicolons first
  const rawSegments = raw.split(/[\r\n]+|;/g).map(s => s.trim()).filter(Boolean);
  const results: string[] = [];

  for (const seg of rawSegments) {
    // Splits on comma followed by next numbered item (e.g. ', 2 - ', ', 3. ', ', 2) ')
    // OR comma followed by degree level keyword (Sarjana/Ijazah/Diploma/Sijil/Bachelor/Master/PhD/Doctor/Degree)
    const parts = seg.split(/,\s*(?=(?:\d+\s*[-.),]|\b(?:Sarjana|Ijazah|Diploma|Sijil|Bachelor|Master|PhD|Doctor|Doctorate|Degree|Postgraduate)\b))/i);
    for (const p of parts) {
      const clean = p.replace(/^,\s*|,\s*$/g, '').trim();
      if (clean) results.push(clean);
    }
  }

  // Fallback if multiple numbered items exist without comma
  if (results.length === 1 && /(?:\s+\d+\s*[-.)]\s+)/.test(results[0])) {
    const fallbackParts = results[0].split(/(?=\b\d+\s*[-.)]\s+)/).map(s => s.replace(/^,\s*|,\s*$/g, '').trim()).filter(Boolean);
    if (fallbackParts.length > 1) return fallbackParts;
  }

  return results.length > 0 ? results : [raw.trim()];
};

export const ProfileModal: React.FC<ProfileModalProps> = ({ staff, committees = [], onClose, isAdminMode, onEditStaff, onOpenCommittee, onOpenAdminPin }) => {
  const [timetableError, setTimetableError] = useState(false);
  const [isTimetableLoading, setIsTimetableLoading] = useState(true);
  const [copiedIc, setCopiedIc] = useState(false);

  const staffIdClean = (staff?.ID || staff?.staff_id || '').toUpperCase().trim();
  const timetableUrl = staffIdClean
    ? `https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/TimeTable/${staffIdClean}.jpg`
    : '';

  useEffect(() => {
    setTimetableError(false);
    setIsTimetableLoading(true);
  }, [staffIdClean]);

  // Handle ESC key to dismiss modal and manage body scroll lock
  useEffect(() => {
    if (!staff) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [staff, onClose]);

  if (!staff) return null;

  const theme = getBahagianTheme(staff.Bahagian);
  const staffNameClean = (staff.Nama || '').toLowerCase().trim();

  const rawMatchedCommittees = (committees || []).filter((c) => {
    const cStaffId = (c.staff_id || '').toUpperCase().trim();
    const cStaffNama = (c.staff_nama || '').toLowerCase().trim();

    if (cStaffId && (cStaffId === staffIdClean || cStaffId.replace(/^ST0*/, '') === staffIdClean.replace(/^ST0*/, ''))) {
      return true;
    }
    if (cStaffNama && staffNameClean && (cStaffNama.includes(staffNameClean) || staffNameClean.includes(cStaffNama))) {
      return true;
    }
    return false;
  });

  const matchedCommittees = sortCommitteesBySeniority(rawMatchedCommittees);

  const getInitials = (name: string) => {
    const cleanName = name
      .replace(/^(Tuan|Haji|Puan|Encik|Dr\.|Cik|Hj\.|Pn\.|En\.)\s+/i, '')
      .replace(/\s+(Cmilt|M\.T\.A\.M|C\.A\.\(M\)|Afpm)$/i, '')
      .replace(/^(bin|binti|bt|bt\.)\s+/i, '');
    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'ST';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const initials = getInitials(staff.Nama);

  const triggerJadual = () => {
    if (timetableUrl) {
      window.open(timetableUrl, '_blank');
    }
  };

  const triggerCall = () => {
    if (staff.Telefon) {
      window.location.href = `tel:${staff.Telefon}`;
    }
  };

  const triggerWhatsApp = () => {
    const rawNumber = staff.Telefon || '';
    const cleanWa = rawNumber.replace(/\D/g, '');
    if (!cleanWa) return;
    const waUrl = cleanWa.startsWith('60')
      ? `https://wa.me/${cleanWa}`
      : cleanWa.startsWith('0')
        ? `https://wa.me/6${cleanWa}`
        : `https://wa.me/60${cleanWa}`;
    window.open(waUrl, '_blank');
  };

  const triggerEmail = () => {
    if (staff.Email) window.location.href = `mailto:${staff.Email}`;
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative glass-modal rounded-[32px] max-w-lg w-full overflow-hidden shadow-2xl z-50 border border-white/50 my-auto"
        >
          {/* Cover Color Strip */}
          <div className={`h-24 w-full relative ${theme.banner} bg-opacity-90 backdrop-blur-sm`}>
            {/* Action Buttons on Banner (Edit Icon on the left of X Close Button) */}
            <div className="absolute top-4 right-4 flex items-center gap-2">
              {isAdminMode && onEditStaff && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditStaff(staff);
                  }}
                  title="Sunting Rekod Staf"
                  aria-label="Sunting Rekod Staf"
                  className="bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-full p-2 backdrop-blur-sm transition-all focus:outline-none shadow-md border border-white/20 cursor-pointer flex items-center justify-center hover:scale-105"
                >
                  <Pencil className="w-5 h-5" />
                </button>
              )}

              {/* Close Button on Banner */}
              <button
                type="button"
                onClick={onClose}
                title="Tutup"
                aria-label="Tutup"
                className="bg-white/20 hover:bg-white/35 active:scale-95 text-white rounded-full p-2 backdrop-blur-sm transition-all focus:outline-none border border-white/10 cursor-pointer flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Profile Photo Area */}
          <div className="px-6 pb-6 relative -mt-12 text-left">
            <div className="flex items-end justify-between mb-4">
              {/* WhatsApp Style Profile Avatar with Pencil Camera Icon in Admin Mode */}
              <div className="relative group/avatar cursor-pointer" onClick={() => {
                if (isAdminMode && onEditStaff) {
                  onClose();
                  onEditStaff(staff);
                }
              }}>
                <StaffAvatar
                  staff={staff}
                  sizeClassName="w-24 h-24"
                  textSizeClassName="text-3xl"
                  avatarBgClassName={theme.avatarBg}
                  ringClassName="ring-4 ring-white shadow-xl"
                />
                {isAdminMode && (
                  <div
                    className="absolute bottom-0 right-0 p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg border-2 border-white transition-all transform hover:scale-110 flex items-center justify-center"
                    title="Klik untuk Tukar Gambar Profil"
                  >
                    <Camera className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Status & ID Badge */}
              <div className="flex flex-col items-end gap-1.5">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${theme.badge} bg-white/80 backdrop-blur-sm`}>
                  {staff.Bahagian} • {staff.DepartmentID}
                </span>
                <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1 bg-white/60 px-2.5 py-0.5 rounded-lg border border-slate-200">
                  <Hash className="w-3 h-3" /> {staff.ID}
                </span>
              </div>
            </div>

            {/* Main Info */}
            <div className="space-y-1.5 mt-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-normal leading-snug uppercase">
                {staff.Nama}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {(() => {
                  const resolvedGred = getStaffGrade(staff);
                  return (
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-black rounded-md tracking-wide uppercase ${getGredBadgeStyle(resolvedGred)}`}>
                      {resolvedGred}
                    </span>
                  );
                })()}
                <p className="text-sm font-bold text-indigo-700">
                  {staff.Jawatan}
                </p>
              </div>
            </div>

            {/* Quick Contact & Info Buttons Row */}
            <div className="grid grid-cols-3 gap-3 mt-5">
              <button
                onClick={triggerJadual}
                title="Buka Gambar Jadual Waktu Pensyarah"
                className="py-2.5 px-4 rounded-xl border border-indigo-200/80 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-900 flex flex-col items-center gap-1 transition-all shadow-2xs cursor-pointer active:scale-95"
              >
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="text-[11px] font-bold">Jadual</span>
              </button>

              <button
                onClick={triggerWhatsApp}
                className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 flex flex-col items-center gap-1 transition-all shadow-2xs cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="text-[11px] font-bold">WhatsApp</span>
              </button>

              <button
                onClick={triggerEmail}
                className="py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 flex flex-col items-center gap-1 transition-all shadow-2xs cursor-pointer"
              >
                <Mail className="w-4 h-4 text-rose-500" />
                <span className="text-[11px] font-bold">Emel</span>
              </button>
            </div>

            {/* Detailed Meta Grid */}
            <div className="mt-6 space-y-4 pt-4 border-t border-slate-100">
              {/* Pejabat & Sambungan */}
              <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="mt-0.5 p-2 bg-indigo-100 text-indigo-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Telefon Pejabat & Sambungan</h4>
                  <p className="text-sm text-slate-900 font-bold">
                    {staff.Telefon || '07-8842222'} {staff.Sambungan ? `(${staff.Sambungan})` : ''}
                  </p>
                </div>
              </div>

              {/* Unit / Jabatan & Kategori */}
              {(staff.Unit || staff.DepartmentID || staff.Kategori) && (
                <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="mt-0.5 p-2 bg-indigo-100 text-indigo-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Unit / Jabatan & Kategori</h4>
                    <p className="text-sm text-slate-900 font-bold">
                      {staff.Unit || staff.DepartmentID}
                      {staff.Kategori && (
                        <span className="ml-2 text-xs font-semibold text-slate-500">
                          ({staff.Kategori})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* No. Kad Pengenalan / IC (Akses Mod Admin Sahaja) */}
              {isAdminMode && (
                (() => {
                  const rawIc = (staff.IC || staff.NoKP || '').trim();
                  if (!rawIc) return null;

                  const digitsOnly = rawIc.replace(/\D/g, '');
                  const formattedIc = digitsOnly.length === 12
                    ? `${digitsOnly.slice(0, 6)}-${digitsOnly.slice(6, 8)}-${digitsOnly.slice(8, 12)}`
                    : rawIc;

                  const handleCopyIc = () => {
                    if (navigator?.clipboard) {
                      navigator.clipboard.writeText(digitsOnly || rawIc);
                      setCopiedIc(true);
                      setTimeout(() => setCopiedIc(false), 2000);
                    }
                  };

                  return (
                    <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <div className="mt-0.5 p-2 bg-indigo-100 text-indigo-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">No. Kad Pengenalan (IC)</h4>
                            <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[9px] font-black rounded-md uppercase">Admin Mode</span>
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyIc}
                            title="Salin No. Kad Pengenalan"
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 hover:border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {copiedIc ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600 font-extrabold">Disalin</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Salin</span>
                              </>
                            )}
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-sm text-slate-900 font-mono font-black tracking-wide">
                            {formattedIc}
                          </span>
                          {rawIc !== formattedIc && (
                            <span className="text-[10px] text-slate-400 font-mono">({rawIc})</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* Daerah Asal & Tahun Lahir (Akses Mod Admin Sahaja) */}
              {isAdminMode ? (
                (staff.DaerahAsal || staff.TahunLahir || staff['Tahun Lahir']) && (
                  <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="mt-0.5 p-2 bg-teal-100 text-teal-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Daerah Asal & Tahun Lahir</h4>
                        <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[9px] font-black rounded-md uppercase">Admin Mode</span>
                      </div>
                      <p className="text-xs text-slate-800 font-bold mt-0.5">
                        {staff.DaerahAsal || 'Tiada rekod'}
                        {(staff.TahunLahir || staff['Tahun Lahir']) && (
                          <span className="ml-2 text-slate-500 font-medium">
                            • Lahir: {staff.TahunLahir || staff['Tahun Lahir']}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              ) : null}

              {/* Maklumat Kenderaan (PlatNo1, PlatNo2, PlatNo3 - Akses Admin Mode Sahaja) */}
              {isAdminMode ? (
                (() => {
                  const carPlates = [staff.PlatNo1, staff.PlatNo2, staff.PlatNo3].filter(Boolean) as string[];
                  const otherPlates = (!carPlates.length && staff.NoPlat) ? [staff.NoPlat] : [];
                  const allPlates = [...carPlates, ...otherPlates];

                  if (allPlates.length === 0) return null;

                  return (
                    <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Car className="w-3.5 h-3.5 text-slate-600" />
                          <span>Nombor Pendaftaran Kenderaan (PlatNo)</span>
                        </h4>
                        <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 text-[9px] font-black rounded-md uppercase">Admin Mode</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {allPlates.map((plate, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-900 shadow-2xs font-mono">
                            <Car className="w-3 h-3 text-indigo-600" />
                            {plate}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : null}

              {/* Notis Akses Terhad bagi Bukan-Admin */}
              {!isAdminMode && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-200 text-slate-600 rounded-xl shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[11px] font-extrabold text-slate-700">Maklumat Peribadi & Kenderaan Dihadkan</h4>
                      <p className="text-[10px] text-slate-500 font-medium">No. Kad Pengenalan (IC), daerah asal, tahun lahir & no. plat hanya untuk Admin Mode.</p>
                    </div>
                  </div>
                  {onOpenAdminPin && (
                    <button
                      type="button"
                      onClick={onOpenAdminPin}
                      className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-extrabold shrink-0 transition-all cursor-pointer shadow-2xs flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Admin Mode</span>
                    </button>
                  )}
                </div>
              )}

              {/* Kelulusan Akademik (Kelayakan) */}
              <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div className="mt-0.5 p-2 bg-emerald-100 text-emerald-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Kelulusan Akademik (Kelayakan)</h4>
                  {staff.Kelulusan ? (
                    <div className="space-y-1.5">
                      {parseQualificationLines(staff.Kelulusan).map((line, idx) => (
                        <p key={idx} className="text-xs text-slate-800 leading-relaxed font-bold">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-800 leading-relaxed font-bold">
                      Tiada rekod kelulusan khusus
                    </p>
                  )}
                </div>
              </div>

              {/* Bidang Pengkhususan */}
              {staff.Pengkhususan && (
                <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="mt-0.5 p-2 bg-amber-100 text-amber-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1">Bidang Pengkhususan / Kepakaran</h4>
                    <div className="space-y-1.5">
                      {parseQualificationLines(staff.Pengkhususan).map((line, idx) => (
                        <p key={idx} className="text-xs text-slate-800 leading-relaxed font-bold">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Email Text Display */}
              {staff.Email && (
                <div className="flex gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="mt-0.5 p-2 bg-rose-100 text-rose-700 rounded-xl h-9 w-9 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Alamat Emel Rasmi</h4>
                    <p className="text-xs text-indigo-700 font-bold hover:underline cursor-pointer break-all" onClick={triggerEmail}>
                      {staff.Email}
                    </p>
                  </div>
                </div>
              )}

              {/* Jawatankuasa Direct Summary Section */}
              <div className="bg-amber-500/5 p-3.5 rounded-2xl border border-amber-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                      <Award className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-950">
                        Maklumat Jawatankuasa Staf
                      </h4>
                      <p className="text-[10px] text-amber-800/90 font-medium">
                        Rekod Rasmi: <span className="font-bold">Jawatankuasa KPMBP</span>
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-0.5 bg-amber-500 text-white text-[11px] font-black rounded-full shadow-2xs">
                    {matchedCommittees.length} Jawatankuasa
                  </span>
                </div>

                {matchedCommittees.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {matchedCommittees.slice(0, 4).map((item, idx) => (
                      <div key={item.id || idx} className="p-2.5 bg-white rounded-xl border border-amber-100 text-xs flex items-center justify-between gap-2 shadow-2xs">
                        <span className="font-extrabold text-slate-800 line-clamp-1 flex-1">
                          {item.jawatankuasa}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-100 text-amber-900 shrink-0">
                          {item.peranan}
                        </span>
                      </div>
                    ))}
                    {matchedCommittees.length > 4 && (
                      <p className="text-[10.5px] font-extrabold text-amber-800 text-center pt-0.5">
                        + {matchedCommittees.length - 4} lagi jawatankuasa
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-900/70 font-medium italic pt-1">
                    Tiada rekod jawatankuasa khusus didaftarkan.
                  </p>
                )}

                {onOpenCommittee && (
                  <button
                    type="button"
                    onClick={() => onOpenCommittee(staff)}
                    className="w-full mt-2 py-2.5 px-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
                  >
                    Buka Paparan Penuh Jawatankuasa ({matchedCommittees.length}) <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Seksyen Jadual Waktu Pensyarah */}
              <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950">
                        Jadual Waktu
                      </h4>
                      <p className="text-[10px] text-indigo-800/80 font-medium">
                        Staff ID: <span className="font-bold">{staffIdClean || 'N/A'}</span>
                      </p>
                    </div>
                  </div>
                  {timetableUrl && !timetableError && (
                    <a
                      href={timetableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors"
                      title="Buka gambar jadual waktu di tab baharu"
                    >
                      <span>Tab Baharu</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                <div className="pt-1">
                  {timetableUrl && !timetableError ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200/80 bg-white shadow-2xs">
                      {isTimetableLoading && (
                        <div className="h-36 w-full flex items-center justify-center bg-slate-50 text-xs text-slate-400 font-medium animate-pulse">
                          Memuatkan jadual waktu ({staffIdClean}.jpg)...
                        </div>
                      )}
                      <img
                        src={timetableUrl}
                        alt={`Jadual Waktu ${staff.Nama} (${staffIdClean})`}
                        onLoad={() => setIsTimetableLoading(false)}
                        onError={() => {
                          setTimetableError(true);
                          setIsTimetableLoading(false);
                        }}
                        className={`w-full h-auto max-h-[380px] object-contain rounded-xl transition-all ${
                          isTimetableLoading ? 'hidden' : 'block'
                        }`}
                      />
                    </div>
                  ) : (
                    <div className="p-3.5 bg-white/80 rounded-xl border border-slate-200/60 text-center space-y-1">
                      <p className="text-xs font-bold text-slate-600">Jadual waktu belum tersedia.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

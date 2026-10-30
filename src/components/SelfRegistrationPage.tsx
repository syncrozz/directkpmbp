/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserCheck, 
  ArrowLeft, 
  CheckCircle2, 
  Send, 
  Briefcase, 
  Mail, 
  Phone, 
  GraduationCap, 
  Award, 
  Car, 
  Calendar, 
  MapPin, 
  Hash, 
  Building2, 
  Share2, 
  Check, 
  Copy, 
  ExternalLink,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Staff, DivisionType } from '../types';
import { findDuplicateStaff } from '../utils/staffDeduplication';
import { formatIC } from '../utils/icFormatter';

interface SelfRegistrationPageProps {
  existingStaffList: Staff[];
  onRegisterStaff: (newStaff: Staff) => void;
  onNavigateHome: () => void;
  onViewStaffProfile: (staff: Staff) => void;
}

export const SelfRegistrationPage: React.FC<SelfRegistrationPageProps> = ({
  existingStaffList = [],
  onRegisterStaff,
  onNavigateHome,
  onViewStaffProfile,
}) => {
  // Compute next suggested Staff ID (e.g. ST076 if highest is ST075)
  const suggestedId = useMemo(() => {
    let maxNum = 0;
    existingStaffList.forEach((s) => {
      const raw = (s.ID || s.StaffID || s.staff_id || '').toUpperCase();
      const match = raw.match(/^ST(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `ST${String(maxNum + 1).padStart(3, '0')}`;
  }, [existingStaffList]);

  // Form State
  const [staffId, setStaffId] = useState(suggestedId);
  const [nama, setNama] = useState('');
  const [kategori, setKategori] = useState<DivisionType>('Akademik');
  const [jawatan, setJawatan] = useState('Pensyarah');
  const [unit, setUnit] = useState('Sains Kuantitatif');
  const [gred, setGred] = useState('DG9');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [sambungan, setSambungan] = useState('');
  const [kelulusan, setKelulusan] = useState('');
  const [pengkhususan, setPengkhususan] = useState('');
  const [daerahAsal, setDaerahAsal] = useState('');
  const [tahunLahir, setTahunLahir] = useState('');
  const [ic, setIc] = useState('');
  const [platNo1, setPlatNo1] = useState('');
  const [platNo2, setPlatNo2] = useState('');
  const [platNo3, setPlatNo3] = useState('');

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [registeredStaff, setRegisteredStaff] = useState<Staff | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Check if ID is already taken
  const cleanId = staffId.toUpperCase().trim();
  const isIdTaken = useMemo(() => {
    if (!cleanId) return false;
    return existingStaffList.some(
      (s) => (s.ID || s.StaffID || s.staff_id || '').toUpperCase().trim() === cleanId
    );
  }, [cleanId, existingStaffList]);

  // Copy registration link
  const currentRegistrationUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#/daftar`
    : '';

  const handleCopySlug = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(currentRegistrationUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Validations
    if (!nama.trim()) {
      setErrorMessage('Sila masukkan Nama Penuh kakitangan.');
      return;
    }
    if (!staffId.trim()) {
      setErrorMessage('Sila masukkan No. Staf / StaffID.');
      return;
    }
    if (isIdTaken) {
      const existing = existingStaffList.find(
        (s) => (s.ID || s.StaffID || s.staff_id || '').toUpperCase().trim() === cleanId
      );
      const updateMsg = `PENGESAHAN KEMASKINI:\n` +
        `No. Staf "${cleanId}" telah wujud dalam sistem atas nama "${existing?.Nama || '-'}" (${existing?.Jawatan || '-'}).\n\n` +
        `Adakah anda ingin mengemaskini maklumat profil kakitangan ini dengan data yang baru diisi?`;

      if (!window.confirm(updateMsg)) {
        setErrorMessage(`No. Staf "${cleanId}" telah didaftarkan dalam sistem. Sila gunakan Staff ID berlainan atau sahkan kemaskini.`);
        return;
      }
    }
    if (!jawatan.trim()) {
      setErrorMessage('Sila masukkan Jawatan kakitangan.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Sila masukkan Alamat Emel Rasmi MARA.');
      return;
    }
    if (!telefon.trim()) {
      setErrorMessage('Sila masukkan Nombor Telefon.');
      return;
    }

    // Duplicate check based on normalized name or email
    const duplicate = findDuplicateStaff(
      { Nama: nama.trim(), Email: email.trim() },
      existingStaffList,
      cleanId
    );

    if (duplicate) {
      const duplicateMsg = `AMARAN DUPLIKAT:\n` +
        `Rekod staf dengan nama atau emel yang sepadan sudah wujud dalam sistem:\n` +
        `• Nama: ${duplicate.Nama}\n` +
        `• No. Staf: ${duplicate.StaffID || duplicate.ID}\n` +
        `• Jawatan: ${duplicate.Jawatan}\n` +
        `• Emel: ${duplicate.Email || '-'}\n` +
        `• Unit: ${duplicate.Unit || '-'}\n\n` +
        `Adakah anda pasti mahu meneruskan pendaftaran staf baharu ini dengan ID "${cleanId}"?`;

      if (!window.confirm(duplicateMsg)) {
        return;
      }
    }

    setIsSubmitting(true);

    const plates = [platNo1, platNo2, platNo3]
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);

    // Staff names are officially stored in UPPERCASE per institutional directory standards
    const uppercaseName = nama.trim().toUpperCase();

    const newStaff: Staff = {
      Bil: String(existingStaffList.length + 1),
      StaffID: cleanId,
      ID: cleanId,
      staff_id: cleanId,
      Nama: uppercaseName,
      Kategori: kategori,
      Bahagian: kategori,
      Jawatan: jawatan.trim(),
      Unit: unit.trim(),
      DepartmentID: unit.trim(),
      Kelulusan: kelulusan.trim(),
      Pengkhususan: pengkhususan.trim(),
      DaerahAsal: daerahAsal.trim(),
      Telefon: telefon.trim(),
      Sambungan: sambungan.trim(),
      Email: email.trim().toLowerCase(),
      Gred: gred.trim().toUpperCase(),
      grade: gred.trim().toUpperCase(),
      'Tahun Lahir': tahunLahir.trim(),
      TahunLahir: tahunLahir.trim(),
      IC: formatIC(ic),
      NoKP: formatIC(ic),
      PlatNo1: platNo1.trim().toUpperCase(),
      PlatNo2: platNo2.trim().toUpperCase(),
      PlatNo3: platNo3.trim().toUpperCase(),
      NoPlat: plates.join(', '),
      Status: 'Aktif',
    };

    try {
      onRegisterStaff(newStaff);
      setRegisteredStaff(newStaff);
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(`Ralat semasa mendaftar: ${err?.message || 'Sila cuba lagi'}`);
    }
  };

  const handleResetForNext = () => {
    setRegisteredStaff(null);
    setNama('');
    setStaffId(suggestedId);
    setEmail('');
    setTelefon('');
    setSambungan('');
    setKelulusan('');
    setPengkhususan('');
    setDaerahAsal('');
    setTahunLahir('');
    setPlatNo1('');
    setPlatNo2('');
    setPlatNo3('');
  };

  return (
    <div className="min-h-screen py-6 px-4 sm:px-6 lg:px-8 relative z-20">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Top Header Card */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/70 shadow-sm relative overflow-hidden text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            
            <div className="flex items-center gap-4">
              <img
                src="https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/KPMBPSmartHub/favicon.svg"
                alt="Logo KPMBP"
                className="w-14 h-14 object-contain drop-shadow-md rounded-2xl shrink-0 bg-white/80 p-1.5 border border-indigo-100"
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                    Borang Rasmi Kendiri
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                    Kakitangan & Pensyarah Baharu
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-1 tracking-tight">
                  Pendaftaran Kendiri Kakitangan KPMBP
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Kolej Profesional MARA Bandar Penawar • Terus dimuatkan ke dalam platform direktori
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onNavigateHome}
                className="px-4 py-2.5 bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600 rounded-2xl text-xs font-black flex items-center gap-2 border border-slate-200 shadow-2xs transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Ke Direktori</span>
              </button>

              <button
                type="button"
                onClick={handleCopySlug}
                title="Salin Pautan Pendaftaran (Slug)"
                className="px-3.5 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-2xl text-xs font-black flex items-center gap-1.5 border border-indigo-200 transition-all cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-700">Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-indigo-600" />
                    <span>Kongsi Slug</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* If successfully registered, show celebration receipt screen */}
        {registeredStaff ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="glass-panel rounded-3xl p-6 sm:p-8 border border-emerald-200/80 bg-white/95 shadow-xl text-left space-y-6"
          >
            <div className="flex items-center gap-3.5 pb-4 border-b border-emerald-100">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">
                  Pendaftaran Kendiri Berjaya!
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  Profil anda telah berjaya disimpan secara terus ke dalam direktori kakitangan KPMBP & Firebase Firestore.
                </p>
              </div>
            </div>

            {/* Profile Summary Card */}
            <div className="p-5 bg-gradient-to-br from-indigo-50/60 to-slate-50 rounded-2xl border border-indigo-100 space-y-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-indigo-600 text-white">
                    {registeredStaff.ID}
                  </span>
                  <h3 className="text-lg font-black text-slate-900 uppercase mt-1">
                    {registeredStaff.Nama}
                  </h3>
                  <p className="text-xs font-bold text-indigo-700">
                    {registeredStaff.Jawatan} • {registeredStaff.Unit} ({registeredStaff.Gred})
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {registeredStaff.Bahagian}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-indigo-100/70 text-slate-600">
                <div><span className="font-semibold text-slate-400">Emel:</span> <span className="font-bold text-slate-800">{registeredStaff.Email}</span></div>
                <div><span className="font-semibold text-slate-400">Telefon:</span> <span className="font-bold text-slate-800">{registeredStaff.Telefon}</span></div>
                {registeredStaff.Kelulusan && (
                  <div className="sm:col-span-2"><span className="font-semibold text-slate-400">Kelulusan:</span> <span className="font-bold text-slate-800">{registeredStaff.Kelulusan}</span></div>
                )}
                {registeredStaff.NoPlat && (
                  <div className="sm:col-span-2"><span className="font-semibold text-slate-400">No. Kenderaan:</span> <span className="font-bold text-slate-800">{registeredStaff.NoPlat}</span></div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onViewStaffProfile(registeredStaff)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-md shadow-indigo-200 cursor-pointer transition-all"
              >
                <UserCheck className="w-4 h-4" />
                <span>Buka Profil Saya di Direktori</span>
              </button>

              <button
                type="button"
                onClick={handleResetForNext}
                className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-black flex items-center justify-center gap-2 border border-slate-200 shadow-2xs cursor-pointer transition-all"
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Daftar Staf Baharu Lain</span>
              </button>

              <button
                type="button"
                onClick={onNavigateHome}
                className="w-full sm:w-auto px-5 py-3 text-slate-500 hover:text-slate-800 text-xs font-bold transition-all cursor-pointer sm:ml-auto"
              >
                Kembali ke Halaman Utama
              </button>
            </div>
          </motion.div>
        ) : (
          /* Form Component */
          <form onSubmit={handleSubmit} className="space-y-6 text-left">

            {/* Error Notification Banner */}
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3 text-rose-900 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-semibold">{errorMessage}</div>
              </motion.div>
            )}

            {/* Section 1: Maklumat Perjawatan & Asas */}
            <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-white/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    1. Maklumat Perjawatan & Asas
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Maklumat identiti dan klasifikasi jawatan anda di KPMBP
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nama Penuh */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                    <span>Nama Penuh Kakitangan *</span>
                    <span className="text-[10px] text-slate-400 font-semibold">(Disimpan dalam huruf besar rasmi)</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    placeholder="cth: MUHAMMAD HAZIQ BIN ISMAIL"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase transition-all shadow-2xs"
                  />
                </div>

                {/* Staff ID */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800 flex items-center justify-between">
                    <span>No. Staf / StaffID *</span>
                    {cleanId && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded ${
                        isIdTaken 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {isIdTaken ? 'Wujud (Akan Dikemaskini)' : 'Tersedia'}
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={staffId}
                      onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                      placeholder="cth: ST076"
                      className={`w-full px-4 py-3 rounded-2xl border bg-white/90 text-sm font-mono font-bold outline-none uppercase transition-all shadow-2xs ${
                        isIdTaken 
                          ? 'border-rose-400 focus:ring-2 focus:ring-rose-500/20' 
                          : 'border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'
                      }`}
                    />
                  </div>
                  <p className="text-[10.5px] text-slate-400">
                    Cadangan nombor seterusnya: <span className="font-mono font-bold text-indigo-600">{suggestedId}</span>
                  </p>
                </div>

                {/* Kategori / Bahagian */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Kategori / Bahagian *
                  </label>
                  <select
                    value={kategori}
                    onChange={(e) => setKategori(e.target.value as DivisionType)}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs cursor-pointer"
                  >
                    <option value="Akademik">Akademik</option>
                    <option value="Pengurusan">Pengurusan</option>
                    <option value="Sokongan Akademik">Sokongan Akademik</option>
                    <option value="Pentadbiran">Pentadbiran</option>
                  </select>
                </div>

                {/* Jawatan */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Jawatan Hakiki *
                  </label>
                  <input
                    type="text"
                    required
                    list="jawatan-suggestions"
                    value={jawatan}
                    onChange={(e) => setJawatan(e.target.value)}
                    placeholder="cth: Pensyarah / Pegawai..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                  <datalist id="jawatan-suggestions">
                    <option value="Pensyarah" />
                    <option value="Kaunselor" />
                    <option value="Ketua Jabatan" />
                    <option value="Ketua UPPK" />
                    <option value="Pegawai Ko-Kurikulum" />
                    <option value="Timb. Pengarah HEA" />
                    <option value="Timb. Pengarah HEP" />
                    <option value="Timb. Pengarah (Khidmat Pengurusan)" />
                    <option value="Pegawai Teknologi Maklumat" />
                    <option value="Pegawai Perpustakaan" />
                    <option value="Penolong Pegawai Tadbir" />
                    <option value="Penolong Akauntan" />
                    <option value="Pembantu Tadbir" />
                  </datalist>
                </div>

                {/* Unit / Jabatan */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Unit / Jabatan *
                  </label>
                  <input
                    type="text"
                    required
                    list="unit-suggestions"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="cth: Sains Kuantitatif / Pentadbiran"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                  <datalist id="unit-suggestions">
                    <option value="Sains Kuantitatif" />
                    <option value="Pengurusan Perniagaan" />
                    <option value="Perakaunan" />
                    <option value="Pengajian Am" />
                    <option value="Kaunseling" />
                    <option value="Ko Kurikulum" />
                    <option value="Pentadbiran" />
                    <option value="Pengurusan" />
                    <option value="Pusat Sumber" />
                    <option value="Kewangan" />
                  </datalist>
                </div>

                {/* Gred Perkhidmatan */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Gred Perkhidmatan *
                  </label>
                  <input
                    type="text"
                    required
                    list="gred-suggestions"
                    value={gred}
                    onChange={(e) => setGred(e.target.value.toUpperCase())}
                    placeholder="cth: DG9, DG10, DG12, N5, F10..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase transition-all shadow-2xs"
                  />
                  <datalist id="gred-suggestions">
                    <option value="DG9" />
                    <option value="DG10" />
                    <option value="DG12" />
                    <option value="DG13" />
                    <option value="N5" />
                    <option value="N9" />
                    <option value="F10" />
                    <option value="S10" />
                    <option value="W9" />
                    <option value="E10" />
                  </datalist>
                </div>
              </div>
            </div>

            {/* Section 2: Maklumat Hubungan Rasmi */}
            <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-white/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    2. Maklumat Hubungan Rasmi
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Saluran komunikasi bagi kemudahan staf, pelajar, dan pihak pentadbiran
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Emel Rasmi */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Alamat Emel Rasmi MARA *
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cth: nama.anda@mara.gov.my"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                </div>

                {/* Extension */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Sambungan Pejabat (Ext)
                  </label>
                  <input
                    type="text"
                    value={sambungan}
                    onChange={(e) => setSambungan(e.target.value)}
                    placeholder="cth: 201, 240"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-mono font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                </div>

                {/* Nombor Telefon */}
                <div className="sm:col-span-2 space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Nombor Telefon Bimbit *
                  </label>
                  <input
                    type="tel"
                    required
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    placeholder="cth: 013-9500149"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Kelayakan Akademik & Kepakaran */}
            <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-white/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    3. Kelayakan Akademik & Kepakaran
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Kelayakan pengajian tinggi dan latar belakang kepakaran bidang anda
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Kelulusan Akademik */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold text-slate-800">
                    Kelulusan Akademik (Kelayakan)
                  </label>
                  <textarea
                    rows={3}
                    value={kelulusan}
                    onChange={(e) => setKelulusan(e.target.value)}
                    placeholder="cth: Sarjana Sains Komputer, UTM, 2. Sarjana Muda Kejuruteraan Perisian (Kepujian), UKM"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                  />
                  <p className="text-[10.5px] text-slate-400">
                    Gunakan koma atau baris baharu untuk memisahkan peringkat ijazah yang berbeza.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Bidang Pengkhususan */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      Bidang Pengkhususan / Kepakaran
                    </label>
                    <input
                      type="text"
                      value={pengkhususan}
                      onChange={(e) => setPengkhususan(e.target.value)}
                      placeholder="cth: Sains Komputer / Logistik"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                    />
                  </div>

                  {/* Daerah & Negeri Asal */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      Daerah & Negeri Asal
                    </label>
                    <input
                      type="text"
                      value={daerahAsal}
                      onChange={(e) => setDaerahAsal(e.target.value)}
                      placeholder="cth: Kota Tinggi, Johor atau Kuantan, Pahang"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 4: Maklumat Tambahan & Rekod Kenderaan Kampus */}
            <div className="glass-panel rounded-3xl p-6 sm:p-7 border border-white/70 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <Car className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    4. Maklumat Tambahan & Rekod Kenderaan Kampus
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Untuk rekod keselamatan pos kawalan dan pas pelekat kenderaan kolej
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Row 1: IC & Tahun Lahir */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-3 border-b border-slate-100">
                  {/* No. Kad Pengenalan (IC) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-extrabold text-slate-800">
                        No. Kad Pengenalan (IC)
                      </label>
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                        Akses Admin Sahaja
                      </span>
                    </div>
                    <input
                      type="text"
                      value={ic}
                      onChange={(e) => setIc(formatIC(e.target.value))}
                      onBlur={(e) => setIc(formatIC(e.target.value))}
                      placeholder="cth: 861115-46-5305"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-mono font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                    />
                  </div>

                  {/* Tahun Lahir */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      Tahun Lahir
                    </label>
                    <input
                      type="number"
                      min="1940"
                      max="2010"
                      value={tahunLahir}
                      onChange={(e) => setTahunLahir(e.target.value)}
                      placeholder="cth: 1988"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* Row 2: Plat Kenderaan */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Plat No 1 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      No. Plat Kenderaan 1 (Utama)
                    </label>
                    <input
                      type="text"
                      value={platNo1}
                      onChange={(e) => setPlatNo1(e.target.value.toUpperCase())}
                      placeholder="cth: JXA1234"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase transition-all shadow-2xs"
                    />
                  </div>

                  {/* Plat No 2 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      No. Plat Kenderaan 2
                    </label>
                    <input
                      type="text"
                      value={platNo2}
                      onChange={(e) => setPlatNo2(e.target.value.toUpperCase())}
                      placeholder="cth: VHJ4035"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase transition-all shadow-2xs"
                    />
                  </div>

                  {/* Plat No 3 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-extrabold text-slate-800">
                      No. Plat Kenderaan 3
                    </label>
                    <input
                      type="text"
                      value={platNo3}
                      onChange={(e) => setPlatNo3(e.target.value.toUpperCase())}
                      placeholder="cth: WUL3110"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 bg-white/90 text-sm font-mono font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none uppercase transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Submission Action Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 glass-panel rounded-2xl border border-white/80">
              <p className="text-[11.5px] text-slate-500">
                Dengan menekan butang hantar, maklumat akan diselaraskan ke sistem direktori rasmi KPMBP.
              </p>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onNavigateHome}
                  className="w-full sm:w-auto px-5 py-3 bg-white hover:bg-slate-50 text-slate-700 rounded-2xl text-xs font-extrabold border border-slate-200 transition-all cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || isIdTaken}
                  className={`w-full sm:w-auto px-7 py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 text-white shadow-md transition-all cursor-pointer ${
                    isSubmitting || isIdTaken
                      ? 'bg-slate-400 cursor-not-allowed opacity-70'
                      : 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 hover:from-indigo-700 hover:to-violet-700 shadow-indigo-200 active:scale-[0.99]'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan Rekod...' : 'Hantar & Daftarkan Profil Saya'}</span>
                </button>
              </div>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};

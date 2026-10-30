/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Save, Trash2, MapPin, Calendar, Car, ShieldCheck } from 'lucide-react';
import { Staff } from '../types';
import { determineBahagian } from '../utils/staffGrade';
import { findDuplicateStaff } from '../utils/staffDeduplication';
import { formatIC } from '../utils/icFormatter';

interface AddEditStaffModalProps {
  staff: Staff | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (staff: Staff) => void;
  onDelete?: (id: string) => void;
  existingStaffList?: Staff[];
}

export const AddEditStaffModal: React.FC<AddEditStaffModalProps> = ({
  staff,
  isOpen,
  onClose,
  onSave,
  onDelete,
  existingStaffList = [],
}) => {
  const [formData, setFormData] = useState<Partial<Staff>>({});

  useEffect(() => {
    if (staff) {
      setFormData({
        ...staff,
        StaffID: staff.StaffID || staff.ID || staff.staff_id || '',
        Kategori: staff.Kategori || staff.Bahagian || 'Akademik',
        Unit: staff.Unit || staff.DepartmentID || '',
        Gred: staff.Gred || staff.grade || '',
        TahunLahir: staff.TahunLahir || staff['Tahun Lahir'] || '',
        IC: staff.IC || staff.NoKP || '',
        NoKP: staff.NoKP || staff.IC || '',
        PlatNo1: staff.PlatNo1 || '',
        PlatNo2: staff.PlatNo2 || '',
        PlatNo3: staff.PlatNo3 || '',
      });
    }
  }, [staff, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staff) {
      alert('Pendaftaran staf baharu hanya boleh dibuat melalui fungsi Import CSV.');
      return;
    }
    if (!formData.Nama || !formData.Jawatan || !formData.Email) {
      alert('Sila isi maklumat wajib: Nama, Jawatan, dan Emel.');
      return;
    }

    const resolvedKategori = formData.Kategori || determineBahagian(formData.Jawatan || '', formData.Bahagian);
    const resolvedUnit = formData.Unit || formData.DepartmentID || '';
    const resolvedGred = formData.Gred || formData.grade || '';
    const resolvedTahunLahir = formData.TahunLahir || formData['Tahun Lahir'] || '';
    const resolvedId = formData.StaffID || formData.ID || staff.ID;

    // Duplicate check based on normalized name or email against other staff records
    if (existingStaffList && existingStaffList.length > 0) {
      const duplicate = findDuplicateStaff(
        { Nama: formData.Nama.trim(), Email: formData.Email.trim() },
        existingStaffList,
        resolvedId
      );

      if (duplicate) {
        const confirmMsg = `PERHATIAN DUPLIKAT:\n` +
          `Rekod staf lain dengan nama atau emel yang sepadan sudah wujud dalam sistem:\n` +
          `• Nama: ${duplicate.Nama}\n` +
          `• No. Staf: ${duplicate.StaffID || duplicate.ID}\n` +
          `• Jawatan: ${duplicate.Jawatan}\n` +
          `• Emel: ${duplicate.Email || '-'}\n\n` +
          `Adakah anda pasti mahu menyimpan rekod ini bagi staf "${resolvedId}"?`;

        if (!window.confirm(confirmMsg)) {
          return;
        }
      }
    }

    const plates = [formData.PlatNo1, formData.PlatNo2, formData.PlatNo3].filter(Boolean);

    const finalStaff: Staff = {
      ...staff,
      Bil: staff.Bil,
      StaffID: resolvedId,
      ID: resolvedId,
      staff_id: resolvedId,
      Nama: formData.Nama.trim(),
      Kategori: resolvedKategori,
      Bahagian: resolvedKategori,
      Jawatan: formData.Jawatan.trim(),
      Unit: resolvedUnit.trim(),
      DepartmentID: resolvedUnit.trim(),
      Kelulusan: (formData.Kelulusan || '').trim(),
      Pengkhususan: (formData.Pengkhususan || '').trim(),
      DaerahAsal: (formData.DaerahAsal || '').trim(),
      Telefon: (formData.Telefon || '').trim(),
      Sambungan: (formData.Sambungan || '').trim(),
      Email: (formData.Email || '').trim(),
      Gred: resolvedGred.trim(),
      grade: resolvedGred.trim(),
      'Tahun Lahir': resolvedTahunLahir.trim(),
      TahunLahir: resolvedTahunLahir.trim(),
      IC: formatIC(formData.IC || formData.NoKP || ''),
      NoKP: formatIC(formData.IC || formData.NoKP || ''),
      PlatNo1: (formData.PlatNo1 || '').trim().toUpperCase(),
      PlatNo2: (formData.PlatNo2 || '').trim().toUpperCase(),
      PlatNo3: (formData.PlatNo3 || '').trim().toUpperCase(),
      NoPlat: plates.join(', '),
    };

    onSave(finalStaff);
    onClose();
  };

  if (!isOpen || !staff) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative glass-modal rounded-[32px] max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl z-50 flex flex-col border border-white/55"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/30 flex items-center justify-between">
            <div>
              <h3 className="font-sans font-extrabold text-gray-900 text-lg leading-tight">
                Kemas Kini Maklumat Staf
              </h3>
              <p className="text-xs text-gray-500">
                17 lajur standard rekod rasmi KPMBP (Import/Eksport CSV Standard)
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/40 rounded-full text-gray-400 hover:text-gray-700 transition-colors border border-transparent hover:border-white/20"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-left">
            {/* Grid 1: StaffID, Kategori, Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">StaffID</label>
                <input
                  type="text"
                  name="StaffID"
                  value={formData.StaffID || formData.ID || ''}
                  className="w-full px-3 py-2 text-xs border border-white/30 rounded-xl bg-white/20 text-gray-500 font-mono cursor-not-allowed"
                  disabled
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Kategori</label>
                <select
                  name="Kategori"
                  value={formData.Kategori || formData.Bahagian || 'Akademik'}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs border border-white/40 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                >
                  <option value="Pengurusan">Pengurusan</option>
                  <option value="Akademik">Akademik</option>
                  <option value="Sokongan Akademik">Sokongan Akademik</option>
                  <option value="Pentadbiran">Pentadbiran</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Unit / Jabatan</label>
                <input
                  type="text"
                  name="Unit"
                  placeholder="cth: Sains Kuantitatif / JTM"
                  value={formData.Unit || formData.DepartmentID || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 text-xs border border-white/40 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
            </div>

            {/* Nama */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Nama Penuh <span className="text-red-500">*</span></label>
              <input
                type="text"
                name="Nama"
                required
                placeholder="cth: Tuan Haji Ahmad Safuan bin Mohamed"
                value={formData.Nama || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            {/* Jawatan & Gred */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Jawatan <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="Jawatan"
                  required
                  placeholder="cth: Pensyarah Kanan Sains Pengurusan"
                  value={formData.Jawatan || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Gred</label>
                <input
                  type="text"
                  name="Gred"
                  placeholder="cth: DG13, DG12, DG10, N2"
                  value={formData.Gred || formData.grade || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15 uppercase font-mono"
                />
              </div>
            </div>

            {/* Telefon, Sambungan, Email */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Telefon</label>
                <input
                  type="text"
                  name="Telefon"
                  placeholder="07-8842222"
                  value={formData.Telefon || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Sambungan</label>
                <input
                  type="text"
                  name="Sambungan"
                  placeholder="cth: 101"
                  value={formData.Sambungan || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  name="Email"
                  required
                  placeholder="cth: safuan.mohamed@mara.gov.my"
                  value={formData.Email || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
            </div>

            {/* No. Kad Pengenalan (IC), DaerahAsal & Tahun Lahir */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-indigo-500" /> No. KP / IC
                </label>
                <input
                  type="text"
                  name="IC"
                  placeholder="cth: 861115-46-5305"
                  value={formData.IC || formData.NoKP || ''}
                  onChange={(e) => {
                    const formatted = formatIC(e.target.value);
                    setFormData((prev) => ({ ...prev, IC: formatted, NoKP: formatted }));
                  }}
                  onBlur={(e) => {
                    const formatted = formatIC(e.target.value);
                    setFormData((prev) => ({ ...prev, IC: formatted, NoKP: formatted }));
                  }}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-bold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-indigo-500" /> DaerahAsal
                </label>
                <input
                  type="text"
                  name="DaerahAsal"
                  placeholder="cth: Kota Tinggi, Johor"
                  value={formData.DaerahAsal || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-500" /> Tahun Lahir
                </label>
                <input
                  type="text"
                  name="TahunLahir"
                  placeholder="cth: 1980"
                  value={formData.TahunLahir || formData['Tahun Lahir'] || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFormData(prev => ({ ...prev, TahunLahir: val, 'Tahun Lahir': val }));
                  }}
                  className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15 font-mono"
                />
              </div>
            </div>

            {/* PlatNo1, PlatNo2, PlatNo3 */}
            <div className="space-y-1 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-100">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Car className="w-3.5 h-3.5 text-indigo-600" /> Plat Kenderaan (PlatNo1, PlatNo2, PlatNo3)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block mb-0.5">PlatNo1</span>
                  <input
                    type="text"
                    name="PlatNo1"
                    placeholder="cth: JRA 1234"
                    value={formData.PlatNo1 || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-gray-800 font-bold uppercase font-mono"
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block mb-0.5">PlatNo2</span>
                  <input
                    type="text"
                    name="PlatNo2"
                    placeholder="cth: W 9876 X"
                    value={formData.PlatNo2 || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-gray-800 font-bold uppercase font-mono"
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-gray-500 block mb-0.5">PlatNo3</span>
                  <input
                    type="text"
                    name="PlatNo3"
                    placeholder="cth: VAA 555"
                    value={formData.PlatNo3 || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white text-gray-800 font-bold uppercase font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Kelulusan */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Kelulusan</label>
              <textarea
                name="Kelulusan"
                rows={2}
                placeholder="cth: Sarjana Muda Sains Komputer (UTM), Sarjana Teknologi Maklumat (UKM)"
                value={formData.Kelulusan || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            {/* Pengkhususan */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-wider">Pengkhususan</label>
              <textarea
                name="Pengkhususan"
                rows={2}
                placeholder="cth: Pembangunan Web, Kecerdasan Buatan, Keselamatan Siber"
                value={formData.Pengkhususan || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 text-xs border border-white/50 rounded-xl bg-white/40 text-gray-800 font-semibold focus:outline-none focus:bg-white/80 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          </form>

          {/* Footer Actions */}
          <div className="p-6 border-t border-white/30 bg-white/25 flex items-center justify-between backdrop-blur-md">
            {staff && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (confirm('Adakah anda pasti mahu memadam rekod staf ini?')) {
                    onDelete(staff.ID);
                    onClose();
                  }
                }}
                className="py-2.5 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Padam Rekod
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-white/40 hover:bg-white/70 border border-white/60 text-gray-700 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-100 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" /> Simpan
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

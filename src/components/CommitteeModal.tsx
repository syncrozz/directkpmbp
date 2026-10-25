/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Award, CheckCircle2, Users, Building2 } from 'lucide-react';
import { Staff, StaffCommittee } from '../types';
import { getBahagianTheme } from '../utils/bahagianColors';
import { sortCommitteesBySeniority } from '../utils/committeeService';
import { StaffAvatar } from './StaffAvatar';

interface CommitteeModalProps {
  staff: Staff | null;
  committees: StaffCommittee[];
  onClose: () => void;
}

export const CommitteeModal: React.FC<CommitteeModalProps> = ({ staff, committees, onClose }) => {
  if (!staff) return null;

  const theme = getBahagianTheme(staff.Bahagian);

  // Filter committees for this staff member by ID or Name matching
  const staffIdClean = (staff.ID || staff.staff_id || '').toUpperCase().trim();
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

  const getRoleBadgeStyle = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r.includes('pengerusi') && !r.includes('timbalan')) {
      return 'bg-amber-100 text-amber-800 border-amber-300 ring-1 ring-amber-400/30';
    }
    if (r.includes('timbalan pengerusi') || r.includes('naib')) {
      return 'bg-sky-100 text-sky-800 border-sky-300 ring-1 ring-sky-400/30';
    }
    if (r.includes('setiausaha') || r.includes('bendahari')) {
      return 'bg-purple-100 text-purple-800 border-purple-300 ring-1 ring-purple-400/30';
    }
    if (r.includes('penyelaras') || r.includes(' ketua')) {
      return 'bg-indigo-100 text-indigo-800 border-indigo-300 ring-1 ring-indigo-400/30';
    }
    return 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-1 ring-emerald-400/30';
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-md"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: 20 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="relative glass-modal rounded-[32px] max-w-xl w-full overflow-hidden shadow-2xl z-50 border border-white/60 my-auto bg-white/95"
        >
          {/* Top Banner Header */}
          <div className={`p-6 ${theme.banner} bg-opacity-95 text-white relative`}>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/35 text-white rounded-full p-2 backdrop-blur-sm transition-all focus:outline-none border border-white/20 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-4">
              <StaffAvatar
                staff={staff}
                sizeClassName="w-16 h-16"
                textSizeClassName="text-xl"
                avatarBgClassName={theme.avatarBg}
                ringClassName="ring-2 ring-white/80 shadow-md"
              />
              <div className="space-y-1 pr-6">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-white/20 text-white border border-white/30 backdrop-blur-sm">
                    {staff.ID}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-400 text-amber-950 shadow-2xs">
                    {matchedCommittees.length} Jawatankuasa
                  </span>
                </div>
                <h3 className="text-lg font-black tracking-tight leading-snug line-clamp-1">
                  {staff.Nama}
                </h3>
                <p className="text-xs text-white/80 font-medium line-clamp-1">
                  {staff.Jawatan} • {staff.DepartmentID}
                </p>
              </div>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 text-slate-800">
                <Award className="w-5 h-5 text-indigo-600" />
                <h4 className="font-extrabold text-sm tracking-tight">
                  Senarai Jawatankuasa & Peranan
                </h4>
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                Pangkalan Data Jawatankuasa KPMBP
              </span>
            </div>

            {matchedCommittees.length === 0 ? (
              <div className="p-8 text-center bg-slate-50/80 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Users className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">
                  Tiada maklumat jawatankuasa direkodkan untuk staf ini.
                </p>
                <p className="text-[11px] text-slate-400">
                  Maklumat dikemaskini melalui Import CSV Jawatankuasa
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {matchedCommittees.map((item, index) => (
                  <motion.div
                    key={item.id || index}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-4 bg-slate-50 hover:bg-indigo-50/40 rounded-2xl border border-slate-200/80 hover:border-indigo-200 transition-all shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg text-[10.5px] font-black border uppercase ${getRoleBadgeStyle(
                              item.peranan
                            )}`}
                          >
                            {item.peranan}
                          </span>
                          {item.peringkat && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white text-slate-600 border border-slate-200 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              {item.peringkat}
                            </span>
                          )}
                        </div>

                        <h5 className="font-extrabold text-slate-900 text-sm leading-snug pt-1">
                          {item.jawatankuasa}
                        </h5>
                      </div>
                    </div>

                    {item.catatan && (
                      <div className="pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-xs text-slate-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{item.catatan}</span>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-500 font-medium">
              Sistem Maklumat Staf KPMBP
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

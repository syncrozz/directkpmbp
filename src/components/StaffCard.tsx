/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Staff } from '../types';
import { getGredBadgeStyle } from '../utils/gredColors';
import { getBahagianTheme } from '../utils/bahagianColors';
import { getStaffGrade } from '../utils/staffGrade';
import { StaffAvatar } from './StaffAvatar';

interface StaffCardProps {
  staff: Staff;
  onClick: (staff: Staff) => void;
  isAdminMode?: boolean;
  onEdit?: (staff: Staff) => void;
  onOpenCommittee?: (staff: Staff) => void;
}

export const StaffCard: React.FC<StaffCardProps> = ({ staff, onClick, isAdminMode, onEdit, onOpenCommittee }) => {
  const theme = getBahagianTheme(staff.Bahagian);

  // Get initials for avatar
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
  const gred = getStaffGrade(staff);

  return (
    <div
      id={`staff-card-${staff.ID}`}
      onClick={() => onClick(staff)}
      className={`group relative flex flex-col justify-between p-5 md:p-6 glass-card rounded-[26px] cursor-pointer border border-white/70 shadow-xs hover:shadow-xl transition-all duration-300 ${theme.bg}`}
    >
      <div>
        {/* Top Header Row: Badges & Chevron */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`px-2.5 py-0.5 text-[10px] font-black tracking-wider rounded-lg border uppercase shadow-2xs ${theme.badge}`}>
              {staff.DepartmentID}
            </span>
            <span className="text-[10px] font-bold text-slate-500 bg-white/70 px-2 py-0.5 rounded-lg border border-slate-100">
              {staff.Bahagian}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        {/* Profile Info Row: Round WhatsApp Style Profile Photo at Top-Left */}
        <div className="flex items-start gap-3.5 text-left">
          {/* Round WhatsApp Profile Picture Avatar */}
          <div className="relative shrink-0">
            <StaffAvatar
              staff={staff}
              avatarBgClassName={theme.avatarBg}
              ringClassName={theme.ring}
            />
          </div>

          {/* Name & Jawatan */}
          <div className="flex-1 min-w-0 pt-0.5 space-y-1">
            <h3 className="font-sans font-bold text-slate-900 text-sm md:text-[15px] group-hover:text-indigo-600 transition-colors leading-snug tracking-tight line-clamp-2 uppercase">
              {staff.Nama}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className={`inline-flex items-center px-1.5 py-0.5 text-[9.5px] font-black rounded-md tracking-wide shrink-0 uppercase ${getGredBadgeStyle(gred)}`}>
                {gred}
              </span>
              <p className="text-[11px] text-indigo-900/70 font-semibold leading-tight line-clamp-1">
                {staff.Jawatan}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

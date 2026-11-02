/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Staff } from '../types';
import { 
  getStaffImageUrl, 
  getInitials, 
  formatStaffId,
  isStaffImageFailed,
  markStaffImageFailed
} from '../utils/staffPhoto';

interface StaffAvatarProps {
  staff: Staff;
  sizeClassName?: string;
  avatarBgClassName?: string;
  ringClassName?: string;
  showOnlineStatus?: boolean;
  textSizeClassName?: string;
}

export const StaffAvatar: React.FC<StaffAvatarProps> = ({
  staff,
  sizeClassName = 'w-14 h-14 md:w-16 md:h-16',
  avatarBgClassName = 'bg-gradient-to-tr from-indigo-500 via-indigo-600 to-indigo-700 text-white',
  ringClassName = 'ring-2 ring-indigo-500/30',
  showOnlineStatus = false,
  textSizeClassName = 'text-base md:text-lg',
}) => {
  const rawId = staff?.staff_id || staff?.ID || staff?.StaffID || '';
  const staffId = formatStaffId(rawId);
  const primaryUrl = getStaffImageUrl(staffId);

  const [hasError, setHasError] = useState<boolean>(() => {
    return !primaryUrl || isStaffImageFailed(primaryUrl);
  });

  useEffect(() => {
    if (!primaryUrl || isStaffImageFailed(primaryUrl)) {
      setHasError(true);
    } else {
      setHasError(false);
    }
  }, [primaryUrl]);

  const handleImageError = () => {
    if (primaryUrl) {
      markStaffImageFailed(primaryUrl);
    }
    setHasError(true);
  };

  const initials = getInitials(staff?.Nama || '');

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClassName} rounded-full overflow-hidden flex items-center justify-center font-black ${textSizeClassName} border-2 border-white shadow-md ${avatarBgClassName} ${ringClassName} transition-transform duration-200 group-hover:scale-105`}
      >
        {!hasError && primaryUrl ? (
          <img
            src={primaryUrl}
            alt={staff?.Nama || `Gambar Staf ${staffId}`}
            referrerPolicy="no-referrer"
            onError={handleImageError}
            loading="lazy"
            className="w-full h-full object-cover rounded-full transition-opacity"
          />
        ) : (
          <span className="select-none tracking-wider">{initials}</span>
        )}
      </div>

      {showOnlineStatus && (
        <span
          className="absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white bg-slate-400"
        />
      )}
    </div>
  );
};

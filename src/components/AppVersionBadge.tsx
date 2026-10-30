import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { subscribeToAppVersion, saveAppVersionToCloud } from '../config/firebase';

export const DEFAULT_APP_VERSION = 'v30.10.0900';

interface AppVersionBadgeProps {
  isAdminMode: boolean;
}

/**
 * Generate current timestamp version in Asia/Kuala_Lumpur timezone.
 * Format: v{DD}.{MM}.{HHmm} (24-hour clock, '24' converted to '00').
 * Only called on admin action ("Guna masa sekarang"), never for normal display.
 */
function getKualaLumpurTimeVersion(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kuala_Lumpur',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  let hh = parts.find((p) => p.type === 'hour')?.value || '00';
  if (hh === '24') hh = '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';
  return `v${d}.${m}.${hh}${mm}`;
}

export const AppVersionBadge: React.FC<AppVersionBadgeProps> = ({ isAdminMode }) => {
  const [cloudVersion, setCloudVersion] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to Firestore system/appVersion
  useEffect(() => {
    const unsubscribe = subscribeToAppVersion((label) => {
      setCloudVersion(label);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Cancel edit mode if admin mode is disabled
  useEffect(() => {
    if (!isAdminMode) {
      setIsEditing(false);
      setError(null);
    }
  }, [isAdminMode]);

  // Focus input upon entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const displayVersion = cloudVersion || DEFAULT_APP_VERSION;

  const handleStartEdit = () => {
    if (!isAdminMode) return;
    setInputValue(displayVersion);
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
  };

  const handleNowClick = () => {
    setInputValue(getKualaLumpurTimeVersion());
    setError(null);
  };

  const handleSave = async () => {
    let sanitized = inputValue.trim();
    if (!sanitized) {
      setError('Sila masukkan label versi');
      return;
    }

    // Auto prepend 'v' if missing
    if (!sanitized.startsWith('v') && !sanitized.startsWith('V')) {
      sanitized = 'v' + sanitized;
    } else {
      sanitized = 'v' + sanitized.slice(1).trim();
    }

    const versionRegex = /^v\d{2}\.\d{2}\.\d{4}$/;
    if (!versionRegex.test(sanitized)) {
      setError('Format mesti vDD.MM.HHmm (cth: v30.10.0855)');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await saveAppVersionToCloud(sanitized);
      setIsEditing(false);
    } catch (err) {
      console.error('Ralat menyimpan versi:', err);
      setError('Gagal menyimpan versi ke Cloud. Sila cuba lagi.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing && isAdminMode) {
    return (
      <div 
        className="inline-flex flex-col items-start gap-1 py-0.5 z-50 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inline-flex items-center gap-1 sm:gap-1.5 flex-wrap">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            disabled={isSaving}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancel();
              }
            }}
            placeholder="v30.10.0900"
            className="font-mono text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-md border border-slate-300 bg-white text-slate-800 w-24 sm:w-28 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs disabled:opacity-50"
          />
          <button
            type="button"
            disabled={isSaving}
            onClick={handleNowClick}
            title="Guna tarikh & masa terkini (Asia/Kuala_Lumpur)"
            className="text-[9px] sm:text-[10px] text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 px-1.5 py-0.5 rounded font-sans font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            Guna masa sekarang
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            title="Simpan versi"
            className="p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
            title="Batal"
            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
        {error && (
          <span className="text-[10px] text-rose-500 font-medium font-sans">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div 
      className="inline-flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-slate-100/90 hover:bg-slate-200/80 border border-slate-200/80 text-slate-600 shadow-2xs transition-all select-none shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[9.5px] sm:text-[11px] font-mono font-bold tracking-tight text-slate-600">
        {displayVersion}
      </span>
      {isAdminMode && (
        <button
          type="button"
          onClick={handleStartEdit}
          title="Sunting versi"
          className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 rounded cursor-pointer"
        >
          <Pencil className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
        </button>
      )}
    </div>
  );
};

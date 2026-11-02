/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  X,
  Download,
  Share2,
  Maximize2,
  RotateCw,
  Calendar,
  Sparkles,
  Check,
  ExternalLink,
  BookOpen,
  Layers,
  AlertCircle,
  Eye,
  Info,
  User,
  GraduationCap,
  Building,
  CheckCircle2,
  ChevronRight,
  RotateCcw
} from 'lucide-react';
import { Staff } from '../types';
import { 
  fetchAvailableTimetableIds, 
  getLecturerTimetableUrl,
  FALLBACK_LECTURER_TIMETABLE_IDS
} from '../services/lecturerTimetableService';
import { StaffAvatar } from './StaffAvatar';
import { getShortName } from '../utils/shortName';

interface LecturerTimetableHubProps {
  staffList: Staff[];
  onSelectProfile?: (staff: Staff) => void;
  initialStaffId?: string;
}

export const LecturerTimetableHub: React.FC<LecturerTimetableHubProps> = ({
  staffList,
  onSelectProfile,
  initialStaffId,
}) => {
  const [availableIds, setAvailableIds] = useState<Set<string>>(
    () => new Set(FALLBACK_LECTURER_TIMETABLE_IDS)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('Semua');
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(true);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Image Loading & Viewer States
  const [loadedStaffId, setLoadedStaffId] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load available timetable IDs from GitHub
  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await fetchAvailableTimetableIds(forceRefresh);
      setAvailableIds(res.ids);
      if (res.lastUpdated) {
        setLastUpdated(res.lastUpdated);
      }
    } catch (err) {
      console.warn('[LecturerTimetableHub] Load error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter staff: academic staff or staff having timetables
  const academicStaffList = useMemo(() => {
    return staffList.filter((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      const isAcademic = s.Bahagian === 'Akademik';
      const hasTimetable = availableIds.has(id);
      return isAcademic || hasTimetable;
    });
  }, [staffList, availableIds]);

  // Set default selected staff
  useEffect(() => {
    if (academicStaffList.length === 0) return;

    if (initialStaffId) {
      const found = academicStaffList.find((s) => {
        const id = (s.ID || s.staff_id || '').toUpperCase().trim();
        return id === initialStaffId.toUpperCase().trim();
      });
      if (found) {
        setSelectedStaff(found);
        return;
      }
    }

    // Default to first lecturer that has a timetable
    if (!selectedStaff) {
      const firstAvailable = academicStaffList.find((s) => {
        const id = (s.ID || s.staff_id || '').toUpperCase().trim();
        return availableIds.has(id);
      });
      setSelectedStaff(firstAvailable || academicStaffList[0]);
    }
  }, [academicStaffList, initialStaffId, availableIds]);

  // Available departments for filter pills
  const departments = useMemo(() => {
    const set = new Set<string>();
    academicStaffList.forEach((s) => {
      const d = s.DepartmentID || s.Unit;
      if (d && d.trim() && d !== 'Pentadbiran' && d !== 'Pengurusan') {
        set.add(d.trim());
      }
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [academicStaffList]);

  // Filtered staff records
  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const qNoSpace = q.replace(/\s+/g, '');

    return academicStaffList.filter((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      const hasTimetable = availableIds.has(id);

      // Filter: only with available timetable
      if (onlyAvailable && !hasTimetable) {
        return false;
      }

      // Filter: department
      if (selectedDept !== 'Semua') {
        const d = (s.DepartmentID || s.Unit || '').trim();
        if (d !== selectedDept) return false;
      }

      // Filter: search query
      if (q) {
        const name = (s.Nama || '').toLowerCase();
        const jawatan = (s.Jawatan || '').toLowerCase();
        const dept = (s.DepartmentID || s.Unit || '').toLowerCase();
        const matches =
          name.includes(q) ||
          name.replace(/\s+/g, '').includes(qNoSpace) ||
          id.toLowerCase().includes(q) ||
          jawatan.includes(q) ||
          dept.includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [academicStaffList, searchQuery, selectedDept, onlyAvailable, availableIds]);

  // Handle staff selection
  const handleSelectLecturer = (staff: Staff) => {
    setSelectedStaff(staff);
    setImageError(false);
    setRotation(0);
    // Smooth scroll to viewer on mobile screens
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const viewerElem = document.getElementById('lecturer-timetable-viewer-section');
      if (viewerElem) {
        viewerElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Current selected lecturer details
  const currentStaffId = (selectedStaff?.ID || selectedStaff?.staff_id || '').toUpperCase().trim();
  const currentTimetableUrl = currentStaffId ? getLecturerTimetableUrl(currentStaffId) : '';
  const currentHasTimetable = availableIds.has(currentStaffId);
  const isImageLoading = currentStaffId ? loadedStaffId !== currentStaffId : false;

  // Handle download
  const handleDownload = async () => {
    if (!currentTimetableUrl) return;
    try {
      setDownloading(true);
      const res = await fetch(currentTimetableUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Jadual_${currentStaffId}_${(selectedStaff?.Nama || 'Pensyarah').replace(/\s+/g, '_')}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn('Gagal memuat turun jadual:', err);
      window.open(currentTimetableUrl, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  // Handle share / copy link
  const handleShare = async () => {
    if (!currentTimetableUrl || !selectedStaff) return;
    const shareText = `Jadual Waktu Pensyarah: ${selectedStaff.Nama} (${currentStaffId}) - Kolej Profesional MARA Bandar Penawar`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Jadual Waktu ${selectedStaff.Nama}`,
          text: shareText,
          url: currentTimetableUrl,
        });
        return;
      } catch (_e) {}
    }
    try {
      await navigator.clipboard.writeText(currentTimetableUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch (err) {
      console.warn('Gagal menyalin pautan:', err);
    }
  };

  // Count of available timetables
  const totalAvailableCount = useMemo(() => {
    return academicStaffList.filter((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      return availableIds.has(id);
    }).length;
  }, [academicStaffList, availableIds]);

  return (
    <div className="space-y-6 text-left">
      {/* Dynamic Header & Control Bar */}
      <div className="glass-panel rounded-3xl p-4 md:p-5 border border-white/60 shadow-xs space-y-3.5 sticky top-2 z-20 backdrop-blur-md bg-white/95 transition-all">
        {/* Row 1: Search Box & Global Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama pensyarah, no. staf, atau jabatan..."
              className="w-full pl-9 sm:pl-10 pr-9 py-2 sm:py-2.5 md:py-3 bg-slate-50 hover:bg-slate-50/80 border border-slate-200/90 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 bg-slate-200/60 hover:bg-slate-200 rounded-full cursor-pointer transition-colors"
                title="Padam carian"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Filter Toggle: Jadual Tersedia */}
            <button
              type="button"
              onClick={() => setOnlyAvailable(!onlyAvailable)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border shadow-2xs ${
                onlyAvailable
                  ? 'bg-rose-50 text-rose-800 border-rose-300/80'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200/80'
              }`}
              title="Tapis hanya pensyarah yang mempunyai fail jadual"
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${onlyAvailable ? 'text-rose-600' : 'text-slate-400'}`} />
              <span className="hidden xs:inline">Jadual Tersedia</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${onlyAvailable ? 'bg-rose-200/80 text-rose-900' : 'bg-slate-100 text-slate-600'}`}>
                {totalAvailableCount}
              </span>
            </button>

            {/* Refresh from GitHub */}
            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              title="Segerakkan semula jadual daripada arkib GitHub"
              className="p-2 sm:p-2.5 bg-slate-100/80 hover:bg-white text-slate-600 hover:text-rose-600 border border-slate-200/80 rounded-xl shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center shrink-0"
            >
              <RotateCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isRefreshing ? 'animate-spin text-rose-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Row 2: Department Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none -mx-1 px-1">
          {departments.map((dept) => {
            const isSelected = selectedDept === dept;
            const count = dept === 'Semua' 
              ? academicStaffList.length 
              : academicStaffList.filter(s => (s.DepartmentID || s.Unit || '').trim() === dept).length;

            return (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1 sm:gap-1.5 ${
                  isSelected
                    ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-xs shadow-rose-200'
                    : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                }`}
              >
                <span>{dept}</span>
                <span
                  className={`text-[9.5px] sm:text-[10px] px-1.5 py-0.2 rounded-md ${
                    isSelected ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Grid: Lecturer Selector (Left 5 cols) + Timetable Viewer (Right 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Lecturer Picker List (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass-panel rounded-3xl p-4 md:p-5 border border-white/60 shadow-xs space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Senarai Pensyarah ({filteredStaff.length})
              </span>
              {selectedStaff && (
                <span className="text-xs font-medium text-rose-600">
                  Dipilih: <span className="font-extrabold">{currentStaffId}</span>
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-rose-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Menghubungkan ke arkib jadual pensyarah...</p>
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-3 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">Tiada Pensyarah Ditemui</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Tiada pensyarah sepadan dengan carian <span className="font-bold text-rose-600">"{searchQuery}"</span>.
                  </p>
                </div>
                {(searchQuery || selectedDept !== 'Semua' || onlyAvailable) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedDept('Semua');
                      setOnlyAvailable(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset Carian
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
                {filteredStaff.map((staff) => {
                  const id = (staff.ID || staff.staff_id || '').toUpperCase().trim();
                  const isSelected = selectedStaff && (selectedStaff.ID || selectedStaff.staff_id || '').toUpperCase().trim() === id;
                  const hasTimetable = availableIds.has(id);

                  return (
                    <button
                      key={id || staff.Nama}
                      type="button"
                      onClick={() => handleSelectLecturer(staff)}
                      className={`w-full p-3 rounded-2xl text-left transition-all border flex items-center gap-3 cursor-pointer group ${
                        isSelected
                          ? 'bg-gradient-to-r from-rose-500 to-pink-600 text-white border-transparent shadow-md shadow-rose-200 ring-2 ring-rose-400/50'
                          : 'bg-white hover:bg-rose-50/50 border-slate-200/80 hover:border-rose-300 text-slate-800 shadow-2xs'
                      }`}
                    >
                      {/* Avatar */}
                      <div className="shrink-0">
                        <StaffAvatar staff={staff} sizeClassName="w-10 h-10 rounded-xl" textSizeClassName="text-xs" ringClassName="ring-1 ring-rose-200" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className={`font-mono text-[11px] font-black px-1.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {id}
                          </span>

                          {hasTimetable ? (
                            <span
                              title="Jadual Waktu Tersedia"
                              className={`inline-flex items-center justify-center p-1 rounded-md ${
                                isSelected ? 'bg-emerald-400/30 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            </span>
                          ) : (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                              isSelected ? 'text-white/60' : 'text-slate-400'
                            }`}>
                              Belum ada
                            </span>
                          )}
                        </div>

                        <h4 className={`text-xs font-extrabold truncate leading-tight ${
                          isSelected ? 'text-white' : 'text-slate-900 group-hover:text-rose-700'
                        }`}>
                          {getShortName(staff.Nama)}
                        </h4>

                        <p className={`text-[11px] truncate ${
                          isSelected ? 'text-rose-100' : 'text-slate-500'
                        }`}>
                          {staff.DepartmentID || staff.Unit || staff.Jawatan || 'Akademik'}
                        </p>
                      </div>

                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${
                        isSelected ? 'text-white translate-x-0.5' : 'text-slate-300 group-hover:text-rose-500 group-hover:translate-x-0.5'
                      }`} />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Source of truth footer note */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                Arkib: syncrozz/syncrozz-assets (TimeTable)
              </span>
              {lastUpdated && <span>Kemas kini: {lastUpdated}</span>}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Timetable Viewer (7 cols) */}
        <div id="lecturer-timetable-viewer-section" className="lg:col-span-7 space-y-4">
          {selectedStaff ? (
            <div className="glass-panel rounded-3xl p-4 md:p-6 border border-white/60 shadow-xs space-y-4 bg-white/95">
              {/* Viewer Header */}
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="shrink-0">
                    <StaffAvatar staff={selectedStaff} sizeClassName="w-12 h-12 rounded-2xl" textSizeClassName="text-sm" ringClassName="ring-2 ring-rose-400/40" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3
                        title={selectedStaff.Nama}
                        className="text-base sm:text-lg font-black text-slate-900 tracking-tight"
                      >
                        {getShortName(selectedStaff.Nama)}
                      </h3>
                      <span className="px-2 py-0.5 rounded-md font-mono text-xs font-black bg-rose-100 text-rose-800 border border-rose-200/80">
                        {currentStaffId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium">
                      {selectedStaff.Jawatan} • <span className="font-semibold text-slate-700">{selectedStaff.DepartmentID || selectedStaff.Unit}</span>
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* View Full Profile Modal */}
                  {onSelectProfile && (
                    <button
                      type="button"
                      onClick={() => onSelectProfile(selectedStaff)}
                      title="Lihat profil lengkap pensyarah dalam direktori"
                      className="px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <User className="w-3.5 h-3.5 text-slate-600" />
                      <span className="hidden sm:inline">Profil</span>
                    </button>
                  )}

                  {currentHasTimetable && !imageError && (
                    <>
                      {/* Share / Copy Link */}
                      <button
                        type="button"
                        onClick={handleShare}
                        title="Salin pautan jadual"
                        aria-label="Salin pautan jadual"
                        className="p-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center"
                      >
                        {copiedLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                      </button>

                      {/* Fullscreen Button */}
                      <button
                        type="button"
                        onClick={() => setIsFullscreenOpen(true)}
                        title="Buka paparan skrin penuh"
                        aria-label="Buka paparan skrin penuh"
                        className="p-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer flex items-center justify-center"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>

                      {/* Download Button */}
                      <button
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading}
                        title="Muat turun imej resolusi asal"
                        aria-label="Muat turun imej resolusi asal"
                        className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-xs shadow-rose-200 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
                      >
                        <Download className={`w-4 h-4 ${downloading ? 'animate-bounce' : ''}`} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Viewer Canvas */}
              <div className="relative min-h-[380px] bg-slate-100/70 rounded-2xl border border-slate-200/80 overflow-hidden flex items-center justify-center p-2 sm:p-4">
                {currentHasTimetable && !imageError ? (
                  <div className="relative w-full flex items-center justify-center">
                    {isImageLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/90 z-10 gap-2">
                        <div className="w-7 h-7 border-3 border-rose-600 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold text-slate-500">Memuatkan jadual {currentStaffId}...</span>
                      </div>
                    )}

                    <img
                      src={currentTimetableUrl}
                      alt={`Jadual Waktu ${selectedStaff.Nama} (${currentStaffId})`}
                      onLoad={() => setLoadedStaffId(currentStaffId)}
                      onError={() => setImageError(true)}
                      className={`w-full max-h-[620px] object-contain rounded-xl shadow-xs transition-transform duration-300 ${
                        isImageLoading ? 'opacity-0' : 'opacity-100'
                      }`}
                      style={{ transform: `rotate(${rotation}deg)` }}
                    />
                  </div>
                ) : (
                  /* Fallback when timetable is not available */
                  <div className="py-14 px-6 text-center space-y-3 max-w-md mx-auto">
                    <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-extrabold text-slate-800">
                        Jadual Waktu Belum Tersedia
                      </h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Fail jadual waktu rasmi untuk <span className="font-semibold text-slate-700">{selectedStaff.Nama}</span> (<span className="font-mono font-bold text-rose-600">{currentStaffId}</span>) belum dimuat naik ke arkib pusat.
                      </p>
                    </div>

                    {onSelectProfile && (
                      <button
                        type="button"
                        onClick={() => onSelectProfile(selectedStaff)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Buka Maklumat Profil Staf</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Viewer Footer Tips & Info */}
              {currentHasTimetable && !imageError && (
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500 flex-wrap pt-1">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Format rasmi JPEG beresolusi tinggi daripada Unit Jadual Waktu KPMBP.</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                      title="Putar imej 90 darjah"
                    >
                      <RotateCw className="w-3 h-3" />
                      <span>Putar {rotation}°</span>
                    </button>

                    <a
                      href={currentTimetableUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors flex items-center gap-1"
                      title="Buka fail imej dalam tab baharu"
                    >
                      <span>Tab Baharu</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center text-slate-400 space-y-2 border border-white/60">
              <Calendar className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-xs font-bold">Pilih seorang pensyarah dari senarai untuk melihat jadual waktu.</p>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreenOpen && selectedStaff && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-2 sm:p-4"
          onClick={() => setIsFullscreenOpen(false)}
        >
          {/* Top Bar */}
          <div
            className="w-full max-w-5xl flex items-center justify-between pb-3 text-white px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-black bg-rose-600 px-2 py-0.5 rounded-md">
                {currentStaffId}
              </span>
              <span
                title={selectedStaff.Nama}
                className="text-sm font-bold truncate max-w-xs sm:max-w-md"
              >
                {getShortName(selectedStaff.Nama)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Putar imej 90°"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="p-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                title="Muat turun imej"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Tutup (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Image Container */}
          <div
            className="flex-1 w-full max-w-5xl flex items-center justify-center overflow-auto p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentTimetableUrl}
              alt={`Jadual Penuh ${selectedStaff.Nama}`}
              className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-2xl transition-transform duration-300"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

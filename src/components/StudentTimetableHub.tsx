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
  Info
} from 'lucide-react';
import { StudentTimetable } from '../types';
import { 
  fetchStudentTimetables, 
  searchTimetables, 
  extractProgram 
} from '../services/timetableService';

interface StudentTimetableHubProps {
  initialClassCode?: string;
}

export const StudentTimetableHub: React.FC<StudentTimetableHubProps> = ({ initialClassCode }) => {
  const [timetables, setTimetables] = useState<StudentTimetable[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState(initialClassCode || '');
  const [selectedProgram, setSelectedProgram] = useState<string>('Semua');
  const [selectedTimetable, setSelectedTimetable] = useState<StudentTimetable | null>(null);

  // Image Loading & Viewer States
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Search input ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load timetables on mount
  const loadData = async (forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const res = await fetchStudentTimetables(forceRefresh);
      setTimetables(res.data);
      setIsFromCache(res.fromCache);
      if (res.lastUpdated) {
        setLastUpdated(res.lastUpdated);
      }

      // If initial class code is provided or none selected yet
      if (initialClassCode) {
        const found = res.data.find(
          (t) => t.classCode.toLowerCase() === initialClassCode.toLowerCase().trim()
        );
        if (found) {
          setSelectedTimetable(found);
        } else if (res.data.length > 0) {
          setSelectedTimetable(res.data[0]);
        }
      } else if (!selectedTimetable && res.data.length > 0) {
        setSelectedTimetable(res.data[0]);
      }
    } catch (err: any) {
      console.error('[StudentTimetableHub] Load error:', err);
      setError('Tidak dapat memuatkan senarai jadual kelas. Sila cuba lagi.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Update selected timetable if initialClassCode changes
  useEffect(() => {
    if (initialClassCode && timetables.length > 0) {
      const found = timetables.find(
        (t) => t.classCode.toLowerCase() === initialClassCode.toLowerCase().trim()
      );
      if (found) {
        setSelectedTimetable(found);
        setSearchQuery(found.classCode);
      }
    }
  }, [initialClassCode, timetables]);

  // Reset image states when selected timetable changes
  useEffect(() => {
    if (selectedTimetable) {
      setIsImageLoading(true);
      setImageError(false);
    }
  }, [selectedTimetable?.classCode]);

  // Keyboard shortcut: Escape closes fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenOpen) {
        setIsFullscreenOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenOpen]);

  // Distinct programs for quick filter
  const programs = useMemo(() => {
    const set = new Set<string>();
    timetables.forEach((t) => {
      if (t.program) set.add(t.program);
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [timetables]);

  // Filtered timetable records
  const filteredTimetables = useMemo(() => {
    return searchTimetables(timetables, searchQuery, selectedProgram);
  }, [timetables, searchQuery, selectedProgram]);

  // Program count lookup
  const programCounts = useMemo(() => {
    const counts: Record<string, number> = { Semua: timetables.length };
    timetables.forEach((t) => {
      const p = t.program || 'LAIN-LAIN';
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [timetables]);

  // Select class
  const handleSelectClass = (item: StudentTimetable) => {
    setSelectedTimetable(item);
    // Smooth scroll to viewer on mobile screens
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      const viewerElem = document.getElementById('timetable-viewer-section');
      if (viewerElem) {
        viewerElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Download handler
  const handleDownload = async () => {
    if (!selectedTimetable) return;
    try {
      setDownloading(true);
      const response = await fetch(selectedTimetable.imageUrl);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = selectedTimetable.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Direct link fallback
      const link = document.createElement('a');
      link.href = selectedTimetable.imageUrl;
      link.target = '_blank';
      link.download = selectedTimetable.fileName;
      link.click();
    } finally {
      setDownloading(false);
    }
  };

  // Share handler
  const handleShare = async () => {
    if (!selectedTimetable) return;
    const shareData = {
      title: `Jadual Kelas ${selectedTimetable.classCode} - KPMBP`,
      text: `Semak jadual kelas rasmi bagi ${selectedTimetable.classCode} Kolej Profesional MARA Bandar Penawar.`,
      url: selectedTimetable.imageUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Share error:', err);
        }
      }
    }

    // Fallback: Copy to clipboard
    try {
      await navigator.clipboard.writeText(selectedTimetable.imageUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      alert('Pautan jadual: ' + selectedTimetable.imageUrl);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Hero Banner */}
      <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/60 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/5 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold shadow-2xs">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Jadual Waktu Akademik Pelajar</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
              Jadual Kelas Pelajar
            </h2>
            <p className="text-sm text-slate-600 max-w-2xl leading-relaxed">
              Cari dan semak jadual kelas rasmi Kolej Profesional MARA Bandar Penawar mengikut kod kelas anda. Imej diselaraskan terus daripada repositori rasmi kampus.
            </p>
          </div>

          {/* Quick Stats & Refresh Button */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <div className="bg-white/80 border border-slate-200/80 px-3.5 py-2 rounded-2xl text-left shadow-2xs">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">Jumlah Kelas</span>
              <span className="text-lg font-black text-slate-800 leading-tight">
                {isLoading ? '...' : timetables.length} <span className="text-xs font-bold text-slate-500">Kelas</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => loadData(true)}
              disabled={isRefreshing || isLoading}
              title="Segerakkan semula jadual daripada GitHub"
              className="p-3 bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600 border border-slate-200/80 rounded-2xl shadow-2xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Search & Class Selector (Left) + Timetable Viewer (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Search & Class Picker (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Search Box */}
          <div className="glass-panel rounded-3xl p-4 md:p-5 border border-white/60 shadow-xs space-y-3.5 sticky top-20 z-20 bg-white/95 backdrop-blur-md">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kod kelas, contoh DCAT7A..."
                className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  title="Kosongkan carian"
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Program Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {programs.map((prog) => {
                const isSelected = selectedProgram === prog;
                const count = programCounts[prog] || 0;
                return (
                  <button
                    key={prog}
                    type="button"
                    onClick={() => setSelectedProgram(prog)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs shadow-indigo-200'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200/80'
                    }`}
                  >
                    <span>{prog}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        isSelected ? 'bg-indigo-700/60 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Results List */}
          <div className="glass-panel rounded-3xl p-4 md:p-5 border border-white/60 shadow-xs space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Senarai Padanan ({filteredTimetables.length})
              </span>
              {selectedTimetable && (
                <span className="text-xs font-medium text-indigo-600">
                  Dipilih: <span className="font-extrabold">{selectedTimetable.classCode}</span>
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="py-12 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Menghubungkan ke arkib GitHub...</p>
              </div>
            ) : filteredTimetables.length === 0 ? (
              <div className="py-10 px-4 text-center space-y-3 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-800">Tiada Jadual Ditemui</h4>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Tiada kelas sepadan dengan <span className="font-mono font-bold text-indigo-600">"{searchQuery}"</span>. Sila semak semula ejaan kod kelas anda.
                  </p>
                </div>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedProgram('Semua');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Reset Carian
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[600px] overflow-y-auto pr-1">
                {filteredTimetables.map((item) => {
                  const isSelected = selectedTimetable?.classCode === item.classCode;
                  return (
                    <button
                      key={item.classCode}
                      type="button"
                      onClick={() => handleSelectClass(item)}
                      className={`p-3 rounded-2xl text-left transition-all border cursor-pointer group flex flex-col justify-between relative overflow-hidden ${
                        isSelected
                          ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-transparent shadow-md shadow-indigo-200 ring-2 ring-indigo-500/30'
                          : 'bg-white hover:bg-indigo-50/40 text-slate-800 border-slate-200/80 hover:border-indigo-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-indigo-100 group-hover:text-indigo-700'
                          }`}
                        >
                          {item.program}
                        </span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                      </div>

                      <div className="space-y-0.5">
                        <h4 className="font-mono font-extrabold text-base tracking-tight leading-tight">
                          {item.classCode}
                        </h4>
                        <p className={`text-[11px] font-medium ${isSelected ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {item.semester}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Source of truth footer note */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Sumber: syncrozz/syncrozz-assets
              </span>
              {lastUpdated && <span>Kemas kini: {lastUpdated}</span>}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Timetable Viewer (7 cols) */}
        <div id="timetable-viewer-section" className="lg:col-span-7 space-y-4">
          {selectedTimetable ? (
            <div className="glass-panel rounded-3xl p-4 md:p-6 border border-white/60 shadow-xs space-y-4 bg-white/95">
              
              {/* Viewer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                      {selectedTimetable.classCode}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold">
                      {selectedTimetable.program} • {selectedTimetable.semester}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    Fail: {selectedTimetable.fileName}
                  </p>
                </div>

                {/* Quick Action Toolbar */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Fullscreen Button */}
                  <button
                    type="button"
                    onClick={() => setIsFullscreenOpen(true)}
                    title="Buka paparan skrin penuh"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Skrin Penuh</span>
                  </button>

                  {/* Share Button */}
                  <button
                    type="button"
                    onClick={handleShare}
                    title="Kongsi pautan jadual"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="text-emerald-700">Disalin!</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Kongsi</span>
                      </>
                    )}
                  </button>

                  {/* Download Button */}
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloading}
                    title="Muat turun imej resolusi asal"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs shadow-indigo-200 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Download className={`w-3.5 h-3.5 ${downloading ? 'animate-bounce' : ''}`} />
                    <span>Muat Turun</span>
                  </button>

                  {/* Raw Tab Button */}
                  <a
                    href={selectedTimetable.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Buka fail asal di tab baharu"
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Toast Feedback for Copied Link */}
              {copiedLink && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Pautan imej jadual telah berjaya disalin ke papan keratan!</span>
                </div>
              )}

              {/* Timetable Image Container */}
              <div className="relative rounded-2xl overflow-hidden bg-slate-950/5 border border-slate-200/80 min-h-[340px] flex items-center justify-center p-2 group">
                {isImageLoading && !imageError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50/90 backdrop-blur-xs z-10 space-y-2">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-slate-500">Memuatkan jadual {selectedTimetable.classCode}...</span>
                  </div>
                )}

                {imageError ? (
                  <div className="py-16 text-center space-y-3 px-4">
                    <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-800">Imej Tidak Dapat Dimuatkan</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Terdapat gangguan capaian ke fail imej GitHub untuk kelas {selectedTimetable.classCode}.
                      </p>
                    </div>
                    <a
                      href={selectedTimetable.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
                    >
                      Buka Fail Asal
                    </a>
                  </div>
                ) : (
                  <div className="relative w-full flex items-center justify-center">
                    <img
                      src={selectedTimetable.imageUrl}
                      alt={`Jadual Waktu Kelas ${selectedTimetable.classCode}`}
                      onLoad={() => setIsImageLoading(false)}
                      onError={() => {
                        setIsImageLoading(false);
                        setImageError(true);
                      }}
                      className="w-full h-auto max-h-[75vh] object-contain rounded-xl shadow-2xs cursor-zoom-in transition-transform duration-200"
                      onClick={() => setIsFullscreenOpen(true)}
                    />

                    {/* Hover Click Hint */}
                    <button
                      type="button"
                      onClick={() => setIsFullscreenOpen(true)}
                      className="absolute bottom-4 right-4 bg-slate-900/75 hover:bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-semibold backdrop-blur-sm shadow-md transition-all opacity-90 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Klik untuk Skrin Penuh</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Viewer Footer Tips */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100/60 flex items-start gap-2.5 text-xs text-slate-600">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800">Petua Pengguna:</span> Anda boleh menekan butang <strong>Skrin Penuh</strong> atau mengklik pada gambar untuk melihat perincian masa kuliah, pensyarah, dan nombor bilik kuliah dengan lebih jelas.
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-12 text-center space-y-4 border border-white/60 bg-white/95">
              <BookOpen className="w-12 h-12 text-indigo-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-800">Pilih Kod Kelas</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Sila pilih kod kelas daripada senarai di sebelah kiri atau taip kod kelas anda pada kotak carian.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FULLSCREEN MODAL VIEWER */}
      {isFullscreenOpen && selectedTimetable && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col p-4 sm:p-6 animate-fadeIn"
          onClick={() => setIsFullscreenOpen(false)}
        >
          {/* Modal Header Bar */}
          <div 
            className="flex items-center justify-between text-white pb-3 max-w-7xl w-full mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-lg sm:text-xl font-black">{selectedTimetable.classCode}</span>
              <span className="text-xs font-semibold text-slate-300 hidden sm:inline">
                {selectedTimetable.program} • {selectedTimetable.semester}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                title="Muat Turun"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleShare}
                title="Kongsi"
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                title="Tutup (Esc)"
                className="p-2 rounded-xl bg-rose-500/80 hover:bg-rose-600 text-white transition-colors cursor-pointer flex items-center gap-1.5 px-3"
              >
                <X className="w-4 h-4" />
                <span className="text-xs font-bold">Tutup</span>
              </button>
            </div>
          </div>

          {/* Modal Image Body */}
          <div 
            className="flex-1 flex items-center justify-center p-2 overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={selectedTimetable.imageUrl}
              alt={`Jadual Waktu ${selectedTimetable.classCode}`}
              className="max-w-full max-h-[88vh] object-contain rounded-2xl shadow-2xl bg-white select-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};

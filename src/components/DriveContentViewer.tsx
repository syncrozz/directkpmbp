/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — GOOGLE DRIVE CONTENT VIEWER
 * SES v4.4 Specification
 * 
 * Reusable in-platform viewer for Child Navigation items configured
 * to display Google Drive PDFs or Folders. Reuses the official parser
 * from takwimService, provides fullscreen modal, direct Drive link,
 * and Admin link configuration editor.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Maximize2,
  ExternalLink,
  Pencil,
  X,
  Loader2,
  Check,
  AlertCircle,
  FileText,
  FolderOpen
} from 'lucide-react';
import { NavigationItem } from '../types';
import { parseTakwimLink } from '../services/takwimService';
import { renderNavIcon } from '../services/navigationService';

interface DriveContentViewerProps {
  item: NavigationItem;
  isAdminMode?: boolean;
  onUpdateConfig?: (newUrl: string, newTitle?: string) => Promise<void>;
}

export const DriveContentViewer: React.FC<DriveContentViewerProps> = ({
  item,
  isAdminMode = false,
  onUpdateConfig,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const parsed = useMemo(() => parseTakwimLink(item.driveUrl || ''), [item.driveUrl]);
  const title = item.displayTitle?.trim() || item.name;

  useEffect(() => {
    setIframeLoaded(false);
  }, [parsed?.embedUrl]);

  // Fullscreen escape key & body scroll lock
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setIsFullscreen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  const openEditor = () => {
    setDraftUrl(item.driveUrl || '');
    setDraftTitle(item.displayTitle || item.name || '');
    setNotice(null);
    setIsEditing(true);
  };

  const draftParsed = parseTakwimLink(draftUrl);
  const draftInvalid = draftUrl.trim() !== '' && !draftParsed;

  const handleSave = async () => {
    if (draftInvalid || !draftUrl.trim()) {
      setNotice({
        type: 'error',
        text: 'Pautan tidak sah. Sila masukkan pautan Google Drive (fail PDF atau folder) yang sah.',
      });
      return;
    }

    if (!onUpdateConfig) return;

    try {
      setIsSaving(true);
      setNotice(null);
      await onUpdateConfig(draftUrl.trim(), draftTitle.trim() || undefined);
      setNotice({ type: 'success', text: 'Konfigurasi Google Drive berjaya disimpan.' });
      setIsEditing(false);
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || 'Gagal menyimpan konfigurasi. Sila cuba lagi.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-left animate-fadeIn">
      {/* Top Action & Title Bar */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 border border-white/60 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shadow-2xs shrink-0">
            {renderNavIcon(item.icon, 'w-5 h-5')}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                {title}
              </h2>
              {parsed && (
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                  {parsed.kind === 'drive-folder' ? 'Folder Drive' : 'Dokumen PDF'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Paparan dokumen langsung Google Drive Kolej Profesional MARA Bandar Penawar
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {parsed && (
            <>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Lihat Penuh</span>
              </button>
              <a
                href={parsed.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-extrabold transition-all shadow-2xs no-underline active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Drive</span>
              </a>
            </>
          )}

          {isAdminMode && onUpdateConfig && (
            <button
              type="button"
              onClick={openEditor}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Tukar Pautan</span>
            </button>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {notice && !isEditing && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Admin Inline Editor Form */}
      {isAdminMode && isEditing && (
        <div className="p-4 sm:p-5 bg-indigo-50/70 border border-indigo-200/80 rounded-3xl space-y-3.5 shadow-sm">
          <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
            <h4 className="text-xs font-extrabold text-indigo-950 flex items-center gap-2">
              <Pencil className="w-3.5 h-3.5 text-indigo-600" />
              <span>Kemaskini Pautan & Tajuk Google Drive</span>
            </h4>
            <span className="text-[10px] font-bold text-indigo-600 bg-white px-2 py-0.5 rounded-full border border-indigo-200">
              ID: {item.id}
            </span>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-indigo-950">
              Pautan Google Drive (fail PDF atau folder)
            </label>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... atau https://drive.google.com/drive/folders/..."
              className={`w-full px-3 py-2 rounded-xl border text-xs font-mono bg-white outline-none focus:ring-2 ${
                draftInvalid
                  ? 'border-rose-400 focus:ring-rose-200'
                  : 'border-slate-200 focus:ring-indigo-200'
              }`}
            />
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
              {draftInvalid ? (
                <span className="text-rose-700 font-bold">
                  Pautan tidak sah sebagai Google Drive file/folder URL.
                </span>
              ) : draftParsed ? (
                <span className="text-emerald-700 font-bold">
                  Dikesan: {draftParsed.kind === 'drive-folder' ? 'Folder Drive' : 'Fail PDF/Dokumen'}.
                </span>
              ) : (
                <span>Tampal pautan perkongsian fail PDF atau folder Google Drive.</span>
              )}{' '}
              Pastikan tetapan perkongsian ditetapkan kepada <b>"Sesiapa sahaja yang mempunyai pautan"</b> (Viewer).
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-indigo-950">Tajuk Paparan (Pilihan)</label>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={item.name}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          {notice?.type === 'error' && (
            <p className="text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{notice.text}</span>
            </p>
          )}

          <div className="flex items-center gap-2 justify-end pt-2 border-t border-indigo-100">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || draftInvalid || !draftUrl.trim()}
              className="px-4 py-1.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Simpan Perubahan</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Viewer or Fallback State */}
      {parsed ? (
        <div className="glass-panel rounded-3xl overflow-hidden border border-white/60 shadow-sm relative bg-white min-h-[500px]">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 z-0 bg-slate-50/50">
              {parsed.kind === 'drive-folder' ? (
                <FolderOpen className="w-8 h-8 text-indigo-400 animate-pulse" />
              ) : (
                <FileText className="w-8 h-8 text-indigo-400 animate-pulse" />
              )}
              <span className="text-xs font-bold text-slate-600 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                Memuatkan paparan Google Drive...
              </span>
              <p className="text-[11px] text-slate-400">
                Sila tunggu sebentar sementara fail diambil dari Google Drive
              </p>
            </div>
          )}

          <iframe
            key={parsed.embedUrl}
            src={parsed.embedUrl}
            title={title}
            onLoad={() => setIframeLoaded(true)}
            className="relative z-10 w-full h-[76vh] min-h-[500px] border-0 bg-transparent"
            allow="fullscreen"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="glass-panel rounded-3xl p-10 text-center space-y-4 max-w-lg mx-auto my-8 border border-white/60 bg-white">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Pautan Google Drive Belum Ditetapkan
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Navigasi anak <strong>"{item.name}"</strong> dikonfigurasi sebagai Paparan Google Drive, namun pautan Google Drive belum diisi atau formatnya tidak sah.
          </p>
          {isAdminMode ? (
            <button
              type="button"
              onClick={openEditor}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs cursor-pointer transition-all active:scale-95 flex items-center gap-1.5 mx-auto"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Tetapkan Pautan Google Drive Sekarang</span>
            </button>
          ) : (
            <p className="text-[11px] text-slate-400 italic">
              Sila hubungi Admin platform untuk menetapkan pautan dokumen bagi seksyen ini.
            </p>
          )}
        </div>
      )}

      {parsed && (
        <p className="text-[11px] text-slate-400 font-medium text-center">
          Tidak dapat melihat fail dengan jelas? Klik <b>Lihat Penuh</b> atau <b>Buka di Drive</b>.
        </p>
      )}

      {/* Fullscreen Modal View */}
      {isFullscreen && parsed && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/92 backdrop-blur-md animate-fadeIn"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 text-white border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-white/10 text-white shrink-0">
                {renderNavIcon(item.icon, 'w-4 h-4')}
              </div>
              <span className="text-sm font-extrabold truncate">{title}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-white/90 hidden sm:inline">
                {parsed.kind === 'drive-folder' ? 'Folder Drive' : 'Dokumen PDF'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={parsed.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold no-underline transition-all active:scale-95"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Buka di Drive</span>
              </a>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                aria-label="Tutup Paparan Penuh"
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer transition-all active:scale-95"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <iframe
            src={parsed.embedUrl}
            title={`${title} (Paparan Penuh)`}
            className="flex-1 w-full border-0 bg-white"
            allow="fullscreen"
          />
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Maximize2,
  ExternalLink,
  Pencil,
  X,
  Loader2,
  Check,
  AlertCircle,
  FileText
} from 'lucide-react';
import {
  TakwimConfig,
  DEFAULT_TAKWIM_URL,
  parseTakwimLink,
  subscribeToTakwimConfig,
  saveTakwimConfig
} from '../services/takwimService';

interface TakwimViewerProps {
  isAdminMode?: boolean;
  fallback: React.ReactNode;
}

const DEFAULT_TITLE = 'Takwim Akademik Sesi 2026/2027';

export const TakwimViewer: React.FC<TakwimViewerProps> = ({ isAdminMode = false, fallback }) => {
  const [config, setConfig] = useState<TakwimConfig | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => subscribeToTakwimConfig(setConfig), []);

  const parsed = useMemo(() => parseTakwimLink(config?.url || ''), [config?.url]);
  const title = config?.title?.trim() || DEFAULT_TITLE;

  useEffect(() => {
    setIframeLoaded(false);
  }, [parsed?.embedUrl]);

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
    setDraftUrl(config?.url ?? DEFAULT_TAKWIM_URL);
    setDraftTitle(config?.title ?? '');
    setNotice(null);
    setIsEditing(true);
  };

  const draftParsed = parseTakwimLink(draftUrl);
  const draftInvalid = draftUrl.trim() !== '' && !draftParsed;

  const handleSave = async () => {
    if (draftInvalid) {
      setNotice({ type: 'error', text: 'Pautan tidak sah. Gunakan pautan Google Drive (fail PDF atau folder).' });
      return;
    }
    try {
      setIsSaving(true);
      setNotice(null);
      await saveTakwimConfig(draftUrl, draftTitle);
      setNotice({ type: 'success', text: 'Pautan takwim berjaya dikemaskini.' });
      setIsEditing(false);
    } catch (err: any) {
      const permission = /permission|insufficient/i.test(err?.message || '');
      setNotice({
        type: 'error',
        text: permission
          ? 'Tiada kebenaran menyimpan. Pastikan anda log masuk Admin menggunakan akaun Google yang dibenarkan.'
          : 'Gagal menyimpan pautan. Sila cuba lagi.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!config) {
    return (
      <div className="glass-panel rounded-[26px] border border-white/55 p-10 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
      </div>
    );
  }

  const hasViewer = Boolean(parsed);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            {title}
          </h3>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {hasViewer && (
            <>
              <button
                type="button"
                onClick={() => setIsFullscreen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Lihat Penuh</span>
              </button>
              <a
                href={parsed!.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-extrabold transition-all shadow-2xs no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka di Drive</span>
              </a>
            </>
          )}
          {isAdminMode && (
            <button
              type="button"
              onClick={openEditor}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>Tukar Pautan</span>
            </button>
          )}
        </div>
      </div>

      {notice && !isEditing && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {notice.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      {isAdminMode && isEditing && (
        <div className="p-4 sm:p-5 bg-indigo-50/70 border border-indigo-200/70 rounded-2xl space-y-3">
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-indigo-950">Pautan Google Drive (fail PDF atau folder)</label>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder="https://drive.google.com/file/d/... atau .../folders/..."
              className={`w-full px-3 py-2 rounded-xl border text-xs font-mono bg-white outline-none focus:ring-2 ${
                draftInvalid ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-indigo-200'
              }`}
            />
            <p className="text-[10.5px] text-slate-500 font-medium leading-relaxed">
              {draftInvalid ? (
                <span className="text-rose-700 font-bold">Pautan tidak dikenali sebagai pautan Google Drive.</span>
              ) : draftParsed ? (
                <>Dikesan: <b>{draftParsed.kind === 'drive-folder' ? 'Folder Drive' : draftParsed.kind === 'drive-file' ? 'Fail Drive' : 'Pautan lain'}</b>. </>
              ) : (
                <>Kosongkan untuk kembali ke senarai takwim asal. </>
              )}
              Pastikan perkongsian ditetapkan kepada <b>"Sesiapa sahaja yang mempunyai pautan"</b> (Viewer). Untuk paparan terbaik, tampal pautan fail PDF terus.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-extrabold text-indigo-950">Tajuk (pilihan)</label>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder={DEFAULT_TITLE}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          {notice?.type === 'error' && (
            <p className="text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {notice.text}
            </p>
          )}
          <div className="flex items-center gap-2 justify-end">
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
              disabled={isSaving || draftInvalid}
              className="px-4 py-1.5 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Simpan
            </button>
          </div>
        </div>
      )}

      {hasViewer ? (
        <div className="glass-panel rounded-[26px] overflow-hidden border border-white/55 shadow-sm relative bg-white">
          {!iframeLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 z-0">
              <FileText className="w-7 h-7" />
              <span className="text-xs font-semibold flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuatkan takwim...
              </span>
            </div>
          )}
          <iframe
            key={parsed!.embedUrl}
            src={parsed!.embedUrl}
            title={title}
            onLoad={() => setIframeLoaded(true)}
            className="relative z-10 w-full h-[70vh] min-h-[420px] border-0 bg-transparent"
            allow="fullscreen"
            loading="lazy"
          />
        </div>
      ) : (
        fallback
      )}

      {hasViewer && (
        <p className="text-[10.5px] text-slate-400 font-medium text-center">
          Tidak dapat dilihat? Klik <b>Buka di Drive</b> atau <b>Lihat Penuh</b>.
        </p>
      )}

      {isFullscreen && parsed && (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-slate-950/90 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 shrink-0" />
              <span className="text-sm font-extrabold truncate">{title}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={parsed.openUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold no-underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Buka di Drive</span>
              </a>
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                aria-label="Tutup"
                className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <iframe
            src={parsed.embedUrl}
            title={`${title} (paparan penuh)`}
            className="flex-1 w-full border-0 bg-white"
            allow="fullscreen"
          />
        </div>
      )}
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — EMPTY PAGE CONTAINER (PAGES KOSONG)
 * SES v4.4 Specification (Level 2 Child Container for Level 3 Grandchildren)
 * 
 * Renders a clean, structured container page for child navigation items
 * configured as "Pages Kosong". Displays the hierarchy breadcrumbs, container overview,
 * quick-access cards for associated grandchildren items, or a helpful empty state
 * when no grandchildren have been added yet.
 */

import React from 'react';
import { NavigationItem } from '../types';
import { renderNavIcon } from '../services/navigationService';
import {
  FolderTree,
  ChevronRight,
  Plus,
  FileText,
  Layers,
  ArrowRight,
  Sparkles,
  Info
} from 'lucide-react';

interface EmptyPageContainerProps {
  item: NavigationItem;
  parentItem?: NavigationItem;
  grandchildren: NavigationItem[];
  onSelectGrandchild: (grandchild: NavigationItem) => void;
  isAdminMode?: boolean;
  onOpenNavManager?: () => void;
}

export const EmptyPageContainer: React.FC<EmptyPageContainerProps> = ({
  item,
  parentItem,
  grandchildren,
  onSelectGrandchild,
  isAdminMode = false,
  onOpenNavManager,
}) => {
  return (
    <div className="space-y-6 text-left animate-fadeIn">
      {/* 1. Header Hero Glass Card */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-white/60 shadow-sm bg-gradient-to-br from-white/95 via-amber-50/20 to-white/90 backdrop-blur-md relative overflow-hidden">
        {/* Ambient subtle decorative shape */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          {/* Breadcrumb Hierarchy */}
          <nav aria-label="Hierarki Navigasi" className="flex items-center gap-1.5 text-xs font-extrabold text-slate-400 flex-wrap">
            {parentItem && (
              <>
                <span className="flex items-center gap-1 text-slate-500">
                  {renderNavIcon(parentItem.icon, 'w-3.5 h-3.5 text-slate-500')}
                  <span>{parentItem.name}</span>
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </>
            )}
            <span className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/80">
              {renderNavIcon(item.icon, 'w-3.5 h-3.5 text-amber-600')}
              <span>{item.name}</span>
            </span>
          </nav>

          {/* Title & Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 text-white flex items-center justify-center shadow-md shadow-amber-200 shrink-0">
                {renderNavIcon(item.icon, 'w-6 h-6 text-white')}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-sans font-black text-slate-900 text-xl sm:text-2xl tracking-tight leading-tight">
                    {item.name}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200/80 flex items-center gap-1">
                    <FolderTree className="w-3 h-3 text-amber-700" />
                    <span>Pages Kosong • Container</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {grandchildren.length > 0
                    ? `Terdapat ${grandchildren.length} navigasi kandungan disediakan di bawah bekas ini.`
                    : 'Halaman bekas sedia untuk menempatkan navigasi cucu dan fail berkaitan.'}
                </p>
              </div>
            </div>

            {/* Admin Add Grandchild Fast-track Button */}
            {isAdminMode && onOpenNavManager && (
              <button
                type="button"
                onClick={onOpenNavManager}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Urus / Tambah Cucu</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Content Section: Grid of Grandchildren vs Empty State */}
      {grandchildren.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                Senarai Dokumen & Pautan ({grandchildren.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              Klik mana-mana item untuk membuka kandungan
            </span>
          </div>

          {/* Grandchildren Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {grandchildren.map((gc, index) => {
              const isDrive = gc.displayType === 'drive' || Boolean(gc.driveUrl);

              return (
                <div
                  key={gc.id}
                  onClick={() => onSelectGrandchild(gc)}
                  className="glass-panel p-4 rounded-2xl border border-slate-200/80 hover:border-indigo-300 bg-white hover:bg-gradient-to-br hover:from-white hover:to-indigo-50/40 transition-all cursor-pointer shadow-2xs hover:shadow-md group flex flex-col justify-between gap-3 text-left"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0 border border-indigo-100">
                        {renderNavIcon(gc.icon, 'w-4 h-4')}
                      </div>

                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                        #{index + 1}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-sans font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors text-sm leading-snug line-clamp-2">
                        {gc.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                        /{gc.slug || gc.id}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500">
                      {isDrive ? (
                        <>
                          <FileText className="w-3 h-3 text-violet-600" />
                          <span>Google Drive</span>
                        </>
                      ) : (
                        <>
                          <Layers className="w-3 h-3 text-indigo-600" />
                          <span>Modul</span>
                        </>
                      )}
                    </span>

                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                      <span>Buka</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Clean Empty State when Pages Kosong has no grandchildren yet */
        <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 border border-dashed border-amber-200/90 bg-amber-50/30">
          <div className="w-16 h-16 bg-white border border-amber-200 rounded-3xl flex items-center justify-center mx-auto text-amber-600 shadow-sm">
            <FolderTree className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h3 className="font-sans font-black text-slate-900 text-base sm:text-lg">
              Halaman Bekas Sedia Digunakan
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto font-medium">
              Halaman container <b>"{item.name}"</b> telah berjaya diwujudkan. Buat masa ini, belum ada navigasi cucu (seperti fail Google Drive atau modul) ditambah di bawah halaman ini.
            </p>
          </div>

          <div className="p-3 bg-white/80 rounded-2xl border border-amber-100 text-[11px] text-slate-500 font-medium flex items-center gap-2 max-w-sm mx-auto text-left">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Prinsip SES: <i>"Cipta container terlebih dahulu. Tambah navigasi cucu apabila diperlukan."</i>
            </span>
          </div>

          {isAdminMode && onOpenNavManager && (
            <div className="pt-2">
              <button
                type="button"
                onClick={onOpenNavManager}
                className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Cucu di bawah {item.name}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

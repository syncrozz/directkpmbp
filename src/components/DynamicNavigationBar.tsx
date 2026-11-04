/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC HIERARCHICAL NAVIGATION BAR
 * SES v4.4 Specification
 * 
 * Renders data-driven Primary (Parent) and Secondary (Child) navigation rows,
 * maintains active state synchronization, responsive horizontal scrolling,
 * and seamless Admin CRUD integration.
 */

import React, { useMemo } from 'react';
import { NavigationItem } from '../types';
import { renderNavIcon } from '../services/navigationService';
import { Layers, Settings, ChevronRight } from 'lucide-react';

interface DynamicNavigationBarProps {
  items: NavigationItem[];
  activeHub: string;
  onSelectDestination: (destination: string) => void;
  isAdminMode?: boolean;
  onOpenNavManager?: () => void;
}

export const DynamicNavigationBar: React.FC<DynamicNavigationBarProps> = ({
  items,
  activeHub,
  onSelectDestination,
  isAdminMode = false,
  onOpenNavManager,
}) => {
  // 1. Filter only active Parents, sorted by order
  const activeParents = useMemo(() => {
    return items
      .filter((i) => i.type === 'parent' && i.isActive)
      .sort((a, b) => a.order - b.order);
  }, [items]);

  // 2. Filter only active Children, sorted by order
  const activeChildren = useMemo(() => {
    return items
      .filter((i) => i.type === 'child' && i.isActive)
      .sort((a, b) => a.order - b.order);
  }, [items]);

  // 3. Map active children by their parentId
  const childrenMap = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    activeChildren.forEach((child) => {
      if (child.parentId) {
        if (!map.has(child.parentId)) {
          map.set(child.parentId, []);
        }
        map.get(child.parentId)!.push(child);
      }
    });
    return map;
  }, [activeChildren]);

  // 4. Determine currently selected Parent based on activeHub
  // A parent is active if:
  // a) Parent's destination strictly equals activeHub
  // b) Or any of its active children has destination === activeHub
  const activeParent = useMemo(() => {
    // Exact match on parent destination
    const directMatch = activeParents.find((p) => p.destination === activeHub);
    if (directMatch) return directMatch;

    // Match via child destination
    const childMatch = activeChildren.find((c) => c.destination === activeHub);
    if (childMatch && childMatch.parentId) {
      const parent = activeParents.find((p) => p.id === childMatch.parentId);
      if (parent) return parent;
    }

    // Fallback: first active parent if any
    return activeParents[0] || null;
  }, [activeParents, activeChildren, activeHub]);

  // 5. Children of currently selected Parent
  const currentParentChildren = useMemo(() => {
    if (!activeParent) return [];
    return childrenMap.get(activeParent.id) || [];
  }, [activeParent, childrenMap]);

  // Color theme generator for active parent
  const getParentThemeClasses = (destination: string, isSelected: boolean) => {
    if (!isSelected) {
      return 'bg-white/80 text-slate-700 hover:bg-slate-100/90 border-slate-200/80 hover:border-slate-300 shadow-2xs';
    }

    switch (destination) {
      case 'directory':
        return 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-300/60 ring-2 ring-indigo-400/30 border-indigo-600';
      case 'rujukan':
        return 'bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-300/60 ring-2 ring-emerald-400/30 border-emerald-600';
      case 'jadual':
      case 'jadual-pensyarah':
        return 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white shadow-md shadow-amber-300/60 ring-2 ring-amber-400/30 border-amber-500';
      case 'daftar':
        return 'bg-gradient-to-r from-purple-600 via-purple-600 to-violet-700 text-white shadow-md shadow-purple-300/60 ring-2 ring-purple-400/30 border-purple-600';
      default:
        return 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white shadow-md shadow-indigo-300/60 ring-2 ring-indigo-400/30 border-indigo-600';
    }
  };

  // Color theme for background container
  const getContainerBgClasses = () => {
    if (!activeParent) return 'bg-white/70 border-slate-100';
    switch (activeParent.destination) {
      case 'directory':
        return 'bg-gradient-to-r from-indigo-50/80 via-white/70 to-indigo-50/40 border-indigo-100/90';
      case 'rujukan':
        return 'bg-gradient-to-r from-emerald-50/80 via-white/70 to-emerald-50/40 border-emerald-100/90';
      case 'jadual':
      case 'jadual-pensyarah':
        return 'bg-gradient-to-r from-amber-50/80 via-white/70 to-amber-50/40 border-amber-100/90';
      case 'daftar':
        return 'bg-gradient-to-r from-purple-50/80 via-white/70 to-purple-50/40 border-purple-100/90';
      default:
        return 'bg-gradient-to-r from-slate-50/80 via-white/70 to-indigo-50/40 border-slate-200/90';
    }
  };

  // Click on Parent Navigation item
  const handleParentClick = (parent: NavigationItem) => {
    const pChildren = childrenMap.get(parent.id) || [];
    if (pChildren.length > 0) {
      // If currently activeHub is already one of the children, keep it
      const currentChildIsActive = pChildren.some((c) => c.destination === activeHub);
      if (!currentChildIsActive) {
        // Activate first active child
        onSelectDestination(pChildren[0].destination);
      }
    } else {
      // Direct access parent
      onSelectDestination(parent.destination);
    }
  };

  // Click on Child Navigation item
  const handleChildClick = (child: NavigationItem) => {
    onSelectDestination(child.destination);
  };

  return (
    <div className={`transition-all duration-300 border-b relative z-30 backdrop-blur-md ${getContainerBgClasses()}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 space-y-2">
        {/* ROW 1: PRIMARY (PARENT) NAVIGATION */}
        <div className="flex items-center justify-between gap-2">
          <nav
            aria-label="Navigasi Utama Platform"
            className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 shrink-0 max-w-full"
          >
            {activeParents.map((parent) => {
              const isSelected = activeParent?.id === parent.id;
              const hasChildren = (childrenMap.get(parent.id) || []).length > 0;

              return (
                <button
                  key={parent.id}
                  type="button"
                  onClick={() => handleParentClick(parent)}
                  aria-current={isSelected ? 'page' : undefined}
                  className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer border select-none shrink-0 ${getParentThemeClasses(
                    parent.destination,
                    isSelected
                  )}`}
                >
                  <span className="shrink-0">
                    {renderNavIcon(parent.icon, `w-4 h-4 transition-colors ${isSelected ? 'text-white' : 'text-slate-600'}`)}
                  </span>
                  <span>{parent.name}</span>

                  {hasChildren && (
                    <span
                      className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                        isSelected
                          ? 'bg-white/25 text-white'
                          : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      {(childrenMap.get(parent.id) || []).length}
                    </span>
                  )}

                  {isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Admin Navigation Manager Launcher (Hanya dalam Mod Admin) */}
          {isAdminMode && onOpenNavManager && (
            <button
              type="button"
              onClick={onOpenNavManager}
              title="Urus Susunan Navigasi Dinamik (SES v4.4)"
              className="px-3 py-1.5 bg-white/90 hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-extrabold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
            >
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Urus Navigasi</span>
            </button>
          )}
        </div>

        {/* ROW 2: SECONDARY (CHILD) NAVIGATION */}
        {/* Dipaparkan HANYA apabila Parent terpilih mempunyai navigasi anak yang aktif */}
        {currentParentChildren.length > 0 && (
          <div className="pt-1.5 border-t border-slate-200/60 flex items-center gap-2 overflow-x-auto scrollbar-none animate-fadeIn">
            <div className="flex items-center gap-1 text-[11px] font-extrabold text-slate-400 uppercase tracking-wider pl-1 shrink-0">
              <span>{activeParent?.name}</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 py-0.5">
              {currentParentChildren.map((child) => {
                const isChildActive = activeHub === child.destination;

                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => handleChildClick(child)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                      isChildActive
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white/90 text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/80 border-slate-200/80'
                    }`}
                  >
                    <span className="shrink-0">
                      {renderNavIcon(child.icon, `w-3.5 h-3.5 ${isChildActive ? 'text-white' : 'text-indigo-600'}`)}
                    </span>
                    <span>{child.name}</span>
                    {isChildActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC HIERARCHICAL NAVIGATION BAR
 * SES v4.4 Specification (3-Level Navigation: Parent → Child → Grandchild)
 * 
 * Renders data-driven Primary (Parent), Secondary (Child), and Tertiary (Grandchild)
 * navigation rows, maintains active state synchronization, responsive horizontal
 * scrolling, and seamless Admin CRUD integration.
 */

import React, { useMemo } from 'react';
import { NavigationItem } from '../types';
import { renderNavIcon } from '../services/navigationService';
import { Layers, ChevronRight } from 'lucide-react';

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

  // 3. Filter only active Grandchildren, sorted by order
  const activeGrandchildren = useMemo(() => {
    return items
      .filter((i) => i.type === 'grandchild' && i.isActive)
      .sort((a, b) => a.order - b.order);
  }, [items]);

  // 4. Map active children by their parentId (Parent ID)
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

  // 5. Map active grandchildren by their parentId (Child ID)
  const grandchildrenMap = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    activeGrandchildren.forEach((gc) => {
      if (gc.parentId) {
        if (!map.has(gc.parentId)) {
          map.set(gc.parentId, []);
        }
        map.get(gc.parentId)!.push(gc);
      }
    });
    return map;
  }, [activeGrandchildren]);

  // 6. Determine active hierarchy (Parent -> Child -> Grandchild) based on activeHub
  const activeParent = useMemo(() => {
    // Check direct match on parent
    const directMatch = activeParents.find(
      (p) =>
        p.destination === activeHub ||
        p.id === activeHub ||
        (p.slug && p.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (directMatch) return directMatch;

    // Check match on grandchild
    const gcMatch = activeGrandchildren.find(
      (gc) =>
        gc.destination === activeHub ||
        gc.id === activeHub ||
        (gc.slug && gc.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (gcMatch && gcMatch.parentId) {
      const child = activeChildren.find((c) => c.id === gcMatch.parentId);
      if (child && child.parentId) {
        const parent = activeParents.find((p) => p.id === child.parentId);
        if (parent) return parent;
      }
    }

    // Check match on child
    const childMatch = activeChildren.find(
      (c) =>
        c.destination === activeHub ||
        c.id === activeHub ||
        (c.slug && c.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (childMatch && childMatch.parentId) {
      const parent = activeParents.find((p) => p.id === childMatch.parentId);
      if (parent) return parent;
    }

    // Fallback via any item in hierarchy
    const anyItem = items.find(
      (i) =>
        i.id === activeHub ||
        i.destination === activeHub ||
        (i.slug && i.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (anyItem) {
      if (anyItem.type === 'grandchild' && anyItem.parentId) {
        const child = items.find((c) => c.id === anyItem.parentId);
        if (child && child.parentId) {
          const parent = activeParents.find((p) => p.id === child.parentId);
          if (parent) return parent;
        }
      }
      if (anyItem.type === 'child' && anyItem.parentId) {
        const parent = activeParents.find((p) => p.id === anyItem.parentId);
        if (parent) return parent;
      }
    }

    return activeParents[0] || null;
  }, [activeParents, activeChildren, activeGrandchildren, activeHub, items]);

  // Children of currently selected Parent
  const currentParentChildren = useMemo(() => {
    if (!activeParent) return [];
    return childrenMap.get(activeParent.id) || [];
  }, [activeParent, childrenMap]);

  // Determine currently active Child
  const activeChild = useMemo(() => {
    if (!activeParent || currentParentChildren.length === 0) return null;

    // Check if activeHub matches a grandchild under one of currentParentChildren
    const gcMatch = activeGrandchildren.find(
      (gc) =>
        gc.id === activeHub ||
        gc.destination === activeHub ||
        (gc.slug && gc.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (gcMatch && gcMatch.parentId) {
      const child = currentParentChildren.find((c) => c.id === gcMatch.parentId);
      if (child) return child;
    }

    // Check if activeHub matches a child directly
    const directChild = currentParentChildren.find(
      (c) =>
        c.id === activeHub ||
        c.destination === activeHub ||
        (c.slug && c.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (directChild) return directChild;

    // Fallback: first child of activeParent
    return currentParentChildren[0] || null;
  }, [activeParent, currentParentChildren, activeGrandchildren, activeHub]);

  // Grandchildren of currently selected Child
  const currentChildGrandchildren = useMemo(() => {
    if (!activeChild) return [];
    return grandchildrenMap.get(activeChild.id) || [];
  }, [activeChild, grandchildrenMap]);

  // Determine currently active Grandchild
  const activeGrandchild = useMemo(() => {
    if (currentChildGrandchildren.length === 0) return null;

    const matched = currentChildGrandchildren.find(
      (gc) =>
        gc.id === activeHub ||
        gc.destination === activeHub ||
        (gc.slug && gc.slug.toLowerCase() === activeHub.toLowerCase())
    );
    if (matched) return matched;

    return currentChildGrandchildren[0] || null;
  }, [currentChildGrandchildren, activeHub]);

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
      // Check if current active child is already one of parent's children
      const currentChildIsActive = pChildren.some(
        (c) =>
          c.destination === activeHub ||
          c.id === activeHub ||
          (c.slug && c.slug.toLowerCase() === activeHub.toLowerCase()) ||
          (activeChild && activeChild.id === c.id)
      );
      if (!currentChildIsActive) {
        const firstChild = pChildren[0];
        if (firstChild.displayType === 'empty_page') {
          onSelectDestination(firstChild.id || firstChild.destination);
        } else {
          const gcs = grandchildrenMap.get(firstChild.id) || [];
          if (gcs.length > 0) {
            // If first child is in container mode, select its first grandchild
            const firstGc = gcs[0];
            onSelectDestination(firstGc.id || firstGc.destination);
          } else {
            onSelectDestination(firstChild.id || firstChild.destination);
          }
        }
      }
    } else {
      // Direct access parent
      onSelectDestination(parent.id || parent.destination);
    }
  };

  // Click on Child Navigation item
  const handleChildClick = (child: NavigationItem) => {
    // If the child is an empty_page container, user directly views the container page
    if (child.displayType === 'empty_page') {
      onSelectDestination(child.id || child.destination);
      return;
    }
    const gcs = grandchildrenMap.get(child.id) || [];
    if (gcs.length > 0) {
      // Container mode: auto-select first grandchild
      const firstGc = gcs[0];
      onSelectDestination(firstGc.id || firstGc.destination);
    } else {
      // Direct content mode
      onSelectDestination(child.id || child.destination);
    }
  };

  // Click on Grandchild Navigation item
  const handleGrandchildClick = (grandchild: NavigationItem) => {
    onSelectDestination(grandchild.id || grandchild.destination);
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
                const childGcs = grandchildrenMap.get(child.id) || [];
                const isChildActive = activeChild?.id === child.id;

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

                    {childGcs.length > 0 && (
                      <span
                        className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                          isChildActive
                            ? 'bg-white/25 text-white'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}
                      >
                        {childGcs.length}
                      </span>
                    )}

                    {isChildActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ROW 3: TERTIARY (GRANDCHILD) NAVIGATION */}
        {/* Dipaparkan HANYA apabila Child terpilih mempunyai navigasi cucu yang aktif */}
        {currentChildGrandchildren.length > 0 && (
          <div className="pt-1.5 border-t border-violet-200/60 flex items-center gap-2 overflow-x-auto scrollbar-none animate-fadeIn bg-violet-50/40 rounded-xl px-2 py-1">
            <div className="flex items-center gap-1 text-[10.5px] font-extrabold text-violet-600 uppercase tracking-wider pl-1 shrink-0">
              <span>{activeChild?.name}</span>
              <ChevronRight className="w-3 h-3 text-violet-400" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 py-0.5">
              {currentChildGrandchildren.map((gc) => {
                const isChildContainerViewing =
                  activeChild?.displayType === 'empty_page' &&
                  (activeHub === activeChild.id ||
                    activeHub === activeChild.destination ||
                    (activeChild.slug && activeHub.toLowerCase() === activeChild.slug.toLowerCase()));

                const isGcActive =
                  !isChildContainerViewing &&
                  (activeGrandchild?.id === gc.id ||
                    activeHub === gc.id ||
                    (gc.slug && activeHub.toLowerCase() === gc.slug.toLowerCase()) ||
                    activeHub === gc.destination);

                return (
                  <button
                    key={gc.id}
                    type="button"
                    onClick={() => handleGrandchildClick(gc)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                      isGcActive
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-violet-600 shadow-xs ring-2 ring-violet-300/40'
                        : 'bg-white/95 text-slate-700 hover:text-violet-700 hover:bg-violet-50/80 border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <span className="shrink-0">
                      {renderNavIcon(gc.icon, `w-3.5 h-3.5 ${isGcActive ? 'text-white' : 'text-violet-600'}`)}
                    </span>
                    <span>{gc.name}</span>
                    {isGcActive && (
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

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC HIERARCHICAL NAVIGATION BAR
 * SES v4.5 Specification (4-Level Navigation: Alfa → Bravo → Charlie → Delta)
 * 
 * Renders data-driven Primary (Parent), Secondary (Child), Tertiary (Grandchild),
 * and Quaternary (Delta) navigation rows, maintains active state synchronization,
 * responsive horizontal scrolling, and seamless Admin CRUD integration.
 */

import React, { useMemo } from 'react';
import { NavigationItem } from '../types';
import { renderNavIcon, getHierarchicalSlug } from '../services/navigationService';
import { ChevronRight } from 'lucide-react';

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

  // 4. Filter only active Deltas, sorted by order
  const activeDeltas = useMemo(() => {
    return items
      .filter((i) => i.type === 'delta' && i.isActive)
      .sort((a, b) => a.order - b.order);
  }, [items]);

  // 5. Map active children by their parentId (Parent ID)
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

  // 6. Map active grandchildren by their parentId (Child ID)
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

  // 7. Map active deltas by their parentId (Grandchild ID)
  const deltasMap = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    activeDeltas.forEach((delta) => {
      if (delta.parentId) {
        if (!map.has(delta.parentId)) {
          map.set(delta.parentId, []);
        }
        map.get(delta.parentId)!.push(delta);
      }
    });
    return map;
  }, [activeDeltas]);

  // 8. Resolve matched item across all 4 levels (ID -> hierarchical slug -> leaf slug -> destination)
  const matchedActiveChain = useMemo(() => {
    const hubLower = (activeHub || '').toLowerCase();
    const matchedItem =
      items.find((i) => i.id === activeHub) ||
      items.find((i) => getHierarchicalSlug(i, items).toLowerCase() === hubLower) ||
      items.find((i) => i.slug && i.slug.toLowerCase() === hubLower) ||
      items.find((i) => i.destination === activeHub);

    if (!matchedItem) {
      return {
        matchedItem: undefined,
        matchedParent: undefined,
        matchedChild: undefined,
        matchedGrandchild: undefined,
        matchedDelta: undefined,
      };
    }

    if (matchedItem.type === 'delta') {
      const gc = matchedItem.parentId ? items.find((i) => i.id === matchedItem.parentId) : undefined;
      const ch = gc?.parentId ? items.find((i) => i.id === gc.parentId) : undefined;
      const pr = ch?.parentId ? items.find((i) => i.id === ch.parentId) : undefined;
      return {
        matchedItem,
        matchedParent: pr,
        matchedChild: ch,
        matchedGrandchild: gc,
        matchedDelta: matchedItem,
      };
    }

    if (matchedItem.type === 'grandchild') {
      const ch = matchedItem.parentId ? items.find((i) => i.id === matchedItem.parentId) : undefined;
      const pr = ch?.parentId ? items.find((i) => i.id === ch.parentId) : undefined;
      return {
        matchedItem,
        matchedParent: pr,
        matchedChild: ch,
        matchedGrandchild: matchedItem,
        matchedDelta: undefined,
      };
    }

    if (matchedItem.type === 'child') {
      const pr = matchedItem.parentId ? items.find((i) => i.id === matchedItem.parentId) : undefined;
      return {
        matchedItem,
        matchedParent: pr,
        matchedChild: matchedItem,
        matchedGrandchild: undefined,
        matchedDelta: undefined,
      };
    }

    return {
      matchedItem,
      matchedParent: matchedItem,
      matchedChild: undefined,
      matchedGrandchild: undefined,
      matchedDelta: undefined,
    };
  }, [items, activeHub]);

  // Determine active Parent (Alfa)
  const activeParent = useMemo(() => {
    if (matchedActiveChain.matchedParent) {
      const activeMatch = activeParents.find((p) => p.id === matchedActiveChain.matchedParent!.id);
      if (activeMatch) return activeMatch;
    }
    return activeParents[0] || null;
  }, [activeParents, matchedActiveChain]);

  // Children of currently selected Parent
  const currentParentChildren = useMemo(() => {
    if (!activeParent) return [];
    return childrenMap.get(activeParent.id) || [];
  }, [activeParent, childrenMap]);

  // Determine currently active Child (Bravo)
  const activeChild = useMemo(() => {
    if (!activeParent || currentParentChildren.length === 0) return null;
    if (matchedActiveChain.matchedChild) {
      const activeMatch = currentParentChildren.find((c) => c.id === matchedActiveChain.matchedChild!.id);
      if (activeMatch) return activeMatch;
    }
    return currentParentChildren[0] || null;
  }, [activeParent, currentParentChildren, matchedActiveChain]);

  const isChildContainerViewing = Boolean(
    activeChild?.displayType === 'empty_page' &&
      matchedActiveChain.matchedItem?.id === activeChild.id
  );

  // Grandchildren of currently selected Child
  const currentChildGrandchildren = useMemo(() => {
    if (!activeChild) return [];
    return grandchildrenMap.get(activeChild.id) || [];
  }, [activeChild, grandchildrenMap]);

  // Determine currently active Grandchild (Charlie)
  const activeGrandchild = useMemo(() => {
    if (currentChildGrandchildren.length === 0 || isChildContainerViewing) return null;
    if (matchedActiveChain.matchedGrandchild) {
      const activeMatch = currentChildGrandchildren.find(
        (gc) => gc.id === matchedActiveChain.matchedGrandchild!.id
      );
      if (activeMatch) return activeMatch;
    }
    return currentChildGrandchildren[0] || null;
  }, [currentChildGrandchildren, isChildContainerViewing, matchedActiveChain]);

  const isGrandchildContainerViewing = Boolean(
    activeGrandchild?.displayType === 'empty_page' &&
      matchedActiveChain.matchedItem?.id === activeGrandchild.id
  );

  // Deltas of currently selected Grandchild (hidden when viewing Bravo container page)
  const currentGrandchildDeltas = useMemo(() => {
    if (!activeGrandchild || isChildContainerViewing) return [];
    return deltasMap.get(activeGrandchild.id) || [];
  }, [activeGrandchild, isChildContainerViewing, deltasMap]);

  // Determine currently active Delta (Level 4)
  const activeDelta = useMemo(() => {
    if (currentGrandchildDeltas.length === 0 || isChildContainerViewing || isGrandchildContainerViewing) {
      return null;
    }
    if (matchedActiveChain.matchedDelta) {
      const activeMatch = currentGrandchildDeltas.find(
        (d) => d.id === matchedActiveChain.matchedDelta!.id
      );
      if (activeMatch) return activeMatch;
    }
    return currentGrandchildDeltas[0] || null;
  }, [currentGrandchildDeltas, isChildContainerViewing, isGrandchildContainerViewing, matchedActiveChain]);

  // Color theme generator for active parent
  const getParentThemeClasses = (destination: string, isSelected: boolean) => {
    if (!isSelected) {
      return 'bg-white/80 text-slate-700 hover:bg-slate-100/90 border-slate-200/80 hover:border-slate-300 shadow-2xs';
    }

    switch (destination) {
      case 'directory':
        return 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-300/60 ring-2 ring-indigo-400/30 border-indigo-600';
      case 'rujukan':
      case 'platform':
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
      case 'platform':
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
            const firstGc = gcs[0];
            if (firstGc.displayType === 'empty_page') {
              onSelectDestination(firstGc.id || firstGc.destination);
            } else {
              const deltas = deltasMap.get(firstGc.id) || [];
              if (deltas.length > 0 && !firstGc.driveUrl && firstGc.destination === firstGc.id) {
                onSelectDestination(deltas[0].id || deltas[0].destination);
              } else {
                onSelectDestination(firstGc.id || firstGc.destination);
              }
            }
          } else {
            onSelectDestination(firstChild.id || firstChild.destination);
          }
        }
      }
    } else {
      onSelectDestination(parent.id || parent.destination);
    }
  };

  // Click on Child Navigation item (Bravo)
  const handleChildClick = (child: NavigationItem) => {
    if (child.displayType === 'empty_page') {
      onSelectDestination(child.id || child.destination);
      return;
    }
    const gcs = grandchildrenMap.get(child.id) || [];
    if (gcs.length > 0) {
      const firstGc = gcs[0];
      if (firstGc.displayType === 'empty_page') {
        onSelectDestination(firstGc.id || firstGc.destination);
      } else {
        const deltas = deltasMap.get(firstGc.id) || [];
        if (deltas.length > 0 && !firstGc.driveUrl && firstGc.destination === firstGc.id) {
          onSelectDestination(deltas[0].id || deltas[0].destination);
        } else {
          onSelectDestination(firstGc.id || firstGc.destination);
        }
      }
    } else {
      onSelectDestination(child.id || child.destination);
    }
  };

  // Click on Grandchild Navigation item (Charlie)
  const handleGrandchildClick = (grandchild: NavigationItem) => {
    if (grandchild.displayType === 'empty_page') {
      onSelectDestination(grandchild.id || grandchild.destination);
      return;
    }
    const deltas = deltasMap.get(grandchild.id) || [];
    if (deltas.length > 0 && !grandchild.driveUrl && grandchild.destination === grandchild.id) {
      onSelectDestination(deltas[0].id || deltas[0].destination);
      return;
    }
    onSelectDestination(grandchild.id || grandchild.destination);
  };

  // Click on Delta Navigation item (Delta)
  const handleDeltaClick = (delta: NavigationItem) => {
    onSelectDestination(delta.id || delta.destination);
  };

  return (
    <div className={`transition-all duration-300 border-b relative z-[35] backdrop-blur-md ${getContainerBgClasses()}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 space-y-2">
        {/* ROW 1: PRIMARY (PARENT / ALFA) NAVIGATION */}
        <div className="flex items-center justify-between gap-2">
          <nav
            aria-label="Navigasi Utama Platform"
            className="flex items-center gap-2 overflow-x-auto scrollbar-none py-0.5 min-w-0 flex-1"
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
        </div>

        {/* ROW 2: SECONDARY (CHILD / BRAVO) NAVIGATION */}
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

        {/* ROW 3: TERTIARY (GRANDCHILD / CHARLIE) NAVIGATION */}
        {currentChildGrandchildren.length > 0 && (
          <div className="pt-1.5 border-t border-violet-200/60 flex items-center gap-2 overflow-x-auto scrollbar-none animate-fadeIn bg-violet-50/40 rounded-xl px-2 py-1">
            <div className="flex items-center gap-1 text-[10.5px] font-extrabold text-violet-600 uppercase tracking-wider pl-1 shrink-0">
              <span>{activeChild?.name}</span>
              <ChevronRight className="w-3 h-3 text-violet-400" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 py-0.5">
              {currentChildGrandchildren.map((gc) => {
                const gcDeltas = deltasMap.get(gc.id) || [];
                const isGcActive = !isChildContainerViewing && activeGrandchild?.id === gc.id;

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

                    {gcDeltas.length > 0 && (
                      <span
                        className={`text-[9.5px] px-1.5 py-0.2 rounded-full font-bold ml-0.5 ${
                          isGcActive
                            ? 'bg-white/25 text-white'
                            : 'bg-violet-100 text-violet-700'
                        }`}
                      >
                        {gcDeltas.length}
                      </span>
                    )}

                    {isGcActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ROW 4: QUATERNARY (DELTA) NAVIGATION */}
        {currentGrandchildDeltas.length > 0 && (
          <div className="pt-1.5 border-t border-teal-200/60 flex items-center gap-2 overflow-x-auto scrollbar-none animate-fadeIn bg-teal-50/45 rounded-xl px-2 py-1">
            <div className="flex items-center gap-1 text-[10.5px] font-extrabold text-teal-700 uppercase tracking-wider pl-1 shrink-0">
              <span>{activeGrandchild?.name}</span>
              <ChevronRight className="w-3 h-3 text-teal-500" />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 py-0.5">
              {currentGrandchildDeltas.map((delta) => {
                const isDeltaActive = !isGrandchildContainerViewing && activeDelta?.id === delta.id;

                return (
                  <button
                    key={delta.id}
                    type="button"
                    onClick={() => handleDeltaClick(delta)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer border shrink-0 ${
                      isDeltaActive
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white border-teal-600 shadow-xs ring-2 ring-teal-300/40'
                        : 'bg-white/95 text-slate-700 hover:text-teal-700 hover:bg-teal-50/80 border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <span className="shrink-0">
                      {renderNavIcon(delta.icon, `w-3.5 h-3.5 ${isDeltaActive ? 'text-white' : 'text-teal-600'}`)}
                    </span>
                    <span>{delta.name}</span>
                    {isDeltaActive && (
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

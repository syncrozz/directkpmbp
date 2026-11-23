/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — UNIFIED GLOBAL SMART SEARCH COMPONENT
 * SYNCROZZ SES v4.5
 *
 * ONE PLATFORM. ONE SEARCH FIELD. ALL CONTENT DISCOVERABLE.
 * Single global search bar positioned directly below the main navigation bar,
 * discovering across:
 * 1. Directory Staff
 * 2. Jadual Pelajar
 * 3. Jadual Pensyarah
 * 4. Borang & Dokumen
 * 5. Procedure
 * 6. Other Platform Content
 */

import React, { useState, useMemo, useRef, useEffect, useId } from 'react';
import {
  Search,
  X,
  ChevronRight,
  ExternalLink,
  CornerDownLeft,
  FileSearch,
  Users,
  Calendar,
  GraduationCap,
  FileText,
  BookOpen,
  Layers,
  Globe,
  Loader2,
} from 'lucide-react';
import { NavigationItem, PlatformLink, Staff, StudentTimetable } from '../types';
import { renderNavIcon } from '../services/navigationService';
import { StaffAvatar } from './StaffAvatar';
import { getPlatformSiteName } from '../services/platformService';
import { getShortName } from '../utils/shortName';
import {
  buildGlobalSearchIndex,
  searchGlobalNavigation,
  buildPlatformLinkIndex,
  searchPlatformLinkIndex,
  buildStudentTimetableIndex,
  searchStudentTimetableIndex,
  buildLecturerTimetableIndex,
  searchLecturerTimetableIndex,
  rankStaffMatchesForDropdown,
  getHighlightSegments,
  resolveGlobalSearchTarget,
  GlobalSearchEntry,
  GlobalSearchContentType,
  GlobalNavResultGroup,
} from '../services/globalSearchService';

interface GlobalSmartSearchProps {
  items: NavigationItem[];
  query: string;
  onQueryChange: (value: string) => void;
  onClearSearch: () => void;
  onSelectDestination: (destination: string) => void;
  staffMatches?: Staff[];
  staffList?: Staff[];
  studentTimetables?: StudentTimetable[];
  availableLecturerIds?: Set<string>;
  platformLinks?: PlatformLink[];
  debouncedQuery?: string;
  isStaffSearching?: boolean;
  onSelectStaff?: (staff: Staff) => void;
  onSelectStudentTimetable?: (classCode: string) => void;
  onSelectLecturerTimetable?: (staffId: string) => void;
  className?: string;
}

const CONTENT_TYPE_BADGE_STYLES: Record<GlobalSearchContentType, string> = {
  PDF: 'bg-rose-50 text-rose-700 border-rose-200/80',
  Module: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  Link: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  Container: 'bg-amber-50 text-amber-800 border-amber-200/80',
};

const CONTENT_TYPE_ICON_BOX_STYLES: Record<GlobalSearchContentType, string> = {
  PDF: 'bg-rose-50 text-rose-600 border-rose-100',
  Module: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  Link: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  Container: 'bg-amber-50 text-amber-700 border-amber-100',
};

const HighlightedText: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  const segments = useMemo(() => getHighlightSegments(text, query), [text, query]);
  return (
    <>
      {segments.map((seg, idx) =>
        seg.matched ? (
          <mark
            key={idx}
            className="bg-amber-100/95 text-indigo-950 rounded-xs px-0.5 font-extrabold"
          >
            {seg.text}
          </mark>
        ) : (
          <React.Fragment key={idx}>{seg.text}</React.Fragment>
        )
      )}
    </>
  );
};

type SearchSectionId =
  | 'directory_staff'
  | 'jadual_pelajar'
  | 'jadual_pensyarah'
  | 'borang_dokumen'
  | 'procedure'
  | 'other_platform';

type FlattenedOption =
  | { kind: 'staff'; key: string; staff: Staff }
  | { kind: 'student_timetable'; key: string; timetable: StudentTimetable }
  | { kind: 'lecturer_timetable'; key: string; staff: Staff; staffId: string; shortName: string }
  | { kind: 'nav'; key: string; entry: GlobalSearchEntry }
  | { kind: 'platform'; key: string; platform: PlatformLink };

const CANONICAL_SECTION_ORDER: Record<SearchSectionId, number> = {
  directory_staff: 1,
  jadual_pelajar: 2,
  jadual_pensyarah: 3,
  borang_dokumen: 4,
  procedure: 5,
  other_platform: 6,
};

export const GlobalSmartSearch: React.FC<GlobalSmartSearchProps> = ({
  items,
  query,
  onQueryChange,
  onClearSearch,
  onSelectDestination,
  staffMatches = [],
  staffList = [],
  studentTimetables = [],
  availableLecturerIds,
  platformLinks = [],
  debouncedQuery = '',
  isStaffSearching = false,
  onSelectStaff,
  onSelectStudentTimetable,
  onSelectLecturerTimetable,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  // Reactive client-side search indices synced with authoritative sources
  const navSearchIndex = useMemo(() => buildGlobalSearchIndex(items), [items]);
  const studentTimetableIndex = useMemo(
    () => buildStudentTimetableIndex(studentTimetables),
    [studentTimetables]
  );
  const lecturerTimetableIndex = useMemo(
    () =>
      buildLecturerTimetableIndex(
        staffList,
        availableLecturerIds || new Set<string>()
      ),
    [staffList, availableLecturerIds]
  );
  const platformLinkIndex = useMemo(
    () => buildPlatformLinkIndex(platformLinks),
    [platformLinks]
  );

  const trimmedQuery = query.trim();
  const trimmedDebounced = debouncedQuery.trim();

  // Execute live instant matches for timetables, navigation, and platforms
  const studentTimetableResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return searchStudentTimetableIndex(studentTimetableIndex, trimmedQuery, 6);
  }, [studentTimetableIndex, trimmedQuery]);

  const lecturerTimetableResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return searchLecturerTimetableIndex(lecturerTimetableIndex, trimmedQuery, 6);
  }, [lecturerTimetableIndex, trimmedQuery]);

  const navResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return searchGlobalNavigation(navSearchIndex, trimmedQuery, 18);
  }, [navSearchIndex, trimmedQuery]);

  const platformResults = useMemo(() => {
    if (!trimmedQuery) return [];
    return searchPlatformLinkIndex(platformLinkIndex, trimmedQuery, 5);
  }, [platformLinkIndex, trimmedQuery]);

  // Directory Staff uses shared debounced staffMatches (unrestricted across entire directory)
  const dropdownStaffResults = useMemo(() => {
    if (!trimmedQuery || !trimmedDebounced) return [];
    return rankStaffMatchesForDropdown(staffMatches, trimmedDebounced, 6);
  }, [staffMatches, trimmedQuery, trimmedDebounced]);

  // Partition navigation results into SES v4.5 categories (4, 5, 6)
  const { borangDokumenNav, procedureNav, otherNav } = useMemo(() => {
    const grouped: Record<GlobalNavResultGroup, typeof navResults> = {
      borang_dokumen: [],
      procedure: [],
      other_platform: [],
    };
    for (const m of navResults) {
      grouped[m.entry.resultGroup].push(m);
    }
    return {
      borangDokumenNav: grouped.borang_dokumen.slice(0, 6),
      procedureNav: grouped.procedure.slice(0, 5),
      otherNav: grouped.other_platform.slice(0, 5),
    };
  }, [navResults]);

  // Order active sections logically (1..6), prioritizing any section that has an exact match (score >= 900)
  const orderedSections = useMemo<SearchSectionId[]>(() => {
    const candidates: Array<{ id: SearchSectionId; hasExact: boolean; count: number }> = [];

    const checkStaffExact = () => {
      if (dropdownStaffResults.length === 0) return false;
      const q = trimmedDebounced.toLowerCase();
      const qNoSpace = q.replace(/\s+/g, '');
      const top = dropdownStaffResults[0];
      const nama = (top.Nama || '').toLowerCase().trim();
      const shortName = getShortName(top.Nama).toLowerCase().trim();
      const namaPendek = String(top.NamaPendek || '').toLowerCase().trim();
      const id = String(top.ID || top.StaffID || top.staff_id || '').toLowerCase().trim();
      const plates = [top.PlatNo1, top.PlatNo2, top.PlatNo3, top.NoPlat]
        .filter(Boolean)
        .map((p) => String(p).toLowerCase().replace(/\s+/g, ''));
      return (
        nama === q ||
        shortName === q ||
        namaPendek === q ||
        id === q ||
        id === qNoSpace ||
        plates.some((p) => p === qNoSpace)
      );
    };

    if (dropdownStaffResults.length > 0) {
      candidates.push({
        id: 'directory_staff',
        hasExact: checkStaffExact(),
        count: dropdownStaffResults.length,
      });
    }
    if (studentTimetableResults.length > 0) {
      candidates.push({
        id: 'jadual_pelajar',
        hasExact: studentTimetableResults[0].score >= 900,
        count: studentTimetableResults.length,
      });
    }
    if (lecturerTimetableResults.length > 0) {
      candidates.push({
        id: 'jadual_pensyarah',
        hasExact: lecturerTimetableResults[0].score >= 900,
        count: lecturerTimetableResults.length,
      });
    }
    if (borangDokumenNav.length > 0) {
      candidates.push({
        id: 'borang_dokumen',
        hasExact: borangDokumenNav[0].score >= 900,
        count: borangDokumenNav.length,
      });
    }
    if (procedureNav.length > 0) {
      candidates.push({
        id: 'procedure',
        hasExact: procedureNav[0].score >= 900,
        count: procedureNav.length,
      });
    }
    if (otherNav.length > 0 || platformResults.length > 0) {
      const topOtherScore = Math.max(
        otherNav[0]?.score ?? 0,
        platformResults[0]?.score ?? 0
      );
      candidates.push({
        id: 'other_platform',
        hasExact: topOtherScore >= 900,
        count: otherNav.length + platformResults.length,
      });
    }

    candidates.sort((a, b) => {
      if (a.hasExact !== b.hasExact) return a.hasExact ? -1 : 1;
      return CANONICAL_SECTION_ORDER[a.id] - CANONICAL_SECTION_ORDER[b.id];
    });

    return candidates.map((c) => c.id);
  }, [
    dropdownStaffResults,
    trimmedDebounced,
    studentTimetableResults,
    lecturerTimetableResults,
    borangDokumenNav,
    procedureNav,
    otherNav,
    platformResults,
  ]);

  // Flatten options strictly in exact visual render order for keyboard navigation
  const flattenedOptions = useMemo<FlattenedOption[]>(() => {
    const opts: FlattenedOption[] = [];

    for (const sec of orderedSections) {
      if (sec === 'directory_staff') {
        for (const staff of dropdownStaffResults) {
          opts.push({
            kind: 'staff',
            key: `staff-${staff.ID || staff.StaffID || staff.Nama}`,
            staff,
          });
        }
      } else if (sec === 'jadual_pelajar') {
        for (const { timetable } of studentTimetableResults) {
          opts.push({
            kind: 'student_timetable',
            key: `student-tt-${timetable.classCode}`,
            timetable,
          });
        }
      } else if (sec === 'jadual_pensyarah') {
        for (const match of lecturerTimetableResults) {
          opts.push({
            kind: 'lecturer_timetable',
            key: `lecturer-tt-${match.staffId}`,
            staff: match.staff,
            staffId: match.staffId,
            shortName: match.shortName,
          });
        }
      } else if (sec === 'borang_dokumen') {
        for (const { entry } of borangDokumenNav) {
          opts.push({
            kind: 'nav',
            key: `nav-${entry.id}`,
            entry,
          });
        }
      } else if (sec === 'procedure') {
        for (const { entry } of procedureNav) {
          opts.push({
            kind: 'nav',
            key: `nav-${entry.id}`,
            entry,
          });
        }
      } else if (sec === 'other_platform') {
        for (const { entry } of otherNav) {
          opts.push({
            kind: 'nav',
            key: `nav-${entry.id}`,
            entry,
          });
        }
        for (const { platform } of platformResults) {
          opts.push({
            kind: 'platform',
            key: `platform-${platform.id}`,
            platform,
          });
        }
      }
    }

    return opts;
  }, [
    orderedSections,
    dropdownStaffResults,
    studentTimetableResults,
    lecturerTimetableResults,
    borangDokumenNav,
    procedureNav,
    otherNav,
    platformResults,
  ]);

  const showDropdown = isOpen && trimmedQuery.length > 0;

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmedQuery, flattenedOptions.length]);

  useEffect(() => {
    if (!showDropdown) return;
    const activeOption = optionRefs.current[highlightedIndex];
    if (activeOption && typeof activeOption.scrollIntoView === 'function') {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, showDropdown]);

  // Close dropdown on outside click while preserving active query for grid filters
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelectNavEntry = (entry: GlobalSearchEntry) => {
    const target = resolveGlobalSearchTarget(entry);
    setIsOpen(false);
    onClearSearch();
    inputRef.current?.blur();
    onSelectDestination(target);
  };

  const handleSelectStaffEntry = (staff: Staff) => {
    setIsOpen(false);
    inputRef.current?.blur();
    onSelectStaff?.(staff);
  };

  const handleSelectStudentClass = (classCode: string) => {
    setIsOpen(false);
    onClearSearch();
    inputRef.current?.blur();
    onSelectStudentTimetable?.(classCode);
  };

  const handleSelectLecturer = (staffId: string) => {
    setIsOpen(false);
    onClearSearch();
    inputRef.current?.blur();
    onSelectLecturerTimetable?.(staffId);
  };

  const handleSelectPlatformEntry = (platform: PlatformLink) => {
    setIsOpen(false);
    onClearSearch();
    inputRef.current?.blur();
    onSelectDestination(platform.url);
  };

  const handleActivateOption = (option: FlattenedOption) => {
    switch (option.kind) {
      case 'staff':
        handleSelectStaffEntry(option.staff);
        break;
      case 'student_timetable':
        handleSelectStudentClass(option.timetable.classCode);
        break;
      case 'lecturer_timetable':
        handleSelectLecturer(option.staffId);
        break;
      case 'nav':
        handleSelectNavEntry(option.entry);
        break;
      case 'platform':
        handleSelectPlatformEntry(option.platform);
        break;
    }
  };

  const handleClear = () => {
    onClearSearch();
    setHighlightedIndex(0);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      } else if (query) {
        e.preventDefault();
        onClearSearch();
      }
      return;
    }

    if (!trimmedQuery) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (flattenedOptions.length > 0) {
        setHighlightedIndex((prev) => (prev + 1) % flattenedOptions.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      if (flattenedOptions.length > 0) {
        setHighlightedIndex((prev) => (prev - 1 + flattenedOptions.length) % flattenedOptions.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      if (flattenedOptions.length > 0) {
        e.preventDefault();
        const chosen = flattenedOptions[highlightedIndex] || flattenedOptions[0];
        if (chosen) {
          handleActivateOption(chosen);
        }
      }
    }
  };

  const optionIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flattenedOptions.forEach((opt, idx) => map.set(opt.key, idx));
    return map;
  }, [flattenedOptions]);

  const activeDescendantId =
    showDropdown && flattenedOptions.length > 0 && flattenedOptions[highlightedIndex]
      ? `${listboxId}-option-${flattenedOptions[highlightedIndex].key}`
      : undefined;

  const renderNavSectionItems = (
    sectionTitle: string,
    sectionIcon: React.ReactNode,
    titleColorClass: string,
    list: typeof navResults,
    extraPlatforms: typeof platformResults = []
  ) => {
    const total = list.length + extraPlatforms.length;
    if (total === 0) return null;

    return (
      <div key={sectionTitle} className="p-1.5 space-y-0.5">
        <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span className={`text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${titleColorClass}`}>
            {sectionIcon}
            <span>{sectionTitle} ({total})</span>
          </span>
        </div>

        <div className="divide-y divide-slate-100/80 space-y-0.5">
          {list.map(({ entry }) => {
            const optKey = `nav-${entry.id}`;
            const flatIdx = optionIndexMap.get(optKey) ?? 0;
            const isHighlighted = flatIdx === highlightedIndex;

            return (
              <button
                key={optKey}
                id={`${listboxId}-option-${optKey}`}
                ref={(el) => {
                  optionRefs.current[flatIdx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightedIndex(flatIdx)}
                onClick={() => handleSelectNavEntry(entry)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-start gap-3 transition-all text-left cursor-pointer ${
                  isHighlighted
                    ? 'bg-indigo-50/90 ring-1 ring-indigo-200/90 shadow-2xs'
                    : 'hover:bg-slate-50/90'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
                    CONTENT_TYPE_ICON_BOX_STYLES[entry.contentType]
                  }`}
                >
                  {renderNavIcon(entry.item.icon, 'w-4 h-4')}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate leading-snug">
                      <HighlightedText text={entry.title} query={trimmedQuery} />
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 uppercase tracking-wide ${
                        CONTENT_TYPE_BADGE_STYLES[entry.contentType]
                      }`}
                    >
                      {entry.contentType}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 flex-wrap leading-tight">
                    {entry.hierarchyParts.map((part, partIdx) => (
                      <React.Fragment key={`${entry.id}-h-${partIdx}`}>
                        {partIdx > 0 && (
                          <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                        )}
                        <span
                          className={
                            partIdx === entry.hierarchyParts.length - 1
                              ? 'text-slate-700 font-bold'
                              : 'text-slate-500'
                          }
                        >
                          <HighlightedText text={part} query={trimmedQuery} />
                        </span>
                      </React.Fragment>
                    ))}
                    {entry.contentType === 'Link' && (
                      <ExternalLink className="w-3 h-3 text-emerald-600 ml-1 shrink-0" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {extraPlatforms.map(({ platform }) => {
            const optKey = `platform-${platform.id}`;
            const flatIdx = optionIndexMap.get(optKey) ?? 0;
            const isHighlighted = flatIdx === highlightedIndex;
            const siteName = getPlatformSiteName(platform);

            return (
              <button
                key={optKey}
                id={`${listboxId}-option-${optKey}`}
                ref={(el) => {
                  optionRefs.current[flatIdx] = el;
                }}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setHighlightedIndex(flatIdx)}
                onClick={() => handleSelectPlatformEntry(platform)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-start gap-3 transition-all text-left cursor-pointer ${
                  isHighlighted
                    ? 'bg-indigo-50/90 ring-1 ring-indigo-200/90 shadow-2xs'
                    : 'hover:bg-slate-50/90'
                }`}
              >
                <div className="w-8 h-8 rounded-xl border bg-emerald-50 text-emerald-600 border-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Globe className="w-4 h-4" />
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate leading-snug">
                      <HighlightedText text={platform.name} query={trimmedQuery} />
                    </span>

                    <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 uppercase tracking-wide bg-emerald-50 text-emerald-700 border-emerald-200/80">
                      Link
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 truncate">
                    <span>Rujukan Kolej</span>
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <span>Platform</span>
                    <ChevronRight className="w-3 h-3 text-slate-300 shrink-0" />
                    <span className="text-slate-700 font-bold truncate">{siteName}</span>
                    <ExternalLink className="w-3 h-3 text-emerald-600 ml-0.5 shrink-0" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSection = (sectionId: SearchSectionId) => {
    if (sectionId === 'directory_staff') {
      const totalCount = staffMatches.length;
      return (
        <div key="directory_staff" className="p-1.5 space-y-0.5">
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
              <Users className="w-3 h-3 text-indigo-500" />
              <span>Directory Staff {totalCount}</span>
            </span>
            {totalCount > dropdownStaffResults.length && (
              <span className="text-[10px] font-semibold text-slate-400">
                Papar {dropdownStaffResults.length} teratas
              </span>
            )}
          </div>

          <div className="divide-y divide-slate-100/80 space-y-0.5">
            {dropdownStaffResults.map((staff) => {
              const optKey = `staff-${staff.ID || staff.StaffID || staff.Nama}`;
              const flatIdx = optionIndexMap.get(optKey) ?? 0;
              const isHighlighted = flatIdx === highlightedIndex;
              const dept = staff.DepartmentID || staff.Unit || staff.Bahagian || '';
              const grade = staff.Gred || staff.grade || '';
              const staffId = String(staff.ID || staff.StaffID || staff.staff_id || '').trim();

              return (
                <button
                  key={optKey}
                  id={`${listboxId}-option-${optKey}`}
                  ref={(el) => {
                    optionRefs.current[flatIdx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(flatIdx)}
                  onClick={() => handleSelectStaffEntry(staff)}
                  className={`w-full px-3 py-2 rounded-xl flex items-center gap-3 transition-all text-left cursor-pointer ${
                    isHighlighted
                      ? 'bg-indigo-50/90 ring-1 ring-indigo-200/90 shadow-2xs'
                      : 'hover:bg-slate-50/90'
                  }`}
                >
                  <StaffAvatar
                    staff={staff}
                    sizeClassName="w-8 h-8"
                    textSizeClassName="text-[11px]"
                    ringClassName="ring-1 ring-indigo-200/70"
                  />

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate leading-snug">
                        <HighlightedText text={staff.Nama} query={trimmedQuery} />
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 uppercase tracking-wide bg-sky-50 text-sky-700 border-sky-200/80">
                        Staf
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
                      {staffId && (
                        <span className="font-mono text-slate-600 font-bold shrink-0">
                          <HighlightedText text={staffId} query={trimmedQuery} />
                        </span>
                      )}
                      {staff.Jawatan && (
                        <>
                          {staffId && <span className="text-slate-300">•</span>}
                          <span className="truncate text-slate-600">
                            <HighlightedText text={staff.Jawatan} query={trimmedQuery} />
                          </span>
                        </>
                      )}
                      {dept && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="truncate">
                            <HighlightedText text={dept} query={trimmedQuery} />
                          </span>
                        </>
                      )}
                      {grade && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-mono text-indigo-700 font-bold shrink-0">
                            <HighlightedText text={grade} query={trimmedQuery} />
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (sectionId === 'jadual_pelajar') {
      return (
        <div key="jadual_pelajar" className="p-1.5 space-y-0.5">
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
              <Calendar className="w-3 h-3 text-amber-600" />
              <span>Jadual Pelajar {studentTimetableResults.length}</span>
            </span>
          </div>

          <div className="divide-y divide-slate-100/80 space-y-0.5">
            {studentTimetableResults.map(({ timetable }) => {
              const optKey = `student-tt-${timetable.classCode}`;
              const flatIdx = optionIndexMap.get(optKey) ?? 0;
              const isHighlighted = flatIdx === highlightedIndex;

              return (
                <button
                  key={optKey}
                  id={`${listboxId}-option-${optKey}`}
                  ref={(el) => {
                    optionRefs.current[flatIdx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(flatIdx)}
                  onClick={() => handleSelectStudentClass(timetable.classCode)}
                  className={`w-full px-3 py-2 rounded-xl flex items-center gap-3 transition-all text-left cursor-pointer ${
                    isHighlighted
                      ? 'bg-indigo-50/90 ring-1 ring-indigo-200/90 shadow-2xs'
                      : 'hover:bg-slate-50/90'
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl border bg-amber-50 text-amber-700 border-amber-200/80 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs sm:text-[13px] font-black text-slate-900 truncate leading-snug">
                        <HighlightedText text={timetable.classCode} query={trimmedQuery} />
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 uppercase tracking-wide bg-amber-50 text-amber-800 border-amber-200/80">
                        Jadual Pelajar
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
                      <span>Jadual Waktu Kelas</span>
                      {timetable.program && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-slate-700">{timetable.program}</span>
                        </>
                      )}
                      {timetable.semester && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span>{timetable.semester}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (sectionId === 'jadual_pensyarah') {
      return (
        <div key="jadual_pensyarah" className="p-1.5 space-y-0.5">
          <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <GraduationCap className="w-3 h-3 text-rose-600" />
              <span>Jadual Pensyarah {lecturerTimetableResults.length}</span>
            </span>
          </div>

          <div className="divide-y divide-slate-100/80 space-y-0.5">
            {lecturerTimetableResults.map((match) => {
              const optKey = `lecturer-tt-${match.staffId}`;
              const flatIdx = optionIndexMap.get(optKey) ?? 0;
              const isHighlighted = flatIdx === highlightedIndex;
              const dept = match.staff.DepartmentID || match.staff.Unit || 'Akademik';

              return (
                <button
                  key={optKey}
                  id={`${listboxId}-option-${optKey}`}
                  ref={(el) => {
                    optionRefs.current[flatIdx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isHighlighted}
                  onMouseEnter={() => setHighlightedIndex(flatIdx)}
                  onClick={() => handleSelectLecturer(match.staffId)}
                  className={`w-full px-3 py-2 rounded-xl flex items-center gap-3 transition-all text-left cursor-pointer ${
                    isHighlighted
                      ? 'bg-indigo-50/90 ring-1 ring-indigo-200/90 shadow-2xs'
                      : 'hover:bg-slate-50/90'
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl border bg-rose-50 text-rose-600 border-rose-200/80 flex items-center justify-center shrink-0">
                    <GraduationCap className="w-4 h-4" />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-[13px] font-extrabold text-slate-900 truncate leading-snug">
                        <HighlightedText text={match.staff.Nama} query={trimmedQuery} />
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 uppercase tracking-wide bg-rose-50 text-rose-700 border-rose-200/80">
                        Jadual Pensyarah
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 truncate">
                      <span className="font-mono font-bold text-rose-700 shrink-0">
                        <HighlightedText text={match.staffId} query={trimmedQuery} />
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate text-slate-600">{match.shortName}</span>
                      <span className="text-slate-300">•</span>
                      <span className="truncate">{dept}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (sectionId === 'borang_dokumen') {
      return renderNavSectionItems(
        'Borang & Dokumen',
        <FileText className="w-3 h-3 text-rose-600" />,
        'text-rose-700',
        borangDokumenNav
      );
    }

    if (sectionId === 'procedure') {
      return renderNavSectionItems(
        'Procedure',
        <BookOpen className="w-3 h-3 text-emerald-600" />,
        'text-emerald-700',
        procedureNav
      );
    }

    return renderNavSectionItems(
      'Kandungan Platform Lain',
      <Layers className="w-3 h-3 text-slate-600" />,
      'text-slate-700',
      otherNav,
      platformResults
    );
  };

  const hasAnyResults = flattenedOptions.length > 0;
  const waitingForStaffDebounce = isStaffSearching && trimmedQuery !== trimmedDebounced;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Single Platform-Wide Global Smart Search Input */}
      <div className="relative flex items-center">
        <Search
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 pointer-events-none shrink-0"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onClick={() => {
            if (trimmedQuery && !isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            if (trimmedQuery) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Cari nama staf, kod kelas, pensyarah, borang, dokumen atau maklumat..."
          aria-label="Carian pintar global direktori, jadual dan platform"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          className="w-full pl-11 pr-10 py-2.5 sm:py-3 bg-white/95 hover:bg-white border border-indigo-200/80 rounded-2xl text-xs sm:text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none transition-all shadow-xs"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            title="Padam carian"
            aria-label="Padam carian"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Unified Classified Dropdown Results Overlay */}
      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Hasil carian pintar global"
          className="absolute left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl border border-indigo-100/90 rounded-2xl shadow-2xl z-50 overflow-hidden text-left"
        >
          {hasAnyResults ? (
            <>
              <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
                <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <span>Hasil Carian Global {flattenedOptions.length}</span>
                  {waitingForStaffDebounce && (
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                  )}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                  <CornerDownLeft className="w-3 h-3" />
                  <span>Enter untuk buka</span>
                </span>
              </div>

              <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100">
                {orderedSections.map((secId) => renderSection(secId))}
              </div>
            </>
          ) : waitingForStaffDebounce ? (
            <div className="p-6 text-center space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                Mencari dalam direktori, jadual & platform...
              </p>
            </div>
          ) : (
            <div className="p-6 text-center space-y-2">
              <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200/80 text-slate-400 flex items-center justify-center mx-auto">
                <FileSearch className="w-5 h-5" />
              </div>
              <p className="text-xs font-extrabold text-slate-800">Tiada hasil carian</p>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Tiada staf, jadual, borang, dokumen, prosedur atau modul sepadan dengan{' '}
                <span className="font-bold text-slate-700">"{trimmedQuery}"</span>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

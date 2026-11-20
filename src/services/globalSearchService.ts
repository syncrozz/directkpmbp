/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — UNIFIED GLOBAL SMART SEARCH SERVICE
 * SYNCROZZ SES v4.5
 *
 * Builds lightweight, reactive client-side search indices from authoritative
 * platform data sources:
 * 1. Directory Staff (staffList + isAdminMode IC gate)
 * 2. Student Timetables (fetchStudentTimetables)
 * 3. Lecturer Timetables (verified availableIds + staffList)
 * 4. Navigation Items (Borang & Dokumen, Procedure, Other Platform Content)
 * 5. External Platform Links (subscribeToPlatformLinks)
 */

import { NavigationItem, PlatformLink, Staff, StudentTimetable } from '../types';
import { getHierarchicalPath, getHierarchicalSlug, slugify } from './navigationService';
import { parseTakwimLink } from './takwimService';
import { getDistrictState } from '../utils/stateMapping';
import { formatIC, cleanIC } from '../utils/icFormatter';
import { getShortName } from '../utils/shortName';

export type GlobalSearchContentType = 'PDF' | 'Module' | 'Link' | 'Container';
export type GlobalNavResultGroup = 'borang_dokumen' | 'procedure' | 'other_platform';

export interface GlobalSearchEntry {
  id: string;
  item: NavigationItem;
  title: string;
  secondaryTitle?: string;
  contentType: GlobalSearchContentType;
  resultGroup: GlobalNavResultGroup;
  hierarchyParts: string[];
  hierarchyLabel: string;
  canonicalPath: string;
  hierarchicalSlug: string;
  navigationTarget: string;
  sourceFileName?: string;
  normalizedTitle: string;
  normalizedSecondaryTitle: string;
  normalizedSlug: string;
  normalizedSourceFile: string;
  normalizedKeywords: string;
  normalizedHierarchy: string;
  compactText: string;
}

export interface GlobalSearchMatch {
  entry: GlobalSearchEntry;
  score: number;
}

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

/**
 * Bidirectional Malay <-> English domain synonym groups for navigation & campus document search.
 */
const KEYWORD_VARIATION_GROUPS: string[][] = [
  ['borang', 'form', 'forms', 'permohonan'],
  ['prosedur', 'procedure', 'procedures', 'tatacara', 'sop', 'garis', 'panduan'],
  ['jadual', 'timetable', 'timetables', 'schedule', 'waktu'],
  ['pelajar', 'student', 'students', 'murid'],
  ['pensyarah', 'lecturer', 'lecturers', 'pengajar'],
  ['kakitangan', 'staf', 'staff', 'direktori', 'directory', 'pekerja'],
  ['rujukan', 'reference', 'references'],
  ['dokumen', 'document', 'documents', 'pdf', 'fail', 'file'],
  ['lampiran', 'appendix', 'attachment'],
  ['pendaftaran', 'daftar', 'register', 'registration'],
  ['peperiksaan', 'exam', 'exams', 'ujian', 'test'],
  ['gred', 'grading', 'grade', 'markah'],
  ['takwim', 'calendar', 'kalendar'],
  ['platform', 'portal', 'aplikasi', 'app', 'sistem', 'system', 'pautan', 'link'],
  ['kewangan', 'bayaran', 'payment', 'claim', 'tuntutan'],
  ['penceramah', 'speaker', 'ceramah'],
  ['bekas', 'container', 'folder', 'arkib', 'archive'],
];

const SYNONYM_LOOKUP: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const group of KEYWORD_VARIATION_GROUPS) {
    for (const term of group) {
      const existing = map.get(term) || [];
      for (const peer of group) {
        if (peer !== term && !existing.includes(peer)) {
          existing.push(peer);
        }
      }
      map.set(term, existing);
    }
  }
  return map;
})();

export function normalizeSearchText(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[_/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactSearchText(value?: string | null): string {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

/**
 * Normalizes class codes / staff IDs by stripping spaces, hyphens, underscores, dots, slashes.
 * e.g. "DIA 4A", "dia-4a", "DIA4A" -> "dia4a"
 */
export function normalizeCompactCode(value?: string | null): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .replace(/[\s\-_./]+/g, '')
    .trim();
}

function isExternalHttpUrl(value?: string): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value.trim());
}

/**
 * Resolves the ancestor chain (Parent -> Child -> Grandchild -> Delta) and verifies
 * that the item and every ancestor are active and cycle-free.
 */
function resolveActiveAncestors(
  item: NavigationItem,
  byId: Map<string, NavigationItem>
): NavigationItem[] | null {
  if (item.isActive !== true) return null;

  const chain: NavigationItem[] = [item];
  const visited = new Set<string>([item.id]);
  let currentParentId = item.parentId;

  while (currentParentId) {
    if (visited.has(currentParentId)) {
      return null;
    }
    visited.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent || parent.isActive !== true) {
      return null;
    }
    chain.unshift(parent);
    currentParentId = parent.parentId;
  }

  if (
    (item.type === 'child' || item.type === 'grandchild' || item.type === 'delta') &&
    chain[0]?.type !== 'parent'
  ) {
    return null;
  }

  return chain;
}

/**
 * Classifies a NavigationItem into one of the four UI badge types:
 * PDF | Module | Link | Container
 */
export function classifyNavigationContentType(
  item: NavigationItem,
  allItems: NavigationItem[]
): GlobalSearchContentType {
  if (item.displayType === 'empty_page') {
    return 'Container';
  }

  if (item.displayType === 'drive' || Boolean(item.driveUrl?.trim())) {
    return 'PDF';
  }

  if (isExternalHttpUrl(item.destination)) {
    const parsed = parseTakwimLink(item.destination);
    if (parsed && (parsed.kind === 'drive-file' || parsed.kind === 'drive-folder')) {
      return 'PDF';
    }
    return 'Link';
  }

  const hasActiveChildren = allItems.some(
    (other) => other.parentId === item.id && other.isActive === true
  );
  if ((item.type === 'child' || item.type === 'grandchild') && hasActiveChildren && item.destination === item.id) {
    return 'Container';
  }

  return 'Module';
}

/**
 * Classifies an active navigation entry into the SES v4.5 result taxonomy:
 * 4. Borang & Dokumen | 5. Procedure | 6. Other Platform Content
 */
export function classifyNavigationGroup(
  item: NavigationItem,
  hierarchyParts: string[],
  contentType: GlobalSearchContentType
): GlobalNavResultGroup {
  const combined = normalizeSearchText(
    [item.id, item.name, item.displayTitle, item.slug, item.destination, ...hierarchyParts]
      .filter(Boolean)
      .join(' ')
  );

  // Check Procedure first so procedure PDFs / sub-pages group under Procedure cleanly
  if (/\b(procedure|prosedur|sop|tatacara|garis panduan)\b/.test(combined)) {
    return 'procedure';
  }

  // Forms, UPPK, appendices, calendars, and PDF Drive documents group under Borang & Dokumen
  if (
    contentType === 'PDF' ||
    /\b(borang|lampiran|form|forms|dokumen|uppk|uppk2|takwim)\b/.test(combined)
  ) {
    return 'borang_dokumen';
  }

  return 'other_platform';
}

/**
 * Resolves the exact navigation argument to pass to App's existing `handleSelectDestination`.
 */
export function resolveGlobalSearchTarget(entry: GlobalSearchEntry): string {
  if (entry.contentType === 'Link' && isExternalHttpUrl(entry.item.destination)) {
    return entry.item.destination.trim();
  }
  return entry.item.id || entry.item.destination;
}

/**
 * Builds the global client-side search index from active, reachable NavigationItems.
 */
export function buildGlobalSearchIndex(items: NavigationItem[]): GlobalSearchEntry[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const byId = new Map<string, NavigationItem>();
  items.forEach((item) => {
    if (item && item.id) {
      byId.set(item.id, item);
    }
  });

  const entries: GlobalSearchEntry[] = [];
  const seenIds = new Set<string>();
  const seenCompositeKeys = new Set<string>();

  for (const item of items) {
    if (!item || !item.id || seenIds.has(item.id)) continue;

    const hasDestination = Boolean((item.destination || '').trim());
    const hasDrive = Boolean((item.driveUrl || '').trim());
    if (!hasDestination && !hasDrive && item.displayType !== 'empty_page') {
      continue;
    }

    const chain = resolveActiveAncestors(item, byId);
    if (!chain) continue;

    seenIds.add(item.id);

    const contentType = classifyNavigationContentType(item, items);
    const title = (item.displayTitle || item.name || '').trim() || item.name;
    const secondaryTitle =
      item.displayTitle && item.displayTitle.trim() && item.displayTitle.trim() !== item.name.trim()
        ? item.name.trim()
        : undefined;

    const hierarchyParts = chain.map((node) => node.name.trim()).filter(Boolean);
    const hierarchyLabel = hierarchyParts.join(' / ');
    const hierarchicalSlug = getHierarchicalSlug(item, items);
    const canonicalPath = getHierarchicalPath(item, items);
    const navigationTarget =
      contentType === 'Link' && isExternalHttpUrl(item.destination)
        ? item.destination.trim()
        : item.id || item.destination;

    const compositeKey = `${normalizeSearchText(title)}::${normalizeSearchText(hierarchyLabel)}::${navigationTarget}`;
    if (seenCompositeKeys.has(compositeKey)) continue;
    seenCompositeKeys.add(compositeKey);

    const resultGroup = classifyNavigationGroup(item, hierarchyParts, contentType);
    const sourceFileName = item.sourceFileMetadata?.fileName?.trim() || undefined;
    const rawKeywords = [
      ...(Array.isArray(item.keywords) ? item.keywords : []),
      item.searchableKeywords,
      item.sourceFileMetadata?.mimeType,
      contentType === 'PDF' ? 'pdf dokumen google drive' : '',
      contentType === 'Container' ? 'container bekas' : '',
      contentType === 'Link' ? 'pautan link' : '',
      contentType === 'Module' ? 'modul' : '',
    ]
      .filter(Boolean)
      .join(' ');

    const slugText = [item.slug, slugify(item.name), hierarchicalSlug].filter(Boolean).join(' ');

    const normalizedTitle = normalizeSearchText(title);
    const normalizedSecondaryTitle = normalizeSearchText(secondaryTitle);
    const normalizedSlug = normalizeSearchText(slugText);
    const normalizedSourceFile = normalizeSearchText(sourceFileName);
    const normalizedKeywords = normalizeSearchText(rawKeywords);
    const normalizedHierarchy = normalizeSearchText(hierarchyLabel);

    const compactText = compactSearchText(
      [title, secondaryTitle, slugText, sourceFileName, rawKeywords, hierarchyLabel]
        .filter(Boolean)
        .join(' ')
    );

    entries.push({
      id: item.id,
      item,
      title,
      secondaryTitle,
      contentType,
      resultGroup,
      hierarchyParts,
      hierarchyLabel,
      canonicalPath,
      hierarchicalSlug,
      navigationTarget,
      sourceFileName,
      normalizedTitle,
      normalizedSecondaryTitle,
      normalizedSlug,
      normalizedSourceFile,
      normalizedKeywords,
      normalizedHierarchy,
      compactText,
    });
  }

  return entries;
}

function containsWholeWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystack);
}

/**
 * Searches the global navigation index using case-insensitive, partial-word,
 * multi-token, and Malay/English synonym matching, ranking exact title matches first.
 */
export function searchGlobalNavigation(
  index: GlobalSearchEntry[],
  rawQuery: string,
  limit = 20
): GlobalSearchMatch[] {
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return [];

  const compactQuery = normalizedQuery.replace(/\s+/g, '');
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);

  const results: GlobalSearchMatch[] = [];

  for (const entry of index) {
    const combinedText = [
      entry.normalizedTitle,
      entry.normalizedSecondaryTitle,
      entry.normalizedSlug,
      entry.normalizedSourceFile,
      entry.normalizedKeywords,
      entry.normalizedHierarchy,
    ]
      .filter(Boolean)
      .join(' ');

    let allTokensMatched = true;
    let usedSynonymOnly = false;
    let tokenScore = 0;

    for (const token of queryTokens) {
      const isSingleChar = token.length === 1;
      const directMatch = isSingleChar
        ? containsWholeWord(combinedText, token)
        : combinedText.includes(token) || entry.compactText.includes(token);
      if (directMatch) {
        if (entry.normalizedTitle === token) {
          tokenScore += 220;
        } else if (!isSingleChar && entry.normalizedTitle.startsWith(token)) {
          tokenScore += 150;
        } else if (containsWholeWord(entry.normalizedTitle, token)) {
          tokenScore += 120;
        } else if (!isSingleChar && entry.normalizedTitle.includes(token)) {
          tokenScore += 95;
        } else if (
          isSingleChar
            ? containsWholeWord(entry.normalizedSecondaryTitle, token)
            : entry.normalizedSecondaryTitle.includes(token)
        ) {
          tokenScore += 80;
        } else if (
          isSingleChar
            ? containsWholeWord(entry.normalizedSlug, token) || containsWholeWord(entry.normalizedSourceFile, token)
            : entry.normalizedSlug.includes(token) || entry.normalizedSourceFile.includes(token)
        ) {
          tokenScore += 65;
        } else if (
          isSingleChar
            ? containsWholeWord(entry.normalizedKeywords, token)
            : entry.normalizedKeywords.includes(token)
        ) {
          tokenScore += 55;
        } else {
          tokenScore += 40;
        }
        continue;
      }

      const variations = isSingleChar ? [] : SYNONYM_LOOKUP.get(token) || [];
      const matchedVariation = variations.find(
        (v) => combinedText.includes(v) || entry.compactText.includes(v)
      );

      if (matchedVariation) {
        usedSynonymOnly = true;
        if (entry.normalizedTitle.includes(matchedVariation)) {
          tokenScore += 50;
        } else {
          tokenScore += 25;
        }
      } else {
        allTokensMatched = false;
        break;
      }
    }

    if (!allTokensMatched && compactQuery.length >= 2 && entry.compactText.includes(compactQuery)) {
      allTokensMatched = true;
      tokenScore += 70;
    }

    if (!allTokensMatched) continue;

    let score = tokenScore;
    if (entry.normalizedTitle === normalizedQuery || compactSearchText(entry.title) === compactQuery) {
      score += 1000;
    } else if (
      entry.normalizedSecondaryTitle === normalizedQuery ||
      compactSearchText(entry.secondaryTitle) === compactQuery
    ) {
      score += 900;
    } else if (entry.normalizedTitle.startsWith(normalizedQuery)) {
      score += 600;
    } else if (containsWholeWord(entry.normalizedTitle, normalizedQuery)) {
      score += 450;
    } else if (entry.normalizedTitle.includes(normalizedQuery)) {
      score += 320;
    } else if (entry.normalizedSlug.includes(normalizedQuery) || entry.normalizedSourceFile.includes(normalizedQuery)) {
      score += 180;
    } else if (entry.normalizedHierarchy.includes(normalizedQuery)) {
      score += 100;
    }

    if (usedSynonymOnly) {
      score -= 40;
    }

    if (entry.item.type === 'delta') score += 10;
    else if (entry.item.type === 'grandchild') score += 8;
    else if (entry.item.type === 'child') score += 4;

    results.push({ entry, score });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.entry.item.order !== b.entry.item.order) {
      return a.entry.item.order - b.entry.item.order;
    }
    return a.entry.title.localeCompare(b.entry.title);
  });

  return limit > 0 ? results.slice(0, limit) : results;
}

/**
 * External Platform Links search index (from /platforms/directkpmbp/platformLinks).
 * Only active public-visible platform records are indexed.
 */
export interface PlatformLinkSearchEntry {
  platform: PlatformLink;
  normalizedName: string;
  normalizedSite: string;
  normalizedDesc: string;
  combinedText: string;
}

export interface PlatformLinkSearchMatch {
  platform: PlatformLink;
  score: number;
}

export function buildPlatformLinkIndex(platforms: PlatformLink[]): PlatformLinkSearchEntry[] {
  if (!Array.isArray(platforms) || platforms.length === 0) return [];
  return platforms
    .filter((p) => p && p.isActive !== false && Boolean(p.url?.trim()))
    .map((platform) => {
      const normalizedName = normalizeSearchText(platform.name);
      const normalizedSite = normalizeSearchText(platform.detectedMeta?.ogSiteName || platform.url);
      const normalizedDesc = normalizeSearchText(platform.description);
      return {
        platform,
        normalizedName,
        normalizedSite,
        normalizedDesc,
        combinedText: [normalizedName, normalizedSite, normalizedDesc].filter(Boolean).join(' '),
      };
    });
}

export function searchPlatformLinkIndex(
  index: PlatformLinkSearchEntry[],
  rawQuery: string,
  limit = 6
): PlatformLinkSearchMatch[] {
  const q = normalizeSearchText(rawQuery);
  if (!q || index.length === 0) return [];
  const tokens = q.split(' ').filter(Boolean);

  const matches: PlatformLinkSearchMatch[] = [];
  for (const entry of index) {
    const isSingleChar = q.length === 1;
    const allMatch = tokens.every((t) =>
      t.length === 1 ? containsWholeWord(entry.combinedText, t) : entry.combinedText.includes(t)
    );
    if (!allMatch) continue;

    let score = 0;
    if (entry.normalizedName === q) score += 1000;
    else if (!isSingleChar && entry.normalizedName.startsWith(q)) score += 600;
    else if (containsWholeWord(entry.normalizedName, q)) score += 450;
    else if (!isSingleChar && entry.normalizedName.includes(q)) score += 300;
    else if (entry.normalizedSite.includes(q)) score += 180;
    else score += 90;

    matches.push({ platform: entry.platform, score });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.platform.sortOrder ?? 0) - (b.platform.sortOrder ?? 0);
  });

  return limit > 0 ? matches.slice(0, limit) : matches;
}

/**
 * Splits display text into highlighted / non-highlighted segments for safe React rendering.
 */
export function getHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  if (!text) return [];
  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) return [{ text, matched: false }];

  const tokens = Array.from(
    new Set(
      normalizedQuery
        .split(' ')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    )
  ).sort((a, b) => b.length - a.length);

  if (tokens.length === 0) return [{ text, matched: false }];

  const escapedTokens = tokens.map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return t.length === 1 ? `\\b${escaped}\\b` : escaped;
  });
  const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');

  const parts = text.split(regex);
  if (parts.length <= 1) return [{ text, matched: false }];

  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));
  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      matched: tokenSet.has(part.toLowerCase()),
    }));
}

export interface StaffSearchEntry {
  staff: Staff;
  searchableText: string;
  platesNoSpace: string[];
}

/**
 * Builds the pre-computed Staff search index matching the 17 official columns,
 * short names, vehicle plates, district/state mapping, and Admin-only IC fields.
 */
export function buildStaffSearchIndex(
  staffList: Staff[],
  isAdminMode: boolean
): StaffSearchEntry[] {
  if (!Array.isArray(staffList) || staffList.length === 0) return [];

  return staffList.map((staff) => {
    const district = String(staff.DaerahAsal || '');
    const state = getDistrictState(district);

    const allPlates = [
      staff.PlatNo1,
      staff.PlatNo2,
      staff.PlatNo3,
      staff.NoPlat,
    ].filter(Boolean) as string[];

    const platesNormalized = allPlates.map((p) => String(p).toLowerCase().trim());
    const platesNoSpace = allPlates.map((p) => String(p).toLowerCase().replace(/\s+/g, ''));

    const shortName = getShortName(staff.Nama);

    const searchableText = [
      staff.Nama,
      shortName,
      staff.NamaPendek,
      staff.StaffID,
      staff.ID,
      staff.staff_id,
      staff.Kategori,
      staff.Bahagian,
      staff.Jawatan,
      staff.Unit,
      staff.DepartmentID,
      staff.Gred,
      staff.grade,
      staff.Email,
      staff.Telefon,
      staff.Sambungan,
      ...platesNormalized,
      ...platesNoSpace,
      staff.TahunLahir,
      staff['Tahun Lahir'],
      district,
      state,
      staff.Kelulusan,
      staff.Pengkhususan,
      ...(isAdminMode && (staff.IC || staff.NoKP)
        ? [formatIC(staff.IC || staff.NoKP), cleanIC(staff.IC || staff.NoKP)]
        : []),
    ]
      .filter(Boolean)
      .map((val) => String(val).toLowerCase().trim())
      .join(' ');

    return {
      staff,
      searchableText,
      platesNoSpace,
    };
  });
}

/**
 * Filters the pre-computed Staff index using the unified debounced search query.
 * Preserves Directory Staff matching semantics (phrase, compact plate/ID, and multi-token AND).
 */
export function searchStaffIndex(
  indexedStaffList: StaffSearchEntry[],
  rawQuery: string
): Staff[] {
  const q = rawQuery.toLowerCase().trim();
  if (!q) {
    return indexedStaffList.map((entry) => entry.staff);
  }

  const qNoSpace = q.replace(/\s+/g, '');
  const tokens = q.split(/\s+/).filter(Boolean);

  return indexedStaffList
    .filter(({ searchableText, platesNoSpace }) => {
      if (
        searchableText.includes(q) ||
        searchableText.includes(qNoSpace) ||
        platesNoSpace.some((plate) => plate.includes(qNoSpace))
      ) {
        return true;
      }
      if (tokens.length > 1) {
        return tokens.every((token) => searchableText.includes(token));
      }
      return false;
    })
    .map((entry) => entry.staff);
}

/**
 * Ranks already-matched Staff results for compact Global Smart Search dropdown display
 * (exact/prefix name, short name, ID, plate, or grade matches rank above broader field matches).
 */
export function rankStaffMatchesForDropdown(
  matchedStaff: Staff[],
  rawQuery: string,
  limit = 6
): Staff[] {
  const q = rawQuery.toLowerCase().trim();
  if (!q || matchedStaff.length === 0) return [];
  const qNoSpace = q.replace(/\s+/g, '');

  const scored = matchedStaff.map((staff) => {
    const nama = String(staff.Nama || '').toLowerCase().trim();
    const shortName = getShortName(staff.Nama).toLowerCase().trim();
    const namaPendek = String(staff.NamaPendek || '').toLowerCase().trim();
    const id = String(staff.ID || staff.StaffID || staff.staff_id || '').toLowerCase().trim();
    const gred = String(staff.Gred || staff.grade || '').toLowerCase().trim();
    const jawatan = String(staff.Jawatan || '').toLowerCase().trim();
    const unit = String(staff.Unit || staff.DepartmentID || '').toLowerCase().trim();
    const plates = [staff.PlatNo1, staff.PlatNo2, staff.PlatNo3, staff.NoPlat]
      .filter(Boolean)
      .map((p) => String(p).toLowerCase().replace(/\s+/g, ''));

    let score = 0;
    if (nama === q || shortName === q || namaPendek === q || id === q || id === qNoSpace) score += 1000;
    else if (nama.startsWith(q) || shortName.startsWith(q) || namaPendek.startsWith(q)) score += 700;
    else if (nama.includes(q) || shortName.includes(q) || namaPendek.includes(q)) score += 500;

    if (plates.some((p) => p === qNoSpace)) score += 900;
    else if (plates.some((p) => p.includes(qNoSpace))) score += 450;

    if (gred === q) score += 600;
    else if (gred.includes(q)) score += 320;

    if (jawatan.includes(q)) score += 260;
    if (unit.includes(q)) score += 220;

    return { staff, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.staff.Nama || '').localeCompare(String(b.staff.Nama || ''));
  });

  return limit > 0 ? scored.slice(0, limit).map((s) => s.staff) : scored.map((s) => s.staff);
}

/**
 * Student Timetable Search Index (from authoritative fetchStudentTimetables records).
 * Never invents class codes or timetable records.
 */
export interface StudentTimetableSearchEntry {
  timetable: StudentTimetable;
  compactCode: string;
  normalizedProgram: string;
  normalizedSemester: string;
  normalizedFileName: string;
}

export interface StudentTimetableSearchMatch {
  timetable: StudentTimetable;
  score: number;
}

export function buildStudentTimetableIndex(
  timetables: StudentTimetable[]
): StudentTimetableSearchEntry[] {
  if (!Array.isArray(timetables) || timetables.length === 0) return [];

  const seenCodes = new Set<string>();
  const entries: StudentTimetableSearchEntry[] = [];

  for (const timetable of timetables) {
    if (!timetable || !timetable.classCode) continue;
    const compactCode = normalizeCompactCode(timetable.classCode);
    if (!compactCode || seenCodes.has(compactCode)) continue;
    seenCodes.add(compactCode);

    entries.push({
      timetable,
      compactCode,
      normalizedProgram: normalizeSearchText(timetable.program),
      normalizedSemester: normalizeSearchText(timetable.semester),
      normalizedFileName: normalizeSearchText(timetable.fileName),
    });
  }

  return entries;
}

export function searchStudentTimetableIndex(
  index: StudentTimetableSearchEntry[],
  rawQuery: string,
  limit = 6
): StudentTimetableSearchMatch[] {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const compactQuery = normalizeCompactCode(rawQuery);
  if (!compactQuery || index.length === 0) return [];

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const results: StudentTimetableSearchMatch[] = [];

  for (const entry of index) {
    let score = 0;

    if (entry.compactCode === compactQuery) {
      score = 1000;
    } else if (compactQuery.length >= 2 && entry.compactCode.startsWith(compactQuery)) {
      score = 650;
    } else if (compactQuery.length >= 2 && entry.compactCode.includes(compactQuery)) {
      score = 420;
    } else if (
      queryTokens.length >= 1 &&
      compactQuery.length >= 2 &&
      queryTokens.every(
        (tok) =>
          entry.compactCode.includes(tok) ||
          entry.normalizedProgram.includes(tok) ||
          entry.normalizedSemester.includes(tok)
      )
    ) {
      score = 260;
    } else if (
      compactQuery.length >= 2 &&
      entry.normalizedProgram === compactQuery
    ) {
      score = 220;
    }

    if (score > 0) {
      results.push({ timetable: entry.timetable, score });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.timetable.classCode.localeCompare(b.timetable.classCode, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  return limit > 0 ? results.slice(0, limit) : results;
}

/**
 * Lecturer Timetable Search Index.
 * Strictly verified against `availableLecturerIds` from lecturerTimetableService —
 * never assumes a lecturer-to-timetable mapping unless verified from actual data.
 * Never indexes restricted fields such as IC/NoKP.
 */
export interface LecturerTimetableSearchEntry {
  staff: Staff;
  staffId: string;
  compactId: string;
  shortName: string;
  normalizedFullName: string;
  normalizedShortName: string;
  normalizedNamaPendek: string;
  normalizedDepartment: string;
  combinedPermittedText: string;
}

export interface LecturerTimetableSearchMatch {
  staff: Staff;
  staffId: string;
  shortName: string;
  score: number;
}

export function buildLecturerTimetableIndex(
  staffList: Staff[],
  availableLecturerIds: Set<string>
): LecturerTimetableSearchEntry[] {
  if (!Array.isArray(staffList) || staffList.length === 0 || !availableLecturerIds || availableLecturerIds.size === 0) {
    return [];
  }

  const seenIds = new Set<string>();
  const entries: LecturerTimetableSearchEntry[] = [];

  for (const staff of staffList) {
    const staffId = String(staff.ID || staff.StaffID || staff.staff_id || '')
      .toUpperCase()
      .trim();
    if (!staffId || !availableLecturerIds.has(staffId) || seenIds.has(staffId)) {
      continue;
    }
    seenIds.add(staffId);

    const shortName = getShortName(staff.Nama);
    const normalizedFullName = normalizeSearchText(staff.Nama);
    const normalizedShortName = normalizeSearchText(shortName);
    const normalizedNamaPendek = normalizeSearchText(staff.NamaPendek);
    const normalizedDepartment = normalizeSearchText(staff.DepartmentID || staff.Unit || '');
    const normalizedPosition = normalizeSearchText(staff.Jawatan);

    const combinedPermittedText = [
      staffId.toLowerCase(),
      normalizedFullName,
      normalizedShortName,
      normalizedNamaPendek,
      normalizedDepartment,
      normalizedPosition,
    ]
      .filter(Boolean)
      .join(' ');

    entries.push({
      staff,
      staffId,
      compactId: normalizeCompactCode(staffId),
      shortName,
      normalizedFullName,
      normalizedShortName,
      normalizedNamaPendek,
      normalizedDepartment,
      combinedPermittedText,
    });
  }

  return entries;
}

export function searchLecturerTimetableIndex(
  index: LecturerTimetableSearchEntry[],
  rawQuery: string,
  limit = 6
): LecturerTimetableSearchMatch[] {
  const q = normalizeSearchText(rawQuery);
  const compactQ = normalizeCompactCode(rawQuery);
  if (!q || index.length === 0) return [];

  const tokens = q.split(' ').filter(Boolean);
  const results: LecturerTimetableSearchMatch[] = [];

  for (const entry of index) {
    const isSingleChar = q.length === 1;
    const exactIdMatch = entry.compactId === compactQ;
    const prefixIdMatch = compactQ.length >= 2 && entry.compactId.startsWith(compactQ);

    const tokenMatches = tokens.every((tok) => {
      if (tok.length === 1) {
        return containsWholeWord(entry.combinedPermittedText, tok);
      }
      return entry.combinedPermittedText.includes(tok) || entry.compactId.includes(normalizeCompactCode(tok));
    });

    if (!exactIdMatch && !prefixIdMatch && !tokenMatches) continue;

    let score = 0;
    if (
      exactIdMatch ||
      entry.normalizedFullName === q ||
      entry.normalizedShortName === q ||
      (entry.normalizedNamaPendek && entry.normalizedNamaPendek === q)
    ) {
      score += 1000;
    } else if (
      prefixIdMatch ||
      (!isSingleChar &&
        (entry.normalizedFullName.startsWith(q) ||
          entry.normalizedShortName.startsWith(q) ||
          (entry.normalizedNamaPendek && entry.normalizedNamaPendek.startsWith(q))))
    ) {
      score += 700;
    } else if (
      containsWholeWord(entry.normalizedFullName, q) ||
      containsWholeWord(entry.normalizedShortName, q)
    ) {
      score += 550;
    } else if (
      !isSingleChar &&
      (entry.normalizedFullName.includes(q) || entry.normalizedShortName.includes(q))
    ) {
      score += 450;
    } else if (tokens.length > 1 && tokens.every((t) => entry.normalizedFullName.includes(t))) {
      score += 400;
    } else {
      score += 200;
    }

    results.push({
      staff: entry.staff,
      staffId: entry.staffId,
      shortName: entry.shortName,
      score,
    });
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.staff.Nama.localeCompare(b.staff.Nama);
  });

  return limit > 0 ? results.slice(0, limit) : results;
}

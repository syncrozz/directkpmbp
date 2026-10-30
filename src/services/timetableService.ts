/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentTimetable } from '../types';

export const GITHUB_API_URL = 'https://api.github.com/repos/syncrozz/syncrozz-assets/contents/TimeTable/Jadual%20Kelas%20Pelajar';
export const RAW_IMAGE_BASE_URL = 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/TimeTable/Jadual%20Kelas%20Pelajar/';

const CACHE_STORAGE_KEY = 'kpmbp_student_timetables_cache_v1';
const CACHE_TIMESTAMP_KEY = 'kpmbp_student_timetables_cache_ts';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Supported image extensions
const SUPPORTED_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

// Authoritative fallback list (used if GitHub API rate limits or network fails with empty cache)
const FALLBACK_CLASS_FILES = [
  'DCAT7A.jpg', 'DCAT7B.jpg', 'DCAT7C.jpg',
  'DIA1A.jpg', 'DIA1B.jpg', 'DIA1C.jpg', 'DIA1D.jpg', 'DIA3A.jpg',
  'DIA4A.jpg', 'DIA4B.jpg', 'DIA4C.jpg', 'DIA4D.jpg', 'DIA5A.jpg', 'DIA6A.jpg',
  'DLC1A.jpg', 'DLC1B.jpg', 'DLC1C.jpg',
  'DLM3A.jpg', 'DLM3B.jpg', 'DLM3C.jpg', 'DLM3E.jpg',
  'DLM4A.jpg', 'DLM4B.jpg', 'DLM4C.jpg', 'DLM4D.jpg', 'DLM4E.jpg', 'DLM4F.jpg',
  'DLM6A.jpg', 'DLM6B.jpg', 'DLM6C.jpg',
  'DLS1A.jpg', 'DLS1B.jpg', 'DLS1C.jpg'
];

let inMemoryCache: StudentTimetable[] | null = null;

/**
 * Extract class code by removing image extensions
 */
export function extractClassCode(fileName: string): string {
  return fileName.replace(/\.(jpg|jpeg|png|webp)$/i, '').trim().toUpperCase();
}

/**
 * Extract program prefix (e.g. DCAT, DIA, DLC, DLM, DLS)
 */
export function extractProgram(classCode: string): string {
  const match = classCode.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : 'LAIN-LAIN';
}

/**
 * Extract semester number (e.g. DIA4A -> Semester 4)
 */
export function extractSemester(classCode: string): string {
  const match = classCode.match(/^[A-Za-z]+(\d+)/);
  return match ? `Semester ${match[1]}` : 'Umum';
}

/**
 * Convert a filename to a normalized StudentTimetable object
 */
export function normalizeTimetableRecord(fileName: string, size?: number, downloadUrl?: string): StudentTimetable {
  const classCode = extractClassCode(fileName);
  const encodedName = encodeURIComponent(fileName);
  const imageUrl = downloadUrl || `${RAW_IMAGE_BASE_URL}${encodedName}`;

  return {
    classCode,
    fileName,
    imageUrl,
    downloadUrl: imageUrl,
    size,
    source: 'github',
    program: extractProgram(classCode),
    semester: extractSemester(classCode),
  };
}

/**
 * Generate fallback timetable records
 */
function getFallbackTimetables(): StudentTimetable[] {
  return FALLBACK_CLASS_FILES.map((f) => normalizeTimetableRecord(f)).sort((a, b) =>
    a.classCode.localeCompare(b.classCode, undefined, { numeric: true, sensitivity: 'base' })
  );
}

/**
 * Fetch list of student timetables from GitHub repository with caching and fallbacks.
 */
export async function fetchStudentTimetables(forceRefresh = false): Promise<{
  data: StudentTimetable[];
  fromCache: boolean;
  totalCount: number;
  lastUpdated?: string;
}> {
  // 1. Check in-memory cache if not force refreshing
  if (!forceRefresh && inMemoryCache && inMemoryCache.length > 0) {
    return {
      data: inMemoryCache,
      fromCache: true,
      totalCount: inMemoryCache.length,
    };
  }

  // 2. Check localStorage cache if not force refreshing
  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_STORAGE_KEY);
      const cachedTs = localStorage.getItem(CACHE_TIMESTAMP_KEY);

      if (cached && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10);
        if (age < CACHE_TTL_MS) {
          const parsed: StudentTimetable[] = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            inMemoryCache = parsed;
            return {
              data: parsed,
              fromCache: true,
              totalCount: parsed.length,
              lastUpdated: new Date(parseInt(cachedTs, 10)).toLocaleString('ms-MY'),
            };
          }
        }
      }
    } catch (e) {
      console.warn('[TimetableService] Error reading localStorage cache:', e);
    }
  }

  // 3. Fetch dynamically from GitHub API
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}: ${response.statusText}`);
    }

    const json = await response.json();

    if (!Array.isArray(json)) {
      throw new Error('GitHub API response is not an array of files');
    }

    // Filter valid image files
    const validFiles = json.filter((item: any) => {
      if (item.type !== 'file' || typeof item.name !== 'string') return false;
      const lower = item.name.toLowerCase();
      return SUPPORTED_IMAGE_EXTS.some((ext) => lower.endsWith(ext));
    });

    const records: StudentTimetable[] = validFiles.map((item: any) =>
      normalizeTimetableRecord(item.name, item.size, item.download_url)
    );

    // Sort ascending by classCode (natural sort)
    records.sort((a, b) =>
      a.classCode.localeCompare(b.classCode, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Update in-memory & localStorage caches
    inMemoryCache = records;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(records));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, Date.now().toString());
      } catch (err) {
        console.warn('[TimetableService] Failed to write localStorage:', err);
      }
    }

    return {
      data: records,
      fromCache: false,
      totalCount: records.length,
      lastUpdated: new Date().toLocaleString('ms-MY'),
    };
  } catch (error) {
    console.warn('[TimetableService] GitHub fetch failed, attempting cached or fallback data:', error);

    // Try stale localStorage
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            inMemoryCache = parsed;
            return {
              data: parsed,
              fromCache: true,
              totalCount: parsed.length,
            };
          }
        }
      } catch {
        // Fall through to hard fallback
      }
    }

    // Authoritative fallback
    const fallback = getFallbackTimetables();
    inMemoryCache = fallback;
    return {
      data: fallback,
      fromCache: true,
      totalCount: fallback.length,
    };
  }
}

/**
 * Filter timetables based on search query and program filter.
 * Matches: classCode, program, semester, fileName.
 */
export function searchTimetables(
  list: StudentTimetable[],
  rawQuery: string,
  selectedProgram = 'Semua'
): StudentTimetable[] {
  const query = rawQuery.trim().toLowerCase().replace(/\s+/g, '');

  return list.filter((item) => {
    // 1. Check program filter
    if (selectedProgram !== 'Semua' && item.program !== selectedProgram) {
      return false;
    }

    // 2. Check search query (case-insensitive, whitespace-trimmed, partial match)
    if (!query) {
      return true;
    }

    const code = item.classCode.toLowerCase().replace(/\s+/g, '');
    const prog = (item.program || '').toLowerCase();
    const sem = (item.semester || '').toLowerCase();
    const fname = item.fileName.toLowerCase();

    return (
      code.includes(query) ||
      prog.includes(query) ||
      sem.includes(query) ||
      fname.includes(query)
    );
  });
}

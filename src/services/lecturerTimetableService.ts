/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Staff } from '../types';

export const LECTURER_TIMETABLE_API_URL = 'https://api.github.com/repos/syncrozz/syncrozz-assets/contents/TimeTable';
export const LECTURER_TIMETABLE_RAW_BASE = 'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/TimeTable/';

const CACHE_KEY = 'kpmbp_lecturer_timetables_ids_v1';
const CACHE_TS_KEY = 'kpmbp_lecturer_timetables_ts_v1';
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Authoritative fallback list of 49 known lecturer timetable IDs in GitHub repo
export const FALLBACK_LECTURER_TIMETABLE_IDS: string[] = [
  'ST010', 'ST018', 'ST019', 'ST020', 'ST021', 'ST022', 'ST023', 'ST026',
  'ST027', 'ST028', 'ST029', 'ST030', 'ST031', 'ST032', 'ST033', 'ST034',
  'ST035', 'ST036', 'ST037', 'ST038', 'ST039', 'ST040', 'ST041', 'ST042',
  'ST043', 'ST044', 'ST045', 'ST046', 'ST047', 'ST048', 'ST049', 'ST050',
  'ST051', 'ST052', 'ST053', 'ST054', 'ST055', 'ST056', 'ST057', 'ST058',
  'ST059', 'ST060', 'ST061', 'ST062', 'ST064', 'ST065', 'ST068', 'ST069',
  'ST089'
];

let inMemoryAvailableIds: Set<string> | null = null;

export interface LecturerTimetableItem {
  staff: Staff;
  staffId: string;
  hasTimetable: boolean;
  imageUrl: string;
}

/**
 * Fetch available timetable file IDs from GitHub TimeTable directory
 */
export async function fetchAvailableTimetableIds(forceRefresh = false): Promise<{
  ids: Set<string>;
  fromCache: boolean;
  lastUpdated?: string;
}> {
  // Check in-memory cache
  if (!forceRefresh && inMemoryAvailableIds && inMemoryAvailableIds.size > 0) {
    return { ids: inMemoryAvailableIds, fromCache: true };
  }

  // Check localStorage cache
  if (!forceRefresh && typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      const ts = localStorage.getItem(CACHE_TS_KEY);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (age < CACHE_TTL_MS) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const set = new Set<string>(parsed.map((id: string) => id.toUpperCase()));
            inMemoryAvailableIds = set;
            return {
              ids: set,
              fromCache: true,
              lastUpdated: new Date(parseInt(ts, 10)).toLocaleTimeString('ms-MY', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            };
          }
        }
      }
    } catch (err) {
      console.warn('[LecturerTimetableService] Local cache read notice:', err);
    }
  }

  // Network fetch from GitHub
  try {
    const response = await fetch(LECTURER_TIMETABLE_API_URL, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
      },
      cache: forceRefresh ? 'no-cache' : 'default',
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const items = await response.json();
    if (!Array.isArray(items)) {
      throw new Error('GitHub API response is not an array of items');
    }

    const set = new Set<string>();
    items.forEach((item: any) => {
      if (item.type === 'file' && typeof item.name === 'string') {
        const upper = item.name.toUpperCase();
        if (upper.endsWith('.JPG') || upper.endsWith('.PNG') || upper.endsWith('.JPEG')) {
          const id = upper.replace(/\.(JPG|PNG|JPEG)$/i, '').trim();
          if (id) set.add(id);
        }
      }
    });

    if (set.size === 0) {
      FALLBACK_LECTURER_TIMETABLE_IDS.forEach((id) => set.add(id));
    }

    inMemoryAvailableIds = set;

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(Array.from(set)));
        localStorage.setItem(CACHE_TS_KEY, Date.now().toString());
      } catch (err) {
        console.warn('[LecturerTimetableService] Local cache write notice:', err);
      }
    }

    return {
      ids: set,
      fromCache: false,
      lastUpdated: new Date().toLocaleTimeString('ms-MY', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  } catch (err) {
    console.warn('[LecturerTimetableService] Network fetch failed, using fallback list:', err);
    const fallbackSet = new Set<string>(FALLBACK_LECTURER_TIMETABLE_IDS);
    inMemoryAvailableIds = fallbackSet;
    return {
      ids: fallbackSet,
      fromCache: true,
      lastUpdated: 'Sandaran Terhad',
    };
  }
}

/**
 * Returns the raw GitHub image URL for a lecturer's timetable
 */
export function getLecturerTimetableUrl(staffId: string): string {
  const clean = staffId.trim().toUpperCase();
  return `${LECTURER_TIMETABLE_RAW_BASE}${clean}.jpg`;
}

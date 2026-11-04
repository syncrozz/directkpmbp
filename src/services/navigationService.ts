/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC NAVIGATION MANAGEMENT SERVICE
 * SES v4.4 Specification
 * 
 * Manages dynamic hierarchical navigation (Parent & Child),
 * real-time synchronization with Firebase Firestore, local caching,
 * route validation, and data-integrity protections.
 */

import React from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { NavigationItem, NavigationType } from '../types';
import { parseTakwimLink } from './takwimService';
import {
  UserCheck,
  BookOpen,
  Calendar,
  GraduationCap,
  FileText,
  Link as LinkIcon,
  Compass,
  Users,
  Folder,
  Globe,
  HelpCircle,
  Clock,
  Shield,
  Sparkles,
  Layers,
  Bookmark,
  Award,
  Briefcase,
  Building,
  CheckCircle2
} from 'lucide-react';

export const LOCAL_STORAGE_NAV_KEY = 'kpmbp_navigation_items_v4';

/**
 * Default Initial Navigation Structure (SES v4.4 Section 2)
 * 
 * PARENT NAVIGATION
 * 1. Directory Staff (destination: 'directory')
 * 2. Rujukan Kolej (destination: 'rujukan')
 * 3. Jadual (destination: 'jadual')
 * 
 * CHILD NAVIGATION — JADUAL
 * 1. Jadual Pelajar (destination: 'jadual')
 * 2. Jadual Pensyarah (destination: 'jadual-pensyarah')
 */
export const DEFAULT_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: 'nav_directory',
    name: 'Directory Staff',
    icon: 'UserCheck',
    type: 'parent',
    destination: 'directory',
    slug: 'directory',
    order: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'nav_rujukan',
    name: 'Rujukan Kolej',
    icon: 'BookOpen',
    type: 'parent',
    destination: 'rujukan',
    slug: 'rujukan',
    order: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'nav_jadual',
    name: 'Jadual',
    icon: 'Calendar',
    type: 'parent',
    destination: 'jadual',
    slug: 'jadual',
    order: 2,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'nav_jadual_pelajar',
    name: 'Jadual Pelajar',
    icon: 'Calendar',
    type: 'child',
    parentId: 'nav_jadual',
    destination: 'jadual',
    slug: 'jadual_pelajar',
    order: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'nav_jadual_pensyarah',
    name: 'Jadual Pensyarah',
    icon: 'GraduationCap',
    type: 'child',
    parentId: 'nav_jadual',
    destination: 'jadual-pensyarah',
    slug: 'jadual_pensyarah',
    order: 1,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Standard known modules inside the platform
 */
export const KNOWN_MODULE_DESTINATIONS = [
  { id: 'directory', name: 'Directory Staff (Direktori Kakitangan)' },
  { id: 'rujukan', name: 'Rujukan Kolej (Portal, Takwim, Panduan)' },
  { id: 'jadual', name: 'Jadual Pelajar (Jadual Waktu Kelas)' },
  { id: 'jadual-pensyarah', name: 'Jadual Pensyarah (Jadual Waktu Pensyarah)' },
  { id: 'daftar', name: 'Pendaftaran Staf Baharu' },
] as const;

/**
 * Curated list of navigation icons supported
 */
export const AVAILABLE_NAV_ICONS = [
  { name: 'UserCheck', label: 'Staf / Pengguna' },
  { name: 'BookOpen', label: 'Buku / Rujukan' },
  { name: 'Calendar', label: 'Kalendar / Jadual' },
  { name: 'GraduationCap', label: 'Akademik / Pensyarah' },
  { name: 'FileText', label: 'Dokumen / Panduan' },
  { name: 'Link', label: 'Pautan / Portal' },
  { name: 'Compass', label: 'Kompas / Halatuju' },
  { name: 'Users', label: 'Kumpulan / Warga' },
  { name: 'Folder', label: 'Folder / Arkib' },
  { name: 'Globe', label: 'Web / Internet' },
  { name: 'HelpCircle', label: 'Bantuan / Maklumat' },
  { name: 'Clock', label: 'Masa / Waktu' },
  { name: 'Shield', label: 'Keselamatan / Polisi' },
  { name: 'Sparkles', label: 'Istimewa / Ciri Baharu' },
  { name: 'Layers', label: 'Lapisan / Umum' },
  { name: 'Bookmark', label: 'Tanda Buku' },
  { name: 'Award', label: 'Anugerah / Kualiti' },
  { name: 'Briefcase', label: 'Pengurusan / Pentadbiran' },
  { name: 'Building', label: 'Kampus / Fasiliti' },
  { name: 'CheckCircle2', label: 'Selesai / Pengesahan' },
] as const;

/**
 * Resolves a React Lucide Icon element by name safely
 */
export function renderNavIcon(iconName: string, className = 'w-4 h-4'): React.ReactElement {
  const map: Record<string, React.ComponentType<{ className?: string }>> = {
    UserCheck,
    BookOpen,
    Calendar,
    GraduationCap,
    FileText,
    Link: LinkIcon,
    Compass,
    Users,
    Folder,
    Globe,
    HelpCircle,
    Clock,
    Shield,
    Sparkles,
    Layers,
    Bookmark,
    Award,
    Briefcase,
    Building,
    CheckCircle2,
  };

  const Component = map[iconName] || Layers;
  return React.createElement(Component, { className });
}

/**
 * Validates navigation destination before saving (SES v4.4 Section 6D)
 */
export function validateNavigationDestination(dest: string, displayType?: string): { valid: boolean; error?: string } {
  const trimmed = (dest || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Destinasi modul/laluan tidak boleh dibiarkan kosong.' };
  }

  // If displayType is drive, empty_page, or dest is an internal navigation item id
  if (displayType === 'drive' || displayType === 'empty_page' || trimmed.startsWith('nav_')) {
    return { valid: true };
  }

  // Known modules check
  const isKnown = KNOWN_MODULE_DESTINATIONS.some((m) => m.id === trimmed);
  if (isKnown) {
    return { valid: true };
  }

  // External URL or hash or path
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/')
  ) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Destinasi "${trimmed}" tidak sah. Pilih modul sedia ada (directory, rujukan, jadual, jadual-pensyarah, daftar) atau pautan sah (https://..., #...).`,
  };
}

/**
 * Validates Google Drive URL and extracts its kind (file or folder)
 */
export function validateDriveUrl(url: string): { valid: boolean; kind?: 'drive-file' | 'drive-folder' | 'other'; error?: string } {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Sila masukkan pautan fail atau folder Google Drive.' };
  }

  const parsed = parseTakwimLink(trimmed);
  if (!parsed) {
    return { valid: false, error: 'Format URL tidak sah. Sila pastikan pautan bermula dengan https://drive.google.com/...' };
  }

  if (parsed.kind === 'other') {
    return {
      valid: false,
      error: 'Pautan mestilah daripada domain Google Drive (drive.google.com atau docs.google.com).'
    };
  }

  return { valid: true, kind: parsed.kind };
}

/**
 * Direct update of a Child Navigation item's Google Drive configuration (Admin inline update)
 */
export async function updateNavigationItemDriveConfig(
  navId: string,
  driveUrl: string,
  displayTitle?: string
): Promise<boolean> {
  const cached = typeof window !== 'undefined' ? localStorage.getItem(LOCAL_STORAGE_NAV_KEY) : null;
  let currentItems = DEFAULT_NAVIGATION_ITEMS;
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        currentItems = parsed;
      }
    } catch (_e) {
      // ignore
    }
  }

  const updated = currentItems.map((item) => {
    if (item.id === navId) {
      return {
        ...item,
        driveUrl: driveUrl.trim(),
        displayTitle: (displayTitle || '').trim() || item.name,
        updatedAt: new Date().toISOString(),
      };
    }
    return item;
  });

  return saveNavigationItems(updated);
}


/**
 * Checks whether a Parent Navigation item can be safely deleted (SES v4.4 Section 6B)
 */
export function canDeleteParent(
  parentId: string,
  allItems: NavigationItem[]
): { canDelete: boolean; childrenCount: number; childrenNames: string[] } {
  const children = allItems.filter((item) => item.type === 'child' && item.parentId === parentId);
  return {
    canDelete: children.length === 0,
    childrenCount: children.length,
    childrenNames: children.map((c) => c.name),
  };
}

/**
 * Checks whether a Child Navigation item can be safely deleted (SES v4.4 Section 6B & 3-Level Architecture)
 * A Child with Grandchildren cannot be deleted until its grandchildren are deleted or reassigned.
 */
export function canDeleteChild(
  childId: string,
  allItems: NavigationItem[]
): { canDelete: boolean; grandchildrenCount: number; grandchildrenNames: string[] } {
  const grandchildren = allItems.filter((item) => item.type === 'grandchild' && item.parentId === childId);
  return {
    canDelete: grandchildren.length === 0,
    grandchildrenCount: grandchildren.length,
    grandchildrenNames: grandchildren.map((g) => g.name),
  };
}

/**
 * Generates a stable unique ID for a navigation item (Parent, Child, or Grandchild)
 */
export function generateNavId(name: string, type: NavigationType): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 16);
  const rand = Math.random().toString(36).substring(2, 6);
  const prefix = type === 'parent' ? 'nav_p_' : type === 'grandchild' ? 'nav_gc_' : 'nav_c_';
  return `${prefix}${clean || 'item'}_${rand}`;
}

/**
 * Converts a navigation title into a clean, human-readable SEO URL slug
 * Example: "Jadual Exam" -> "jadual_exam"
 */
export function slugify(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // remove special punctuation
    .replace(/[\s-]+/g, '_')   // replace spaces & hyphens with underscore
    .replace(/_+/g, '_')       // collapse consecutive underscores
    .replace(/^_+|_+$/g, '');  // trim leading/trailing underscores
}

/**
 * Validates a navigation URL slug (SES v4.4 Clean URL Architecture)
 */
export function validateNavigationSlug(
  slug: string,
  currentItemId?: string,
  allItems: NavigationItem[] = []
): { valid: boolean; error?: string } {
  const trimmed = (slug || '').trim().toLowerCase();
  if (!trimmed) {
    return { valid: false, error: 'URL Slug tidak boleh dibiarkan kosong.' };
  }

  // Check valid characters: lowercase letters, digits, underscores, hyphens
  const validPattern = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/;
  if (!validPattern.test(trimmed)) {
    if (/\s/.test(trimmed)) {
      return { valid: false, error: 'Slug tidak boleh mengandungi ruang (space). Gunakan huruf kecil, angka, atau garis bawah (_).' };
    }
    if (/[A-Z]/.test(slug)) {
      return { valid: false, error: 'Slug mestilah menggunakan huruf kecil sahaja.' };
    }
    return {
      valid: false,
      error: 'Slug hanya boleh mengandungi huruf kecil (a-z), angka (0-9), garis bawah (_), atau sempang (-), dan tidak boleh bermula/berakhir dengan simbol.',
    };
  }

  if (trimmed.length < 2 || trimmed.length > 60) {
    return { valid: false, error: 'Panjang slug mestilah antara 2 hingga 60 aksara.' };
  }

  // Reserved keywords
  const reservedSlugs = [
    'api',
    'favicon',
    'favicon.ico',
    'assets',
    'public',
    'static',
    'admin',
    'index.html',
    'index',
  ];
  if (reservedSlugs.includes(trimmed)) {
    return { valid: false, error: `Slug "${trimmed}" adalah laluan terpelihara sistem. Sila pilih slug yang lain.` };
  }

  // Uniqueness validation against all other navigation items
  const duplicate = allItems.find(
    (item) => item.id !== currentItemId && item.slug && item.slug.toLowerCase() === trimmed
  );
  if (duplicate) {
    return {
      valid: false,
      error: `Slug "${trimmed}" telah digunakan oleh navigasi "${duplicate.name}". Sila gunakan slug yang unik.`,
    };
  }

  return { valid: true };
}

export interface ResolvedNavigationResult {
  activeNavId?: string;
  resolvedDestination: string;
  matchedItem?: NavigationItem;
  parentItem?: NavigationItem;
  grandParentItem?: NavigationItem;
}

/**
 * Centralized Navigation Destination Resolver (SES v4.4 Specification)
 * 
 * Resolution Priority:
 * 1. Match navigation by unique ID (Internal identity).
 * 2. Match navigation by configured slug (Public URL identity).
 * 3. Match existing module destination.
 * 4. Apply existing legacy route handling.
 */
export function resolveNavigationFromUrl(
  items: NavigationItem[],
  customToken?: string
): ResolvedNavigationResult {
  let token = (customToken || '').trim();

  // If no custom token provided, parse from window.location
  if (!token && typeof window !== 'undefined') {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '').trim();
    const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
    const searchParams = new URLSearchParams(window.location.search);
    const pageParam = (searchParams.get('page') || searchParams.get('tab') || '').trim();

    // Priority of location sources: Hash (for explicit legacy links) -> Pathname -> Query param
    if (rawHash) {
      token = rawHash;
    } else if (rawPath && rawPath !== 'index.html') {
      token = rawPath;
    } else if (pageParam) {
      token = pageParam;
    }
  }

  const cleanToken = token.toLowerCase();

  const buildHierarchy = (item?: NavigationItem): { parentItem?: NavigationItem; grandParentItem?: NavigationItem } => {
    if (!item) return {};
    if (item.type === 'grandchild') {
      const parent = items.find((i) => i.id === item.parentId);
      const grandParent = items.find((i) => i.id === parent?.parentId);
      return { parentItem: parent, grandParentItem: grandParent };
    }
    if (item.type === 'child') {
      const parent = items.find((i) => i.id === item.parentId);
      return { parentItem: parent };
    }
    return {};
  };

  // If root or empty
  if (!cleanToken || cleanToken === 'directory') {
    const dirItem = items.find((i) => i.destination === 'directory' || i.id === 'nav_directory');
    const hierarchy = buildHierarchy(dirItem);
    return {
      activeNavId: dirItem?.id || 'nav_directory',
      resolvedDestination: 'directory',
      matchedItem: dirItem,
      ...hierarchy,
    };
  }

  // Priority 1: Match navigation by unique ID
  const matchById = items.find((i) => i.id === token || i.id.toLowerCase() === cleanToken);
  if (matchById) {
    const hierarchy = buildHierarchy(matchById);
    return {
      activeNavId: matchById.id,
      resolvedDestination: matchById.destination || matchById.id,
      matchedItem: matchById,
      ...hierarchy,
    };
  }

  // Priority 2: Match navigation by configured slug (or auto-suggested slug from name)
  const matchBySlug = items.find(
    (i) => (i.slug && i.slug.toLowerCase() === cleanToken) || (!i.slug && slugify(i.name) === cleanToken)
  );
  if (matchBySlug) {
    const hierarchy = buildHierarchy(matchBySlug);
    return {
      activeNavId: matchBySlug.id,
      resolvedDestination: matchBySlug.destination || matchBySlug.id,
      matchedItem: matchBySlug,
      ...hierarchy,
    };
  }

  // Priority 3: Match existing module destination
  const matchByDest = items.find((i) => i.destination.toLowerCase() === cleanToken);
  if (matchByDest) {
    const hierarchy = buildHierarchy(matchByDest);
    return {
      activeNavId: matchByDest.id,
      resolvedDestination: matchByDest.destination,
      matchedItem: matchByDest,
      ...hierarchy,
    };
  }

  // Priority 4: Apply existing legacy route handling
  if (cleanToken === 'pensyarah' || cleanToken === 'jadual-pensyarah' || cleanToken === 'jadual_pensyarah') {
    const pensyarahItem = items.find((i) => i.destination === 'jadual-pensyarah');
    const hierarchy = buildHierarchy(pensyarahItem);
    return {
      activeNavId: pensyarahItem?.id || 'nav_jadual_pensyarah',
      resolvedDestination: 'jadual-pensyarah',
      matchedItem: pensyarahItem,
      ...hierarchy,
    };
  }

  if (cleanToken === 'jadual' || cleanToken === 'jadual_pelajar' || cleanToken === 'pelajar') {
    const jadualItem = items.find((i) => i.destination === 'jadual' && i.type === 'child') || items.find((i) => i.destination === 'jadual');
    const hierarchy = buildHierarchy(jadualItem);
    return {
      activeNavId: jadualItem?.id || 'nav_jadual_pelajar',
      resolvedDestination: 'jadual',
      matchedItem: jadualItem,
      ...hierarchy,
    };
  }

  if (cleanToken === 'rujukan') {
    const rujukanItem = items.find((i) => i.destination === 'rujukan');
    const hierarchy = buildHierarchy(rujukanItem);
    return {
      activeNavId: rujukanItem?.id || 'nav_rujukan',
      resolvedDestination: 'rujukan',
      matchedItem: rujukanItem,
      ...hierarchy,
    };
  }

  if (cleanToken === 'daftar') {
    const daftarItem = items.find((i) => i.destination === 'daftar');
    const hierarchy = buildHierarchy(daftarItem);
    return {
      activeNavId: daftarItem?.id || 'daftar',
      resolvedDestination: 'daftar',
      matchedItem: daftarItem,
      ...hierarchy,
    };
  }

  // Default fallback: return token directly as destination
  return {
    activeNavId: token,
    resolvedDestination: token,
  };
}

/**
 * Normalizes 3-Level navigation ordering (Parent -> Child -> Grandchild)
 */
export function normalizeNavigationList(items: NavigationItem[]): NavigationItem[] {
  const sanitizeItem = (i: NavigationItem): NavigationItem => {
    const slugVal = i.slug?.trim() ? slugify(i.slug) : undefined;
    return {
      ...i,
      slug: slugVal,
    };
  };

  // Level 1: Parents
  const parents = items
    .filter((i) => i.type === 'parent')
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({ ...sanitizeItem(p), order: idx }));

  // Level 2: Children grouped by Parent
  const children = items
    .filter((i) => i.type === 'child')
    .sort((a, b) => {
      if (a.parentId === b.parentId) return a.order - b.order;
      return (a.parentId || '').localeCompare(b.parentId || '');
    });

  const groupedChildren: NavigationItem[] = [];
  const parentGroups = new Map<string, NavigationItem[]>();

  children.forEach((c) => {
    const pId = c.parentId || 'orphan';
    if (!parentGroups.has(pId)) {
      parentGroups.set(pId, []);
    }
    parentGroups.get(pId)!.push(c);
  });

  parentGroups.forEach((group) => {
    group.forEach((item, index) => {
      groupedChildren.push({ ...sanitizeItem(item), order: index });
    });
  });

  // Level 3: Grandchildren grouped by Child
  const grandchildren = items
    .filter((i) => i.type === 'grandchild')
    .sort((a, b) => {
      if (a.parentId === b.parentId) return a.order - b.order;
      return (a.parentId || '').localeCompare(b.parentId || '');
    });

  const groupedGrandchildren: NavigationItem[] = [];
  const childGroups = new Map<string, NavigationItem[]>();

  grandchildren.forEach((gc) => {
    const cId = gc.parentId || 'orphan';
    if (!childGroups.has(cId)) {
      childGroups.set(cId, []);
    }
    childGroups.get(cId)!.push(gc);
  });

  childGroups.forEach((group) => {
    group.forEach((item, index) => {
      groupedGrandchildren.push({ ...sanitizeItem(item), order: index });
    });
  });

  return [...parents, ...groupedChildren, ...groupedGrandchildren];
}

/**
 * Idempotent automatic migration of UPPK into container mode with Grading grandchild
 * SES v4.4 Specification
 */
export function migrateUppkGradingIfNeeded(items: NavigationItem[]): { items: NavigationItem[]; migrated: boolean } {
  const uppk = items.find(
    (i) =>
      (i.type === 'child' || i.id === 'nav_c_grading_04dq') &&
      (i.name.trim().toUpperCase() === 'UPPK' ||
        i.slug === 'uppk' ||
        i.id === 'nav_c_grading_04dq')
  );

  if (!uppk) {
    return { items, migrated: false };
  }

  // Check if a grandchild named 'Grading' or with slug 'grading' already exists under UPPK
  const hasGradingGrandchild = items.some(
    (i) =>
      i.type === 'grandchild' &&
      i.parentId === uppk.id &&
      (i.name.trim().toLowerCase() === 'grading' ||
        i.slug === 'grading' ||
        i.id === 'nav_gc_grading_uppk')
  );

  if (hasGradingGrandchild) {
    return { items, migrated: false };
  }

  const defaultGradingUrl =
    uppk.driveUrl ||
    'https://drive.google.com/file/d/1HPXUuHyZWijstFDTIZPW-MCwe42kXCYp/view?usp=sharing';

  const gradingGrandchild: NavigationItem = {
    id: 'nav_gc_grading_uppk',
    name: 'Grading',
    slug: 'grading',
    icon: 'FileText',
    type: 'grandchild',
    parentId: uppk.id,
    destination: 'nav_gc_grading_uppk',
    displayType: 'drive',
    driveUrl: defaultGradingUrl,
    displayTitle: uppk.displayTitle || 'Grading',
    order: 0,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const updatedList = items.map((itm) =>
    itm.id === uppk.id ? { ...itm, type: 'child' as NavigationType } : itm
  );
  updatedList.push(gradingGrandchild);

  return { items: updatedList, migrated: true };
}

/**
 * Reference to Firestore navigation configuration document
 * Path: /platforms/directkpmbp/config/navigation
 * Covered by rule: match /platforms/directkpmbp/{document=**} { allow read: if true; allow write: if isAuthorizedAdmin(); }
 */
export const navigationDocRef = () => doc(db, 'platforms', 'directkpmbp', 'config', 'navigation');

/**
 * Real-time Subscription to Navigation Items
 */
export function subscribeToNavigation(callback: (items: NavigationItem[]) => void): () => void {
  // 1. Immediately emit cached data if available for zero-flicker UI
  let initialItems = DEFAULT_NAVIGATION_ITEMS;
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_NAV_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migration = migrateUppkGradingIfNeeded(parsed);
          initialItems = normalizeNavigationList(migration.items);
        }
      }
    } catch (_e) {
      // ignore
    }
  }
  callback(initialItems);

  // 2. Authoritative real-time Firestore listener
  return onSnapshot(
    navigationDocRef(),
    (snapshot) => {
      if (!snapshot.exists()) {
        const migration = migrateUppkGradingIfNeeded(DEFAULT_NAVIGATION_ITEMS);
        const defaults = normalizeNavigationList(migration.items);
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_NAV_KEY, JSON.stringify(defaults));
        }
        callback(defaults);
        return;
      }

      const data = snapshot.data();
      const rawItems = Array.isArray(data?.items) ? data.items : [];

      const isConfigured = Boolean(data?.isConfigured);
      const baseItems = isConfigured
        ? rawItems
        : rawItems.length > 0
        ? rawItems
        : DEFAULT_NAVIGATION_ITEMS;

      const migration = migrateUppkGradingIfNeeded(baseItems);
      const normalizedItems = normalizeNavigationList(migration.items);

      if (migration.migrated) {
        // Persist migrated UPPK container structure to Firestore in background
        saveNavigationItems(normalizedItems).catch((err) => {
          console.warn('[NavigationService] Background auto-migration persist notice:', err?.message || err);
        });
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_NAV_KEY, JSON.stringify(normalizedItems));
      }

      callback(normalizedItems);
    },
    (err) => {
      console.warn('[NavigationService] Firestore notice:', err?.message || err);
      // Fallback on network or permission error: preserve current cached items
      callback(initialItems);
    }
  );
}

/**
 * Persists Navigation Items to Firestore (Admin Only)
 */
export async function saveNavigationItems(items: NavigationItem[]): Promise<boolean> {
  const normalized = normalizeNavigationList(items);

  // Refresh token if admin is currently signed in
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (_e) {
      // proceed
    }
  }

  await setDoc(
    navigationDocRef(),
    {
      items: normalized,
      isConfigured: true,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    },
    { merge: true }
  );

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_NAV_KEY, JSON.stringify(normalized));
  }

  return true;
}

/**
 * Resets navigation to default SES v4.4 structure in Firestore
 */
export async function resetNavigationToDefault(): Promise<boolean> {
  return saveNavigationItems(DEFAULT_NAVIGATION_ITEMS);
}

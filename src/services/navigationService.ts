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
export function validateNavigationDestination(dest: string): { valid: boolean; error?: string } {
  const trimmed = (dest || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Destinasi modul/laluan tidak boleh dibiarkan kosong.' };
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
 * Generates a stable unique ID for a navigation item
 */
export function generateNavId(name: string, type: NavigationType): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 16);
  const rand = Math.random().toString(36).substring(2, 6);
  return `nav_${type === 'parent' ? 'p' : 'c'}_${clean || 'item'}_${rand}`;
}

/**
 * Normalizes navigation ordering
 */
export function normalizeNavigationList(items: NavigationItem[]): NavigationItem[] {
  const parents = items
    .filter((i) => i.type === 'parent')
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({ ...p, order: idx }));

  const parentIds = new Set(parents.map((p) => p.id));

  const children = items
    .filter((i) => i.type === 'child')
    // Keep children even if parent was deleted temporarily, but normalize ordering per parent
    .sort((a, b) => {
      if (a.parentId === b.parentId) return a.order - b.order;
      return (a.parentId || '').localeCompare(b.parentId || '');
    });

  // Re-index children orders per parent group
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
      groupedChildren.push({ ...item, order: index });
    });
  });

  return [...parents, ...groupedChildren];
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
          initialItems = normalizeNavigationList(parsed);
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
        // Document does not exist yet: provide defaults and save to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(LOCAL_STORAGE_NAV_KEY, JSON.stringify(DEFAULT_NAVIGATION_ITEMS));
        }
        callback(DEFAULT_NAVIGATION_ITEMS);
        return;
      }

      const data = snapshot.data();
      const rawItems = Array.isArray(data?.items) ? data.items : [];

      // If document is configured, use its exact array (even if empty, honoring admin choice)
      const isConfigured = Boolean(data?.isConfigured);
      const itemsToUse = isConfigured
        ? normalizeNavigationList(rawItems)
        : rawItems.length > 0
        ? normalizeNavigationList(rawItems)
        : DEFAULT_NAVIGATION_ITEMS;

      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCAL_STORAGE_NAV_KEY, JSON.stringify(itemsToUse));
      }

      callback(itemsToUse);
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

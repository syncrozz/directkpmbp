/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — UNIVERSAL STAFF PHOTO SOURCE (SES v4.5)
 * Authoritative Image Repository:
 * https://github.com/syncrozz/syncrozz-assets
 * Directory: Gambar Staff KPMBP
 */

import { Staff } from '../types';

/**
 * Authoritative GitHub RAW Base URL for KPMBP Staff Photographs
 */
export const RAW_GITHUB_STAFF_PHOTO_BASE_URL =
  'https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/Gambar%20Staff%20KPMBP/';

/**
 * Legacy placeholder constant retained for backward compatibility
 */
export const STAFF_IMAGE_PLACEHOLDER = '';

/**
 * Normalizes staff ID (e.g. "st038", "STF-038", "STF038", "ST 038", "38" -> "ST038")
 */
export const formatStaffId = (rawId?: string | number): string => {
  if (rawId === undefined || rawId === null) return '';
  const str = String(rawId).trim().toUpperCase();
  if (!str) return '';

  // If already standard format STxxx
  const matchST = str.match(/^ST(?:F|F-|_|\s)*0*(\d+)$/i);
  if (matchST) {
    const num = parseInt(matchST[1], 10);
    return `ST${String(num).padStart(3, '0')}`;
  }

  // If purely numeric e.g. "38"
  const matchNumeric = str.match(/^\d+$/);
  if (matchNumeric) {
    const num = parseInt(str, 10);
    return `ST${String(num).padStart(3, '0')}`;
  }

  // Strip prefixes like STF-, STF_, STF
  const cleaned = str
    .replace(/^STF[-_]?/i, 'ST')
    .replace(/^ST[\s_-]+/i, 'ST');

  return cleaned || str;
};

/**
 * Centralized Authoritative Staff Photograph URL Resolver
 *
 * Dynamically resolves any staff ID to its corresponding RAW GitHub JPG file:
 * https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/Gambar%20Staff%20KPMBP/{STAFF_ID}.jpg
 *
 * Examples:
 * - ST001 -> ST001.jpg
 * - ST002 -> ST002.jpg
 * - ST015 -> ST015.jpg
 * - ST038 -> ST038.jpg
 * - ST050 -> ST050.jpg
 */
export const getStaffImageUrl = (staffId?: string | number): string => {
  const cleanId = formatStaffId(staffId);
  if (!cleanId) return '';
  return `${RAW_GITHUB_STAFF_PHOTO_BASE_URL}${cleanId}.jpg`;
};

/**
 * Global lifecycle cache for failed image requests to prevent repeated 404 retries
 */
const failedImagesSet = new Set<string>();

export const markStaffImageFailed = (url: string): void => {
  if (url) failedImagesSet.add(url);
};

export const isStaffImageFailed = (url: string): boolean => {
  return url ? failedImagesSet.has(url) : false;
};

export const clearFailedImagesCache = (): void => {
  failedImagesSet.clear();
};

/**
 * Returns image candidate array for a staff member
 */
export const getStaffPhotoCandidates = (staff: Staff): string[] => {
  const id = staff?.staff_id || staff?.ID || staff?.StaffID || '';
  const primaryUrl = getStaffImageUrl(id);
  return primaryUrl ? [primaryUrl] : [];
};

/**
 * Computes high-legibility initials from staff name
 */
export const getInitials = (name: string): string => {
  if (!name) return 'ST';
  const cleanName = name
    .replace(/^(Tuan|Haji|Puan|Encik|Dr\.|Cik|Hj\.|Pn\.|En\.)\s+/i, '')
    .replace(/\s+(Cmilt|M\.T\.A\.M|C\.A\.\(M\)|Afpm)$/i, '')
    .replace(/^(bin|binti|bt|bt\.)\s+/i, '');
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'ST';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

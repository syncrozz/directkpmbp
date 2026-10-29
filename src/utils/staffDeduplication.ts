/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Staff } from '../types';

/**
 * Normalizes staff name for accurate duplicate detection:
 * - Converts to lower case
 * - Strips professional suffixes and titles like CMILT, M.T.A.M, Ts., Dr., Ir.
 * - Strips punctuation, commas, periods, quotes
 * - Normalizes whitespace and trims
 */
export function normalizeStaffName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\bcmilt\b/gi, '')
    .replace(/\bm\.t\.a\.m\b/gi, '')
    .replace(/\bmtam\b/gi, '')
    .replace(/\bts\.?\b/gi, '')
    .replace(/\bdr\.?\b/gi, '')
    .replace(/\bir\.?\b/gi, '')
    .replace(/\bhj\.?\b/gi, '')
    .replace(/\bhjh\.?\b/gi, '')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()"'\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes email address for duplicate checking
 */
export function normalizeStaffEmail(email: string): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

/**
 * Checks if a staff member with a matching normalized name or email already exists
 * in the provided staff list, excluding the current staff's own ID.
 */
export function findDuplicateStaff(
  target: { Nama?: string; Email?: string; StaffID?: string; ID?: string; staff_id?: string },
  existingStaffList: Staff[],
  currentStaffId?: string
): Staff | undefined {
  const normTargetName = normalizeStaffName(target.Nama || '');
  const normTargetEmail = normalizeStaffEmail(target.Email || '');
  const excludeId = (currentStaffId || target.ID || target.StaffID || target.staff_id || '').toUpperCase().trim();

  if (!normTargetName && !normTargetEmail) return undefined;

  return existingStaffList.find((existing) => {
    const existingId = (existing.ID || existing.StaffID || existing.staff_id || '').toUpperCase().trim();
    if (excludeId && existingId === excludeId) {
      return false; // Skip comparing against itself
    }

    // Name match (requires meaningful name length >= 4)
    if (normTargetName && normTargetName.length >= 4) {
      const existingNormName = normalizeStaffName(existing.Nama || '');
      if (existingNormName && existingNormName === normTargetName) {
        return true;
      }
    }

    // Email match (requires meaningful email length >= 5)
    if (normTargetEmail && normTargetEmail.length >= 5) {
      const existingNormEmail = normalizeStaffEmail(existing.Email || '');
      if (existingNormEmail && existingNormEmail === normTargetEmail) {
        return true;
      }
    }

    return false;
  });
}

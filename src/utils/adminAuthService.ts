/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — GOOGLE MASTER ADMIN AUTHENTICATION SERVICE
 * SYNCROZZ ENGINEERING STANDARD
 *
 * PRINCIPLES:
 * - AUTHORIZED MASTER ADMINISTRATORS ONLY
 * - SINGLE AUTHENTICATION METHOD: Firebase Google Auth
 * - ZERO SIMULATED OR PIN-BASED BYPASS PATHS
 */

import { AuthorizedAdmin } from '../types';
import { syncAdminToFirestore } from '../config/firebase';

/**
 * The authoritative Master Administrator email addresses.
 * All comparisons MUST be normalized using trim() and toLowerCase().
 */
export const AUTHORIZED_ADMIN_EMAILS = [
  'cgkhairi2u@gmail.com',
  'chegukay@gmail.com',
  'cikgukyee@gmail.com',
  'kpmbp2u@gmail.com',
  'khaikerr@gmail.com',
  'festivalseni.kpmbp@gmail.com',
  'kpmbppsn@gmail.com',
];

export const MASTER_ADMIN_EMAIL = 'kpmbp2u@gmail.com';

/**
 * Verify whether an email matches an authorized Master Administrator identity.
 */
export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return AUTHORIZED_ADMIN_EMAILS.includes(clean);
}

export interface GoogleAuthVerificationResult {
  isValid: boolean;
  admin?: AuthorizedAdmin;
  message?: string;
}

/**
 * Verifies authenticated Google user identity strictly against authorized Master Administrator policy.
 * Requires:
 * 1. Authenticated Google UID
 * 2. Normalized email matches one of AUTHORIZED_ADMIN_EMAILS
 * 3. Google email is verified (emailVerified === true)
 */
export function verifyGoogleAdmin(user: {
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  uid?: string;
  emailVerified?: boolean;
}): GoogleAuthVerificationResult {
  const cleanEmail = (user.email || '').trim().toLowerCase();

  if (!user.uid) {
    return {
      isValid: false,
      message: 'Sesi Firebase Authentication tidak sah.',
    };
  }

  if (!cleanEmail) {
    return {
      isValid: false,
      message: 'Akaun Google tidak mengandungi alamat emel yang sah.',
    };
  }

  // 1. Strict Identity Check: Must be in AUTHORIZED_ADMIN_EMAILS
  if (!AUTHORIZED_ADMIN_EMAILS.includes(cleanEmail)) {
    return {
      isValid: false,
      message: `Akses Ditolak: Akaun Google (${cleanEmail}) tidak mempunyai kebenaran sebagai Master Administrator.`,
    };
  }

  // 2. Strict Verification Check: Email must be verified by Google
  if (user.emailVerified !== true) {
    return {
      isValid: false,
      message: `Akses Ditolak: Emel akaun Google (${cleanEmail}) belum disahkan. Sila sahkan emel anda dengan Google terlebih dahulu.`,
    };
  }

  // 3. Grant Master Administrator Level 1
  const displayName =
    user.displayName ||
    (cleanEmail === 'cgkhairi2u@gmail.com'
      ? 'Master Admin (cgkhairi2u)'
      : cleanEmail === 'chegukay@gmail.com'
        ? 'Chegu Kay (Master Admin)'
        : cleanEmail === 'cikgukyee@gmail.com'
          ? 'Cikgu Kyee (Master Admin)'
          : cleanEmail === 'kpmbp2u@gmail.com'
            ? 'Pentadbir KPMBP'
            : cleanEmail === 'festivalseni.kpmbp@gmail.com'
              ? 'Pentadbir KPMBP'
              : 'Khaikerr (Master Admin)');

  const masterAdmin: AuthorizedAdmin = {
    id: user.uid,
    email: cleanEmail,
    name: displayName,
    role: 'Master Administrator',
    level: 1,
    status: 'verified',
    photoUrl: user.photoURL || undefined,
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  };

  // Sync Master Admin profile to Firestore /admins/{uid}
  syncAdminToFirestore({
    uid: user.uid,
    email: cleanEmail,
    name: masterAdmin.name,
    role: 'Master Administrator',
    level: 1,
  }).catch((err) => {
    console.warn('Notice syncing master admin to Firestore:', err);
  });

  return {
    isValid: true,
    admin: masterAdmin,
    message: 'Pengesahan Master Administrator berjaya.',
  };
}

/**
 * Migration cleanup: Clears all legacy authentication keys, PINs, invitations,
 * and old LocalStorage admin records across the application.
 */
export function clearLegacyAdminState(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    const legacyKeys = [
      'kpmbp_authorized_admins',
      'kpmbp_admin_invitations',
      'kpmbp_admin_pin',
      'kpmbp_dev_admin',
      'kpmbp_admin_mode',
      'kpmbp_active_admin',
    ];
    legacyKeys.forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();
  } catch (err) {
    console.warn('Notice clearing legacy admin state:', err);
  }
}

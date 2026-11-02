/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — SINGLE MASTER ADMIN GOOGLE AUTHENTICATION SERVICE
 * SYNCROZZ ENGINEERING STANDARD
 * 
 * PRINCIPLES:
 * - EXACTLY ONE MASTER ADMIN: khaikerr@gmail.com
 * - EXACTLY ONE AUTHENTICATION METHOD: Firebase Google Auth
 * - ZERO ALTERNATIVE LOGIN PATHS
 */

import { AuthorizedAdmin } from '../types';
import { syncAdminToFirestore } from '../config/firebase';

/**
 * The single, authoritative Master Administrator email address.
 * All comparisons MUST be normalized using trim() and toLowerCase().
 */
export const MASTER_ADMIN_EMAIL = 'khaikerr@gmail.com';

/**
 * Verify whether an email matches the sole Master Administrator identity.
 */
export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

export interface GoogleAuthVerificationResult {
  isValid: boolean;
  admin?: AuthorizedAdmin;
  message?: string;
}

/**
 * Verifies authenticated Google user identity strictly against the single Master Administrator policy.
 * Requires:
 * 1. Normalized email strictly equals 'khaikerr@gmail.com'
 * 2. Google email is verified (emailVerified !== false)
 */
export function verifyGoogleAdmin(user: {
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  uid?: string;
  emailVerified?: boolean;
}): GoogleAuthVerificationResult {
  const cleanEmail = (user.email || '').trim().toLowerCase();

  if (!cleanEmail) {
    return {
      isValid: false,
      message: 'Akaun Google tidak mengandungi alamat emel yang sah.',
    };
  }

  // 1. Strict Identity Check: ONLY khaikerr@gmail.com
  if (cleanEmail !== MASTER_ADMIN_EMAIL) {
    return {
      isValid: false,
      message: `Akses Ditolak: Akaun Google (${cleanEmail}) tidak mempunyai kebenaran. Hanya Master Administrator (${MASTER_ADMIN_EMAIL}) yang dibenarkan.`,
    };
  }

  // 2. Strict Verification Check: Email must be verified by Google
  if (user.emailVerified === false) {
    return {
      isValid: false,
      message: `Akses Ditolak: Emel akaun Google (${cleanEmail}) belum disahkan. Sila sahkan emel anda dengan Google terlebih dahulu.`,
    };
  }

  // 3. Grant Master Administrator Level 1
  const masterAdmin: AuthorizedAdmin = {
    id: user.uid || 'master-admin-khaikerr',
    email: MASTER_ADMIN_EMAIL,
    name: user.displayName || 'Khaikerr (Master Admin)',
    role: 'Master Administrator',
    level: 1,
    status: 'verified',
    photoUrl: user.photoURL || undefined,
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  };

  // Sync Master Admin profile to Firestore /admins/{uid}
  if (user.uid) {
    syncAdminToFirestore({
      uid: user.uid,
      email: MASTER_ADMIN_EMAIL,
      name: masterAdmin.name,
      role: 'Master Administrator',
      level: 1,
    }).catch((err) => {
      console.warn('Notice syncing master admin to Firestore:', err);
    });
  }

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

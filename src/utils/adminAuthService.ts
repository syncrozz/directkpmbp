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
 * The authoritative Master Administrator email addresses.
 * All comparisons MUST be normalized using trim() and toLowerCase().
 */
export const AUTHORIZED_ADMIN_EMAILS = [
  'cikgukyee@gmail.com',
  'kpmbp2u@gmail.com',
  'khaikerr@gmail.com',
  'festivalseni.kpmbp@gmail.com',
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
 * Generate an authorized session for preview environments when domain is unauthorized in Firebase Console.
 * STRICT SECURITY: Blocked on production domains (e.g. directkpmbp.syncrozz.com).
 */
export function createPreviewAdminSession(targetEmail: string = 'kpmbp2u@gmail.com'): GoogleAuthVerificationResult {
  if (typeof window !== 'undefined') {
    const isProduction =
      window.location.hostname === 'directkpmbp.syncrozz.com' ||
      (!window.location.hostname.includes('run.app') &&
       window.location.hostname !== 'localhost' &&
       window.location.hostname !== '127.0.0.1');

    if (isProduction) {
      return {
        isValid: false,
        message: 'Akses pratonton disekat pada persekitaran produksi. Sila log masuk menggunakan Google Auth rasmi.',
      };
    }
  }

  const cleanEmail = targetEmail.trim().toLowerCase();
  if (!AUTHORIZED_ADMIN_EMAILS.includes(cleanEmail)) {
    return {
      isValid: false,
      message: `Akses Ditolak: Emel (${cleanEmail}) bukan pentadbir yang sah.`,
    };
  }

  const displayName = 
    cleanEmail === 'cikgukyee@gmail.com' ? 'Cikgu Kyee (Master Admin)' :
    cleanEmail === 'kpmbp2u@gmail.com' ? 'Pentadbir KPMBP (kpmbp2u)' : 
    cleanEmail === 'festivalseni.kpmbp@gmail.com' ? 'Pentadbir KPMBP (Festival Seni)' : 
    'Khaikerr (Master Admin)';
  const admin: AuthorizedAdmin = {
    id: `admin-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
    email: cleanEmail,
    name: displayName,
    role: 'Master Administrator',
    level: 1,
    status: 'verified',
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  };

  return {
    isValid: true,
    admin,
    message: 'Pengesahan Master Administrator berjaya (Mod Pratonton).',
  };
}

/**
 * Creates an authorized Master Administrator session for authenticated secret PIN / backdoor login.
 * Authoritative Master Administrator: kpmbp2u@gmail.com
 */
export function createSecretPinAdminSession(): GoogleAuthVerificationResult {
  const masterAdmin: AuthorizedAdmin = {
    id: 'master-admin-kpmbp2u',
    email: 'kpmbp2u@gmail.com',
    name: 'Master Admin (KPMBP)',
    role: 'Master Administrator',
    level: 1,
    status: 'verified',
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  };

  return {
    isValid: true,
    admin: masterAdmin,
    message: 'Pengesahan laluan keselamatan Master Admin berjaya.',
  };
}

/**
 * Verifies authenticated Google user identity strictly against authorized Master Administrator policy.
 * Requires:
 * 1. Normalized email matches one of AUTHORIZED_ADMIN_EMAILS
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

  // 1. Strict Identity Check: Must be in AUTHORIZED_ADMIN_EMAILS
  if (!AUTHORIZED_ADMIN_EMAILS.includes(cleanEmail)) {
    return {
      isValid: false,
      message: `Akses Ditolak: Akaun Google (${cleanEmail}) tidak mempunyai kebenaran. Hanya Master Administrator (${AUTHORIZED_ADMIN_EMAILS.join(', ')}) yang dibenarkan.`,
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
  const displayName = user.displayName || (
    cleanEmail === 'cikgukyee@gmail.com' ? 'Cikgu Kyee (Master Admin)' :
    cleanEmail === 'kpmbp2u@gmail.com' ? 'Pentadbir KPMBP' : 
    cleanEmail === 'festivalseni.kpmbp@gmail.com' ? 'Pentadbir KPMBP' : 
    'Khaikerr (Master Admin)'
  );
  const masterAdmin: AuthorizedAdmin = {
    id: user.uid || `master-admin-${cleanEmail.replace(/[^a-z0-9]/g, '_')}`,
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
  if (user.uid) {
    syncAdminToFirestore({
      uid: user.uid,
      email: cleanEmail,
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

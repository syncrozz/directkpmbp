/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthorizedAdmin } from '../types';

export const MASTER_ADMIN_PIN = '5313';
export const MASTER_ADMIN_EMAILS = [
  'khaikerr@gmail.com',
  'anakcgkhairi@gmail.com'
];

const STORAGE_KEY = 'kpmbp_authorized_admins';

export const DEFAULT_AUTHORIZED_ADMINS: AuthorizedAdmin[] = [
  {
    id: 'admin-master-khaikerr',
    email: 'khaikerr@gmail.com',
    name: 'Khaikerr (Master Admin)',
    role: 'Master Administrator',
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  },
  {
    id: 'admin-khairi-01',
    email: 'khairi.mohd@mara.gov.my',
    pin: '5305',
    icLast4: '5305',
    name: 'Khairi Mohd',
    role: 'Admin MARA Sah',
    createdAt: new Date().toISOString().split('T')[0],
  },
];

/**
 * Menyemak sama ada emel adalah Master Admin rasmi.
 */
export function isMasterAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return MASTER_ADMIN_EMAILS.includes(clean);
}


/**
 * Mendapatkan senarai semua admin yang diotorisasi oleh Master Admin.
 */
export function getAuthorizedAdmins(): AuthorizedAdmin[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_AUTHORIZED_ADMINS));
      return DEFAULT_AUTHORIZED_ADMINS;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_AUTHORIZED_ADMINS;
  } catch (err) {
    console.error('Error reading authorized admins from localStorage:', err);
    return DEFAULT_AUTHORIZED_ADMINS;
  }
}

/**
 * Menyimpan senarai admin ke storan tempatan (localStorage).
 */
export function saveAuthorizedAdmins(admins: AuthorizedAdmin[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(admins));
  } catch (err) {
    console.error('Error saving authorized admins to localStorage:', err);
  }
}

/**
 * Menambah atau mengemaskini admin yang diotorisasi oleh Master Admin.
 * Menerima alamat emel MARA dan nombor IC (atau 4 digit terakhir).
 */
export function addAuthorizedAdmin(
  email: string,
  icOrPin: string,
  name?: string
): { success: boolean; message: string; admin?: AuthorizedAdmin } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'Sila masukkan alamat emel yang sah (contoh: khairi.mohd@mara.gov.my).' };
  }

  // Ekstrak 4 digit terakhir daripada nombor IC atau PIN
  const digitsOnly = icOrPin.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return { success: false, message: 'Nombor IC atau PIN keselamatan mestilah mempunyai sekurang-kurangnya 4 digit.' };
  }
  const last4Pin = digitsOnly.slice(-4);

  const currentList = getAuthorizedAdmins();
  const existingIndex = currentList.findIndex(
    (a) => a.email.toLowerCase() === cleanEmail
  );

  const adminName = name?.trim() || cleanEmail.split('@')[0].replace(/\./g, ' ').toUpperCase();

  if (existingIndex >= 0) {
    // Kemaskini rekod admin sedia ada
    currentList[existingIndex] = {
      ...currentList[existingIndex],
      pin: last4Pin,
      icLast4: last4Pin,
      name: adminName,
      createdAt: new Date().toISOString().split('T')[0],
    };
    saveAuthorizedAdmins(currentList);
    return {
      success: true,
      message: `Admin ${cleanEmail} telah berjaya dikemaskini.`,
      admin: currentList[existingIndex],
    };
  }

  const newAdmin: AuthorizedAdmin = {
    id: `admin-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    email: cleanEmail,
    pin: last4Pin,
    icLast4: last4Pin,
    name: adminName,
    role: 'Admin MARA Sah',
    createdAt: new Date().toISOString().split('T')[0],
  };

  const updatedList = [newAdmin, ...currentList];
  saveAuthorizedAdmins(updatedList);

  return {
    success: true,
    message: `Admin ${cleanEmail} berjaya diotorisasi untuk Admin Mode.`,
    admin: newAdmin,
  };
}

/**
 * Memadam otorisasi admin berdasarkan ID rekod.
 */
export function removeAuthorizedAdmin(id: string): { success: boolean; message: string } {
  const currentList = getAuthorizedAdmins();
  const filtered = currentList.filter((a) => a.id !== id);
  if (filtered.length === currentList.length) {
    return { success: false, message: 'Admin tidak dijumpai.' };
  }
  saveAuthorizedAdmins(filtered);
  return { success: true, message: 'Otorisasi admin telah berjaya dipadamkan.' };
}

/**
 * Mengesahkan kelayakan admin dengan emel dan PIN 4-digit (atau Master PIN).
 */
export function verifyAdminCredentials(
  email: string,
  pin: string
): { isValid: boolean; admin?: AuthorizedAdmin; isMaster?: boolean; message?: string } {
  const cleanPin = pin.replace(/\D/g, '').slice(-4);
  const cleanEmail = email.trim().toLowerCase();

  // 1. Semak jika menggunakan Master Admin PIN secara langsung
  if (cleanPin === MASTER_ADMIN_PIN) {
    return {
      isValid: true,
      isMaster: true,
      admin: {
        id: 'master-admin',
        email: cleanEmail || 'master@admin.kpmbp',
        pin: MASTER_ADMIN_PIN,
        name: 'Master Admin',
        role: 'Master Administrator',
      },
    };
  }

  if (!cleanEmail) {
    return {
      isValid: false,
      message: 'Sila masukkan alamat emel MARA yang sah.',
    };
  }

  if (cleanPin.length !== 4) {
    return {
      isValid: false,
      message: 'Sila masukkan 4 digit terakhir nombor IC sebagai PIN keselamatan.',
    };
  }

  // 2. Semak dengan senarai admin yang telah diotorisasi oleh Master Admin
  const admins = getAuthorizedAdmins();
  const matchedAdmin = admins.find(
    (a) => a.email.toLowerCase() === cleanEmail && a.pin === cleanPin
  );

  if (matchedAdmin) {
    return {
      isValid: true,
      isMaster: false,
      admin: matchedAdmin,
    };
  }

  return {
    isValid: false,
    message: 'Kombinasi emel MARA dan 4-digit PIN IC tidak sepadan atau belum diotorisasi.',
  };
}

/**
 * Mengesahkan akaun pengguna Google (cth: khaikerr@gmail.com) untuk akses Admin / Master Admin.
 */
export function verifyGoogleAdmin(user: {
  email: string | null;
  displayName: string | null;
  photoURL?: string | null;
  uid?: string;
}): { isValid: boolean; isMaster: boolean; admin?: AuthorizedAdmin; message?: string } {
  const cleanEmail = user.email?.trim().toLowerCase();
  if (!cleanEmail) {
    return {
      isValid: false,
      isMaster: false,
      message: 'Akaun Google tidak mengandungi alamat emel yang sah.',
    };
  }

  // 1. Semak jika emel adalah Master Admin rasmi (khaikerr@gmail.com)
  if (isMasterAdminEmail(cleanEmail)) {
    return {
      isValid: true,
      isMaster: true,
      admin: {
        id: user.uid || 'master-khaikerr',
        email: cleanEmail,
        name: user.displayName || 'Khaikerr (Master Admin)',
        role: 'Master Administrator',
        photoUrl: user.photoURL || undefined,
        authProvider: 'google',
        createdAt: new Date().toISOString().split('T')[0],
      },
    };
  }

  // 2. Semak jika emel telah diotorisasi dalam senarai admin
  const admins = getAuthorizedAdmins();
  const matchedAdmin = admins.find((a) => a.email.toLowerCase() === cleanEmail);
  if (matchedAdmin) {
    return {
      isValid: true,
      isMaster: false,
      admin: {
        ...matchedAdmin,
        name: user.displayName || matchedAdmin.name,
        photoUrl: user.photoURL || matchedAdmin.photoUrl,
        authProvider: 'google',
      },
    };
  }

  return {
    isValid: false,
    isMaster: false,
    message: `Akaun Google (${cleanEmail}) tidak mempunyai kebenaran akses Admin. Sila gunakan akaun Master Admin (khaikerr@gmail.com) atau hubungi pentadbir.`,
  };
}


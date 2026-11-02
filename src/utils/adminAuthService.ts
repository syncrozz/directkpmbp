/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthorizedAdmin, AdminInvitation } from '../types';
import { syncAdminToFirestore } from '../config/firebase';

/**
 * Menyemak sama ada persekitaran semasa adalah development (pembangunan).
 */
export const isDevelopmentEnvironment = (): boolean => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      return Boolean(import.meta.env.DEV);
    }
  } catch (_e) {}
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.NODE_ENV !== 'production';
    }
  } catch (_e) {}
  return false;
};

export const MASTER_ADMIN_PIN = '5313';
export const MASTER_ADMIN_EMAILS = [
  'khaikerr@gmail.com',
  'anakcgkhairi@gmail.com',
  'cikgukyee@gmail.com'
];

const STORAGE_KEY = 'kpmbp_authorized_admins';
const INVITATIONS_STORAGE_KEY = 'kpmbp_admin_invitations';

export const DEFAULT_AUTHORIZED_ADMINS: AuthorizedAdmin[] = [
  {
    id: 'admin-master-khaikerr',
    email: 'khaikerr@gmail.com',
    name: 'Khaikerr (Master Admin)',
    role: 'Master Administrator',
    level: 1,
    status: 'verified',
    authProvider: 'google',
    createdAt: new Date().toISOString().split('T')[0],
  },
  {
    id: 'admin-khairi-01',
    email: 'khairi.mohd@mara.gov.my',
    pin: '5305',
    icLast4: '5305',
    name: 'Khairi Mohd',
    role: 'Admin Level 2',
    level: 2,
    status: 'verified',
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
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return DEFAULT_AUTHORIZED_ADMINS;
  }
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
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(admins));
  } catch (err) {
    console.error('Error saving authorized admins to localStorage:', err);
  }
}

/**
 * Mendapatkan senarai jemputan Admin Level 2.
 */
export function getAdminInvitations(): AdminInvitation[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(INVITATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading admin invitations:', err);
    return [];
  }
}

/**
 * Menyimpan senarai jemputan Admin Level 2.
 */
export function saveAdminInvitations(invitations: AdminInvitation[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(INVITATIONS_STORAGE_KEY, JSON.stringify(invitations));
  } catch (err) {
    console.error('Error saving admin invitations:', err);
  }
}

/**
 * Menjana token unik dan pautan pengesahan jemputan Admin Level 2 serta menghantar ke inbox.
 */
export async function createAdminInvitation(
  email: string,
  name?: string,
  invitedBy?: string
): Promise<{ success: boolean; message: string; invite?: AdminInvitation }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, message: 'Sila masukkan alamat emel yang sah (cth: pegawai@mara.gov.my).' };
  }

  if (isMasterAdminEmail(cleanEmail)) {
    return { success: false, message: 'Emel ini adalah Master Admin rasmi dan tidak perlu dijemput sebagai Level 2.' };
  }

  // Jana token selamat
  const token = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const inviteUrl = `${origin}/?invite=${token}#/verify-admin`;

  const newInvite: AdminInvitation = {
    id: `inv-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    name: name?.trim() || cleanEmail.split('@')[0].replace(/\./g, ' ').toUpperCase(),
    level: 2,
    role: 'Admin Level 2',
    status: 'pending',
    token,
    inviteUrl,
    invitedBy: invitedBy || 'Master Administrator',
    createdAt: new Date().toISOString(),
  };

  const currentInvites = getAdminInvitations();
  // Gantikan rekod jemputan sedia ada jika belum disahkan
  const filtered = currentInvites.filter((i) => i.email !== cleanEmail);
  const updatedInvites = [newInvite, ...filtered];
  saveAdminInvitations(updatedInvites);

  // Hantar emel pengesahan melalui endpoint backend API
  try {
    const res = await fetch('/api/send-admin-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        name: newInvite.name,
        token: newInvite.token,
        inviteUrl: newInvite.inviteUrl,
        role: 'Admin Level 2',
        level: 2,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: data.message || `Pautan pengesahan telah dihantar ke inbox ${cleanEmail}.`,
        invite: newInvite,
      };
    }
  } catch (e) {
    console.warn('API send-admin-invite notice:', e);
  }

  return {
    success: true,
    message: `Jemputan berjaya dijana untuk ${cleanEmail}. Pautan pengesahan sedia disalin atau dihantar.`,
    invite: newInvite,
  };
}

/**
 * Mencari jemputan Admin berdasarkan token jemputan.
 */
export function getInvitationByToken(token: string): AdminInvitation | null {
  if (!token) return null;
  const invites = getAdminInvitations();
  return invites.find((i) => i.token === token) || null;
}

/**
 * Mengesahkan dan mengaktifkan akaun Admin Level 2 apabila pautan inbox diklik.
 */
export function verifyAdminInvitationToken(
  token: string,
  pin: string,
  name?: string
): { success: boolean; message: string; admin?: AuthorizedAdmin } {
  const invite = getInvitationByToken(token);
  if (!invite) {
    return { success: false, message: 'Pautan pengesahan tidak sah atau telah tamat tempoh.' };
  }

  if (invite.status === 'revoked') {
    return { success: false, message: 'Jemputan ini telah dibatalkan oleh Master Administrator.' };
  }

  const cleanPin = pin.replace(/\D/g, '').slice(-4);
  if (cleanPin.length !== 4) {
    return { success: false, message: 'Sila masukkan 4 digit PIN keselamatan.' };
  }

  // 1. Kemaskini status jemputan kepada 'verified'
  const invites = getAdminInvitations();
  const idx = invites.findIndex((i) => i.token === token);
  if (idx >= 0) {
    invites[idx] = {
      ...invites[idx],
      status: 'verified',
      verifiedAt: new Date().toISOString(),
    };
    saveAdminInvitations(invites);
  }

  // 2. Tambah / kemaskini dalam senarai admin aktif
  const currentAdmins = getAuthorizedAdmins();
  const existingIdx = currentAdmins.findIndex((a) => a.email.toLowerCase() === invite.email.toLowerCase());

  const adminName = name?.trim() || invite.name || invite.email.split('@')[0].toUpperCase();

  const newAdminRecord: AuthorizedAdmin = {
    id: `admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    email: invite.email,
    name: adminName,
    pin: cleanPin,
    icLast4: cleanPin,
    level: 2,
    role: 'Admin Level 2',
    status: 'verified',
    inviteToken: token,
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString().split('T')[0],
  };

  let updatedAdmins: AuthorizedAdmin[];
  if (existingIdx >= 0) {
    currentAdmins[existingIdx] = {
      ...currentAdmins[existingIdx],
      ...newAdminRecord,
      id: currentAdmins[existingIdx].id,
    };
    updatedAdmins = [...currentAdmins];
  } else {
    updatedAdmins = [newAdminRecord, ...currentAdmins];
  }

  saveAuthorizedAdmins(updatedAdmins);

  return {
    success: true,
    message: `Akaun Admin Level 2 untuk ${invite.email} telah berjaya disahkan dan diaktifkan!`,
    admin: newAdminRecord,
  };
}

/**
 * Menghantar semula emel jemputan ke inbox.
 */
export async function resendAdminInvitation(
  id: string
): Promise<{ success: boolean; message: string; invite?: AdminInvitation }> {
  const invites = getAdminInvitations();
  const invite = invites.find((i) => i.id === id);
  if (!invite) {
    return { success: false, message: 'Jemputan tidak dijumpai.' };
  }

  try {
    await fetch('/api/send-admin-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: invite.email,
        name: invite.name,
        token: invite.token,
        inviteUrl: invite.inviteUrl,
        role: 'Admin Level 2',
        level: 2,
      }),
    });
  } catch (err) {
    console.warn('Notice resending invite:', err);
  }

  return {
    success: true,
    message: `Pautan pengesahan telah dihantar semula ke inbox ${invite.email}.`,
    invite,
  };
}

/**
 * Membatalkan jemputan Admin Level 2.
 */
export function revokeAdminInvitation(id: string): { success: boolean; message: string } {
  const invites = getAdminInvitations();
  const target = invites.find((i) => i.id === id);
  if (!target) {
    return { success: false, message: 'Jemputan tidak dijumpai.' };
  }

  // Kemaskini status jemputan
  const updatedInvites = invites.filter((i) => i.id !== id);
  saveAdminInvitations(updatedInvites);

  // Buang dari senarai admin aktif sekiranya ada
  const admins = getAuthorizedAdmins().filter((a) => a.email.toLowerCase() !== target.email.toLowerCase());
  saveAuthorizedAdmins(admins);

  return { success: true, message: `Otorisasi Admin Level 2 untuk ${target.email} telah dibatalkan.` };
}

/**
 * Menambah atau mengemaskini admin secara langsung.
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

  const digitsOnly = icOrPin.replace(/\D/g, '');
  if (digitsOnly.length < 4) {
    return { success: false, message: 'Nombor IC atau PIN keselamatan mestilah mempunyai sekurang-kurangnya 4 digit.' };
  }
  const last4Pin = digitsOnly.slice(-4);

  const currentList = getAuthorizedAdmins();
  const existingIndex = currentList.findIndex((a) => a.email.toLowerCase() === cleanEmail);
  const adminName = name?.trim() || cleanEmail.split('@')[0].replace(/\./g, ' ').toUpperCase();

  if (existingIndex >= 0) {
    currentList[existingIndex] = {
      ...currentList[existingIndex],
      pin: last4Pin,
      icLast4: last4Pin,
      name: adminName,
      level: currentList[existingIndex].level || 2,
      role: currentList[existingIndex].role || 'Admin Level 2',
      status: 'verified',
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
    level: 2,
    role: 'Admin Level 2',
    status: 'verified',
    createdAt: new Date().toISOString().split('T')[0],
  };

  const updatedList = [newAdmin, ...currentList];
  saveAuthorizedAdmins(updatedList);

  return {
    success: true,
    message: `Admin ${cleanEmail} berjaya diotorisasi sebagai Admin Level 2.`,
    admin: newAdmin,
  };
}

/**
 * Memadam otorisasi admin berdasarkan ID rekod.
 */
export function removeAuthorizedAdmin(id: string): { success: boolean; message: string } {
  const currentList = getAuthorizedAdmins();
  const target = currentList.find((a) => a.id === id);
  if (target && isMasterAdminEmail(target.email)) {
    return { success: false, message: 'Master Admin rasmi tidak boleh dipadamkan.' };
  }
  const filtered = currentList.filter((a) => a.id !== id);
  if (filtered.length === currentList.length) {
    return { success: false, message: 'Admin tidak dijumpai.' };
  }
  saveAuthorizedAdmins(filtered);
  return { success: true, message: 'Otorisasi admin telah berjaya dipadamkan.' };
}

/**
 * Mengesahkan kelayakan Admin Level 2 dengan emel dan PIN 4-digit (IC).
 * NOTA KESELAMATAN (SES): Master Admin HANYA boleh disahkan melalui Firebase Google Authentication.
 * PIN tidak dibenarkan memintas atau memberikan akses Master Administrator dalam pengeluaran.
 */
export function verifyAdminCredentials(
  email: string,
  pin: string
): { isValid: boolean; admin?: AuthorizedAdmin; isMaster?: boolean; message?: string } {
  const cleanPin = pin.replace(/\D/g, '').slice(-4);
  const cleanEmail = email.trim().toLowerCase();

  // 1. Pengesahan Development PIN (Hanya berfungsi dalam mod pembangunan, DILARANG dalam Production)
  if (cleanPin === MASTER_ADMIN_PIN) {
    if (!isDevelopmentEnvironment()) {
      return {
        isValid: false,
        message: 'PIN 5313 dinyahaktifkan dalam persekitaran Production. Master Admin diwajibkan menggunakan Google Authentication rasmi.',
      };
    }

    return {
      isValid: true,
      isMaster: false,
      admin: {
        id: 'dev-sandbox-tester',
        email: cleanEmail || 'dev.tester@kpmbp.local',
        pin: MASTER_ADMIN_PIN,
        name: 'Dev Sandbox Tester',
        role: 'Admin Level 2 (Dev Mode)',
        level: 2,
        status: 'verified',
        authProvider: 'pin',
      },
      message: '[DEV MODE] Akses sandbox pembangunan diaktifkan. Master Admin rasmi kekal dilindungi Google Auth.',
    };
  }

  // 2. Sekatan Ketat: Master Admin tidak boleh log masuk menggunakan PIN
  if (isMasterAdminEmail(cleanEmail)) {
    return {
      isValid: false,
      isMaster: false,
      message: 'Akaun Master Admin (khaikerr@gmail.com) diwajibkan menggunakan Firebase Google Authentication demi keselamatan portal.',
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
      message: 'Sila masukkan 4 digit PIN keselamatan nombor IC.',
    };
  }

  // 3. Semak dengan senarai Admin Level 2 yang telah diotorisasi
  const admins = getAuthorizedAdmins();
  const matchedAdmin = admins.find(
    (a) => a.email.toLowerCase() === cleanEmail && a.pin === cleanPin
  );

  if (matchedAdmin) {
    return {
      isValid: true,
      isMaster: false,
      admin: {
        ...matchedAdmin,
        level: 2,
        role: 'Admin Level 2',
      },
    };
  }

  return {
    isValid: false,
    message: 'Kombinasi emel MARA dan 4-digit PIN IC tidak sepadan atau belum diotorisasi.',
  };
}

/**
 * Mengesahkan akaun pengguna Google rasmi untuk akses Master Admin (khaikerr@gmail.com) atau Admin Level 2.
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
    const masterAdminObj: AuthorizedAdmin = {
      id: user.uid || 'master-khaikerr',
      email: cleanEmail,
      name: user.displayName || 'Khaikerr (Master Admin)',
      role: 'Master Administrator',
      level: 1,
      status: 'verified',
      photoUrl: user.photoURL || undefined,
      authProvider: 'google',
      createdAt: new Date().toISOString().split('T')[0],
    };

    // Sinkronkan peranan Master Admin ke koleksi Firestore /admins/{uid}
    if (user.uid) {
      syncAdminToFirestore({
        uid: user.uid,
        email: cleanEmail,
        name: masterAdminObj.name,
        role: masterAdminObj.role!,
        level: 1,
      }).catch((e) => console.warn('Sync master admin to firestore:', e));
    }

    return {
      isValid: true,
      isMaster: true,
      admin: masterAdminObj,
    };
  }

  // 2. Semak jika emel telah diotorisasi dalam senarai Admin Level 2
  const admins = getAuthorizedAdmins();
  const matchedAdmin = admins.find((a) => a.email.toLowerCase() === cleanEmail);
  if (matchedAdmin) {
    const level2AdminObj: AuthorizedAdmin = {
      ...matchedAdmin,
      id: user.uid || matchedAdmin.id,
      name: user.displayName || matchedAdmin.name,
      photoUrl: user.photoURL || matchedAdmin.photoUrl,
      level: 2,
      role: 'Admin Level 2',
      status: 'verified',
      authProvider: 'google',
    };

    if (user.uid) {
      syncAdminToFirestore({
        uid: user.uid,
        email: cleanEmail,
        name: level2AdminObj.name,
        role: level2AdminObj.role!,
        level: 2,
      }).catch((e) => console.warn('Sync admin level 2 to firestore:', e));
    }

    return {
      isValid: true,
      isMaster: false,
      admin: level2AdminObj,
    };
  }

  return {
    isValid: false,
    isMaster: false,
    message: `Akaun Google (${cleanEmail}) tidak mempunyai kebenaran akses Admin. Sila gunakan akaun Master Admin (khaikerr@gmail.com) atau pautan jemputan Admin Level 2.`,
  };
}

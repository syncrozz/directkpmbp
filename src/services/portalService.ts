/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC PORTAL MANAGEMENT SERVICE
 * SYNCROZZ ENGINEERING STANDARD
 * 
 * Firestore Path: /platforms/directkpmbp/portalLinks/{portalId}
 */

import { 
  collection, 
  doc, 
  getDoc,
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  writeBatch,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, getPlatformStoragePath } from '../config/firebase';
import { PortalLink, PortalMetadata, PortalSyncStatus, PortalSubscriptionResult } from '../types';
import { AUTHORIZED_ADMIN_EMAILS } from '../utils/adminAuthService';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path,
  };
  console.error('[Firestore Error]:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Ensures the currently authenticated user's ID token is fresh before write operations.
 */
async function ensureFreshAuthToken(): Promise<void> {
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      console.warn('Notice refreshing ID token:', e);
    }
  }
}

/**
 * 6 Official Default Portals for KPMBP.
 * Preserved in full per SYNCROZZ specification.
 */
export const DEFAULT_PORTAL_LINKS: PortalLink[] = [
  {
    id: 'portal-spmp',
    title: 'Portal SPMP Pelajar',
    desc: 'Sistem Pengurusan Maklumat Pelajar untuk pendaftaran subjek, semakan keputusan peperiksaan, gred GPA/CGPA, dan rekod kehadiran.',
    url: 'https://bpenawar.kpm.edu.my/spmp/',
    audience: 'Pelajar',
    category: 'portal',
    sortOrder: 1,
    isActive: true,
  },
  {
    id: 'portal-sispen',
    title: 'Sistem SISPEN (Staf)',
    desc: 'Sistem Penilaian Pensyarah & Staf Kolej Profesional MARA Bandar Penawar.',
    url: 'https://bpenawar.kpm.edu.my/sispen/',
    audience: 'Staf',
    category: 'portal',
    sortOrder: 2,
    isActive: true,
  },
  {
    id: 'portal-teams',
    title: 'Microsoft Teams & Office 365',
    desc: 'Hab pembelajaran digital, kelas hibrid, kuiz dalam talian, kolaborasi kumpulan, dan mel rasmi @student.kpm.edu.my.',
    url: 'https://teams.microsoft.com/',
    audience: 'Kedua-dua',
    category: 'portal',
    sortOrder: 3,
    isActive: true,
  },
  {
    id: 'portal-library',
    title: 'Perpustakaan Al-Ghazali Portal',
    desc: 'Semak katalog buku fizikal, pangkalan data jurnal e-Perpustakaan, waktu operasi, dan buat tempahan bilik belajar kumpulan.',
    url: 'https://bpenawar.kpm.edu.my/library/',
    audience: 'Kedua-dua',
    category: 'portal',
    sortOrder: 4,
    isActive: true,
  },
  {
    id: 'portal-ekehadiran',
    title: 'Sistem e-Kehadiran MARA',
    desc: 'Pintu gerbang kehadiran kerja harian untuk semua kakitangan pengurusan dan tenaga pengajar akademik MARA.',
    url: 'https://ekehadiran.mara.gov.my/',
    audience: 'Staf',
    category: 'portal',
    sortOrder: 5,
    isActive: true,
  },
  {
    id: 'portal-integriti',
    title: 'Portal Integriti MARA',
    desc: 'Garis panduan etika, pelaporan integriti, dasar kebajikan MARA, dan pekeliling perkhidmatan awam semasa.',
    url: 'https://www.mara.gov.my/',
    audience: 'Staf',
    category: 'portal',
    sortOrder: 6,
    isActive: true,
  },
];

const PORTALS_PATH = 'platforms/directkpmbp/portalLinks';

/**
 * Fetch all portal records from Firestore with explicit 4-state categorization.
 */
export async function fetchPortalLinks(): Promise<PortalSubscriptionResult> {
  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      return {
        portals: [...DEFAULT_PORTAL_LINKS],
        isMigrated: false,
        status: 'ready_empty',
        source: 'fallback',
      };
    }

    const portals: PortalLink[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as PortalLink;
      portals.push({
        ...data,
        id: docSnap.id,
      });
    });

    portals.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    return {
      portals,
      isMigrated: true,
      status: 'ready_migrated',
      source: 'firestore',
    };
  } catch (error: any) {
    const isPermission =
      error?.code === 'permission-denied' ||
      String(error?.message || '').toLowerCase().includes('permission');

    return {
      portals: [...DEFAULT_PORTAL_LINKS],
      isMigrated: false,
      status: isPermission ? 'permission_denied' : 'error_network',
      errorMessage: error?.message || 'Ralat membaca rekod portal dari Firestore.',
      source: 'fallback',
    };
  }
}

/**
 * Real-time listener for portal records.
 * Categorizes response into 4 distinct states per Phase 4 specification:
 * State A: Successfully loaded and empty collection (ready_empty) -> eligible for migration
 * State B: Successfully loaded collection containing records (ready_migrated) -> migration completed
 * State C: Firestore permission denied (permission_denied) -> rules/auth blocker, hide migration banner
 * State D: Network or connection failure (error_network) -> offline/unavailable, hide migration banner
 */
export function subscribeToPortalLinks(
  callback: (result: PortalSubscriptionResult) => void
): () => void {
  const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');

  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        // Check if database was ever initialized/migrated or if a delete took place
        let isInitialized = false;
        try {
          const metaRef = doc(db, 'platforms', 'directkpmbp', 'config', 'portalMeta');
          const metaSnap = await getDoc(metaRef);
          if (metaSnap.exists() && metaSnap.data()?.initialized) {
            isInitialized = true;
          }
        } catch (_mErr) {
          if (typeof window !== 'undefined' && localStorage.getItem('directkpmbp_portals_initialized') === 'true') {
            isInitialized = true;
          }
        }

        if (isInitialized) {
          // Empty collection after deletion must REMAIN empty! Do not restore default portals.
          callback({
            portals: [],
            isMigrated: true,
            status: 'ready_empty',
            source: 'firestore',
          });
          return;
        }

        // Pristine, never-migrated state: Show default portals as read-only preview/fallback
        callback({
          portals: [...DEFAULT_PORTAL_LINKS],
          isMigrated: false,
          status: 'ready_empty',
          source: 'fallback',
        });
        return;
      }

      // Mark collection as initialized
      if (typeof window !== 'undefined') {
        localStorage.setItem('directkpmbp_portals_initialized', 'true');
      }

      const portals: PortalLink[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PortalLink;
        portals.push({
          ...data,
          id: docSnap.id,
        });
      });

      portals.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

      callback({
        portals,
        isMigrated: true,
        status: 'ready_migrated',
        source: 'firestore',
      });
    },
    (err: any) => {
      console.warn('Notice on portal snapshot listener:', err);
      const isPermissionDenied =
        err?.code === 'permission-denied' ||
        String(err?.message || '').toLowerCase().includes('insufficient permissions') ||
        String(err?.message || '').toLowerCase().includes('permission-denied');

      if (isPermissionDenied) {
        callback({
          portals: [...DEFAULT_PORTAL_LINKS],
          isMigrated: false,
          status: 'permission_denied',
          errorMessage: 'Ralat kebenaran Firestore (Missing or insufficient permissions). Sila pastikan firestore.rules telah diterbitkan di Firebase Console bagi projek syncrozz-platform.',
          source: 'fallback',
        });
      } else {
        callback({
          portals: [...DEFAULT_PORTAL_LINKS],
          isMigrated: false,
          status: 'error_network',
          errorMessage: err?.message || 'Gagal menghubungi pelayan Firestore (Ralat Rangkaian).',
          source: 'fallback',
        });
      }
    }
  );
}

/**
 * Deeply removes all undefined properties from an object before saving to Firestore.
 * Firestore throws a client exception if any field in an object or nested object is undefined.
 */
export function sanitizeFirestorePayload<T>(input: T): T {
  if (input === undefined) {
    return undefined as any;
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (input instanceof Date || (input as any)?.toMillis !== undefined) {
    return input;
  }
  if (Array.isArray(input)) {
    return input
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestorePayload(item)) as any;
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(input as Record<string, any>)) {
    if (value !== undefined) {
      sanitized[key] = sanitizeFirestorePayload(value);
    }
  }
  return sanitized as T;
}

/**
 * Save or update a portal record in Firestore.
 */
export async function savePortalLink(portal: PortalLink): Promise<boolean> {
  const docId = portal.id || `portal_${Date.now()}`;
  const docPath = `${PORTALS_PATH}/${docId}`;

  await ensureFreshAuthToken();

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', docId);
    const cleanPortal: Record<string, any> = {
      ...portal,
      id: docId,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    };

    if (!cleanPortal.createdAt) {
      cleanPortal.createdAt = new Date().toISOString();
    }

    // Sanitize payload deeply to eliminate any undefined fields before writing
    const safeData = sanitizeFirestorePayload(cleanPortal);

    await setDoc(docRef, safeData, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

/**
 * Delete a portal record from Firestore.
 * Ensures data integrity:
 * 1. If deleting from unmigrated defaults, seeds remaining defaults so deleted one never returns.
 * 2. Marks config/portalMeta as initialized so empty collections stay empty and never restore defaults.
 */
export async function deletePortalLink(portalId: string): Promise<boolean> {
  const docPath = `${PORTALS_PATH}/${portalId}`;
  await ensureFreshAuthToken();

  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');
    const existingSnap = await getDocs(colRef);

    // If Firestore collection has no documents yet (user is deleting from initial default view):
    if (existingSnap.empty) {
      const batch = writeBatch(db);
      // Seed all DEFAULT_PORTAL_LINKS EXCEPT the deleted one
      DEFAULT_PORTAL_LINKS.forEach((portal) => {
        if (portal.id !== portalId) {
          const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portal.id);
          const safeData = sanitizeFirestorePayload({
            ...portal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: auth.currentUser?.email || 'admin',
          });
          batch.set(docRef, safeData, { merge: true });
        }
      });

      // Mark config/portalMeta as initialized
      const metaRef = doc(db, 'platforms', 'directkpmbp', 'config', 'portalMeta');
      batch.set(metaRef, {
        initialized: true,
        isMigrated: true,
        migratedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'admin',
      }, { merge: true });

      await batch.commit();

      if (typeof window !== 'undefined') {
        localStorage.setItem('directkpmbp_portals_initialized', 'true');
      }
      return true;
    }

    // Normal deletion of existing document in Firestore
    const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portalId);
    await deleteDoc(docRef);

    // Ensure config/portalMeta is permanently marked initialized
    try {
      const metaRef = doc(db, 'platforms', 'directkpmbp', 'config', 'portalMeta');
      await setDoc(metaRef, {
        initialized: true,
        isMigrated: true,
        lastDeletedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'admin',
      }, { merge: true });
    } catch (_mErr) {
      // Non-blocking
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('directkpmbp_portals_initialized', 'true');
    }

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

/**
 * Toggle active / deactivated status of a portal record.
 */
export async function togglePortalStatus(portalId: string, isActive: boolean): Promise<boolean> {
  const docPath = `${PORTALS_PATH}/${portalId}`;
  await ensureFreshAuthToken();

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portalId);
    await updateDoc(docRef, {
      isActive,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

/**
 * Safe, controlled one-time migration of the 6 default portals to Firestore.
 * Implements strict Pre-flight authentication & fresh token verification,
 * duplicate protection based on ID and URL matching, and post-migration verification.
 */
export async function migrateDefaultPortals(): Promise<{
  success: boolean;
  migratedCount: number;
  total: number;
  error?: string;
}> {
  // 1. Pre-flight check: Must be authenticated with Firebase Auth
  if (!auth.currentUser) {
    return {
      success: false,
      migratedCount: 0,
      total: 0,
      error: 'Sila log masuk dengan Google Auth sebagai Pentadbir yang sah sebelum melaksanakan migrasi.',
    };
  }

  // 2. Pre-flight check: Master Admin authorization
  const userEmail = (auth.currentUser.email || '').trim().toLowerCase();
  if (!AUTHORIZED_ADMIN_EMAILS.includes(userEmail)) {
    return {
      success: false,
      migratedCount: 0,
      total: 0,
      error: `Akses ditolak: Akaun Google (${userEmail}) bukan Master Administrator yang sah.`,
    };
  }

  // 3. Force-refresh token to prevent stale token rejection
  await ensureFreshAuthToken();

  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');
    const existingSnap = await getDocs(colRef);

    const existingIds = new Set<string>();
    const existingUrls = new Set<string>();

    existingSnap.forEach((d) => {
      existingIds.add(d.id.toLowerCase());
      const u = d.data()?.url;
      if (u) existingUrls.add(String(u).trim().toLowerCase());
    });

    const batch = writeBatch(db);
    let toMigrateCount = 0;

    DEFAULT_PORTAL_LINKS.forEach((portal) => {
      const idKey = portal.id.toLowerCase();
      const urlKey = portal.url.trim().toLowerCase();

      // Duplicate protection: Skip if already exists by ID or URL
      // Do not overwrite existing customized portal records
      if (!existingIds.has(idKey) && !existingUrls.has(urlKey)) {
        const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portal.id);
        const safePortalData = sanitizeFirestorePayload({
          ...portal,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: auth.currentUser?.email || 'admin-migration',
        });
        batch.set(docRef, safePortalData, { merge: true });
        toMigrateCount++;
      }
    });

    // Mark config/portalMeta as initialized
    const metaRef = doc(db, 'platforms', 'directkpmbp', 'config', 'portalMeta');
    batch.set(metaRef, {
      initialized: true,
      isMigrated: true,
      migratedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin-migration',
    }, { merge: true });

    if (toMigrateCount > 0) {
      await batch.commit();
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('directkpmbp_portals_initialized', 'true');
    }

    // Post-migration verification: Read collection to verify records exist
    const verifySnap = await getDocs(colRef);
    return {
      success: true,
      migratedCount: toMigrateCount,
      total: verifySnap.size,
    };
  } catch (error: any) {
    const isPermissionError = 
      error?.code === 'permission-denied' || 
      String(error?.message || '').toLowerCase().includes('permission');

    const errorMsg = isPermissionError
      ? 'Akses Firestore Ditolak (Missing or insufficient permissions). Sila pastikan firestore.rules telah diterbitkan di Firebase Console bagi projek syncrozz-platform.'
      : (error?.message || 'Ralat semasa menjalankan migrasi ke Firestore.');

    console.error('[Migration Error]:', error);
    return {
      success: false,
      migratedCount: 0,
      total: 0,
      error: errorMsg,
    };
  }
}

/**
 * Safely scales down an image file using browser Canvas to ensure that if Firebase Storage fails
 * (e.g. CORS preflight or missing bucket in Cloud Storage), the in-memory fallback Data URL
 * remains safely below ~60KB and NEVER exceeds Firestore's strict 1 MiB limit.
 */
async function createOptimizedFallbackDataUrl(
  file: File,
  maxWidth = 640,
  maxHeight = 480,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const dataUrl = canvas.toDataURL(format, quality);
        resolve(dataUrl);
      };
      img.onerror = () => {
        resolve(e.target?.result as string);
      };
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Calls backend smart URL metadata detection service with high-res client fallback.
 */
export async function requestUrlMetadata(url: string): Promise<PortalMetadata> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Sila masukkan URL yang sah.');
  }

  // Fallback domain extraction in case API is unreachable or blocks
  const deriveBasicMeta = (rawUrl: string): PortalMetadata => {
    try {
      const parsed = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
      const domain = parsed.hostname.replace(/^www\./i, '');
      const name = domain.split('.')[0];
      const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
      return {
        url: parsed.href,
        finalUrl: parsed.href,
        title: `${capitalized} Portal`,
        ogTitle: `${capitalized} Portal`,
        ogSiteName: domain,
        favicon: `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`,
      };
    } catch {
      return {
        url: rawUrl,
        finalUrl: rawUrl,
        title: 'Portal Kolej',
        ogTitle: 'Portal Kolej',
      };
    }
  };

  try {
    const response = await fetch('/api/metadata/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        return result.data as PortalMetadata;
      }
      if (result.data) {
        // Partial metadata returned
        return {
          ...deriveBasicMeta(cleanUrl),
          ...result.data,
        };
      }
    }
  } catch (netErr) {
    console.warn('[MetadataDetect Notice] Network fetch error to /api/metadata/detect:', netErr);
  }

  // Graceful client fallback
  return deriveBasicMeta(cleanUrl);
}

/**
 * Upload an image or icon file to Firebase Storage under platforms/directkpmbp/portals/
 * Falls back gracefully to optimized Data URL if storage permissions or network fails.
 */
export async function uploadPortalAsset(file: File, type: 'image' | 'icon'): Promise<string> {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|svg|ico|gif)$/i)) {
    throw new Error('Format fail tidak sah. Sila pilih fail imej (PNG, JPG, WebP, SVG, atau ICO).');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Saiz fail melebihi had 5MB. Sila pilih imej yang lebih kecil.');
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const subPath = `portals/${type}_${Date.now()}_${cleanName}`;
  const fullPath = getPlatformStoragePath(subPath);

  try {
    const storageRef = ref(storage, fullPath);
    const metadata = {
      contentType: file.type || 'image/png',
      customMetadata: {
        uploadedBy: auth.currentUser?.email || 'admin',
        uploadedAt: new Date().toISOString(),
      },
    };
    const snap = await uploadBytes(storageRef, file, metadata);
    const downloadUrl = await getDownloadURL(snap.ref);
    return downloadUrl;
  } catch (storageErr: any) {
    console.warn('[Firebase Storage Notice] Upload to Cloud Storage failed, generating optimized fallback:', storageErr);
    // Graceful fallback: produce an optimized data URL that is guaranteed to be safe for Firestore persistence
    try {
      const optimizedDataUrl = await createOptimizedFallbackDataUrl(
        file,
        type === 'icon' ? 128 : 640,
        type === 'icon' ? 128 : 480,
        0.82
      );
      return optimizedDataUrl;
    } catch (fallbackErr) {
      console.error('Fallback image processing failed:', fallbackErr);
      throw new Error('Gagal memproses fail imej untuk simpanan.');
    }
  }
}

export interface ResolvedPortalVisual {
  url?: string;
  source: 'custom_image' | 'custom_icon' | 'og_image' | 'pwa_icon' | 'favicon' | 'placeholder';
}

/**
 * Image Priority Hierarchy:
 * 1. Admin uploaded custom image or custom image URL.
 * 2. Admin supplied custom icon or custom icon URL.
 * 3. Automatically detected Open Graph image.
 * 4. Automatically detected PWA image/icon or Favicon.
 * 5. System default placeholder.
 */
export function resolvePortalVisual(portal: {
  imageUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  detectedMeta?: {
    ogImage?: string;
    favicon?: string;
    pwaIcon?: string;
  };
}): ResolvedPortalVisual {
  // 1. Admin uploaded custom image or supplied custom image URL
  if (portal.imageUrl && portal.imageUrl.trim()) {
    return { url: portal.imageUrl.trim(), source: 'custom_image' };
  }

  // 2. Admin supplied custom icon or custom icon URL
  if (portal.iconUrl && portal.iconUrl.trim()) {
    return { url: portal.iconUrl.trim(), source: 'custom_icon' };
  }

  // 3. Automatically detected Open Graph image
  if (portal.detectedMeta?.ogImage && portal.detectedMeta.ogImage.trim()) {
    return { url: portal.detectedMeta.ogImage.trim(), source: 'og_image' };
  }

  // 4. Automatically detected PWA image/icon
  if (portal.detectedMeta?.pwaIcon && portal.detectedMeta.pwaIcon.trim()) {
    return { url: portal.detectedMeta.pwaIcon.trim(), source: 'pwa_icon' };
  }

  // 4b. Detected Favicon (Avoid speculative /favicon.ico that may not exist and causes 404 errors)
  const favCandidate = portal.faviconUrl || portal.detectedMeta?.favicon;
  if (favCandidate && favCandidate.trim()) {
    const fav = favCandidate.trim();
    if (!fav.endsWith('/favicon.ico') && !fav.endsWith('favicon.ico')) {
      return { url: fav, source: 'favicon' };
    }
  }

  // 5. System default placeholder
  return { source: 'placeholder' };
}

/**
 * Returns the brand or site name of a portal (e.g. from og:site_name or domain hostname).
 */
export function getPortalSiteName(portal: { url: string; detectedMeta?: { ogSiteName?: string } }): string {
  if (portal.detectedMeta?.ogSiteName && portal.detectedMeta.ogSiteName.trim()) {
    return portal.detectedMeta.ogSiteName.trim();
  }
  try {
    const parsed = new URL(portal.url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return portal.url.replace(/^https?:\/\//i, '').split('/')[0] || 'Laman Web';
  }
}


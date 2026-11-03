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
  getDocs, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  writeBatch,
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { PortalLink, PortalMetadata } from '../types';

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
 * Fetch all portal records from Firestore.
 * Does NOT auto-seed if empty. Returns fallback defaults with isMigrated=false.
 */
export async function fetchPortalLinks(): Promise<{ portals: PortalLink[]; isMigrated: boolean }> {
  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      return {
        portals: [...DEFAULT_PORTAL_LINKS],
        isMigrated: false,
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
    };
  } catch (error) {
    console.warn('Notice reading portals from Firestore (fallback active):', error);
    return {
      portals: [...DEFAULT_PORTAL_LINKS],
      isMigrated: false,
    };
  }
}

/**
 * Real-time listener for portal records.
 */
export function subscribeToPortalLinks(
  callback: (result: { portals: PortalLink[]; isMigrated: boolean }) => void
): () => void {
  const colRef = collection(db, 'platforms', 'directkpmbp', 'portalLinks');

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        callback({
          portals: [...DEFAULT_PORTAL_LINKS],
          isMigrated: false,
        });
        return;
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
      });
    },
    (err) => {
      console.warn('Notice on portal snapshot listener:', err);
      callback({
        portals: [...DEFAULT_PORTAL_LINKS],
        isMigrated: false,
      });
    }
  );
}

/**
 * Save or update a portal record in Firestore.
 */
export async function savePortalLink(portal: PortalLink): Promise<boolean> {
  const docId = portal.id || `portal_${Date.now()}`;
  const docPath = `${PORTALS_PATH}/${docId}`;

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', docId);
    const cleanPortal: PortalLink = {
      ...portal,
      id: docId,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    };

    if (!cleanPortal.createdAt) {
      cleanPortal.createdAt = new Date().toISOString();
    }

    await setDoc(docRef, cleanPortal, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

/**
 * Delete a portal record from Firestore.
 */
export async function deletePortalLink(portalId: string): Promise<boolean> {
  const docPath = `${PORTALS_PATH}/${portalId}`;
  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portalId);
    await deleteDoc(docRef);
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
 * Implements duplicate protection based on ID and URL matching.
 */
export async function migrateDefaultPortals(): Promise<{
  success: boolean;
  migratedCount: number;
  total: number;
  error?: string;
}> {
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
      if (!existingIds.has(idKey) && !existingUrls.has(urlKey)) {
        const docRef = doc(db, 'platforms', 'directkpmbp', 'portalLinks', portal.id);
        batch.set(
          docRef,
          {
            ...portal,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: auth.currentUser?.email || 'admin-migration',
          },
          { merge: true }
        );
        toMigrateCount++;
      }
    });

    if (toMigrateCount > 0) {
      await batch.commit();
    }

    // Verify written count
    const verifySnap = await getDocs(colRef);
    return {
      success: true,
      migratedCount: toMigrateCount,
      total: verifySnap.size,
    };
  } catch (error: any) {
    console.error('Ralat semasa migrasi portal ke Firestore:', error);
    return {
      success: false,
      migratedCount: 0,
      total: 0,
      error: error?.message || 'Ralat migrasi ke Firestore.',
    };
  }
}

/**
 * Calls backend smart URL metadata detection service.
 */
export async function requestUrlMetadata(url: string): Promise<PortalMetadata> {
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    throw new Error('Sila masukkan URL yang sah.');
  }

  const response = await fetch('/api/metadata/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: cleanUrl }),
  });

  if (!response.ok) {
    throw new Error(`Ralat pelayan (${response.status}) semasa mengesan metadata.`);
  }

  const result = await response.json();
  if (!result.success || !result.data) {
    throw new Error(result.error || 'Gagal mengesan metadata laman web.');
  }

  return result.data as PortalMetadata;
}

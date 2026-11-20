import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  writeBatch,
  onSnapshot,
  serverTimestamp,
  setLogLevel,
  getDocFromServer,
  getDoc
} from 'firebase/firestore';

// Silence internal Firestore connection notices (e.g. 10s backend timeout in preview/sandboxes)
setLogLevel('silent');
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';
import { Staff, StaffCommittee } from '../types';

// Authoritative Firebase configuration from firebase-applet-config.json (syncrozz4).
// Prevents mismatched container-injected VITE_FIREBASE_API_KEY or FIREBASE_API_KEY overrides.
export const effectiveFirebaseConfig = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(effectiveFirebaseConfig) : getApps()[0];

// Initialize Firebase Storage
export const storage = getStorage(app);

// Shared SYNCROZZ Platform Storage namespace for DIRECTKPMBP
export const STORAGE_PLATFORM_NAMESPACE = 'platforms/directkpmbp';

/**
 * Resolves a storage path scoped within the DIRECTKPMBP platform namespace
 */
export function getPlatformStoragePath(subPath: string): string {
  const clean = subPath.replace(/^\/+/, '');
  return `${STORAGE_PLATFORM_NAMESPACE}/${clean}`;
}

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const signInWithGoogle = async (): Promise<User> => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

export const signOutAdmin = async (): Promise<void> => {
  await firebaseSignOut(auth);
};

export const subscribeToAuthChanges = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Persist or update an authenticated admin document in Firestore '/admins/{uid}'
 */
export const syncAdminToFirestore = async (admin: {
  uid: string;
  email: string;
  name?: string;
  role: string;
  level: number;
}): Promise<void> => {
  try {
    const adminRef = doc(db, 'admins', admin.uid);
    await setDoc(adminRef, {
      ...admin,
      updatedAt: serverTimestamp(),
      verifiedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn('Notice syncing admin profile to Firestore:', err);
  }
};

// Initialize Firestore with specific database ID and experimentalForceLongPolling
// to prevent 10-second WebChannel stream timeouts in iframe/sandbox environments
export const db = (() => {
  const dbId = 
    !firebaseConfig.firestoreDatabaseId || 
    firebaseConfig.firestoreDatabaseId === 'default' || 
    firebaseConfig.firestoreDatabaseId === '(default)'
      ? undefined
      : firebaseConfig.firestoreDatabaseId;

  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        ignoreUndefinedProperties: true,
      },
      dbId
    );
  } catch (_e) {
    return dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
})();

// Validate Connection to Firestore on boot
export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testFirestoreConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * 13 StaffID lama (Unit JTM) yang merupakan duplikat kepada StaffID baharu
 */
export const LEGACY_JTM_IDS = [
  'ST005', 'ST006', 'ST007', 'ST008', 'ST013',
  'ST014', 'ST016', 'ST017', 'ST024', 'ST025',
  'ST063', 'ST067', 'ST070'
];

export interface CleanupPreview {
  firestoreReachable: boolean;
  isAuthenticated: boolean;
  targetIds: string[];
  firestoreDocIds: string[];
  summaryTargetIds: string[];
  localTargetIds: string[];
  ambiguousIds: string[];
  preservedCount: number;
  expectedRemainingCount: number;
  selectionCriteria: string;
  canExecute: boolean;
  blockReason?: string;
}

export interface CleanupResult {
  deletedCount: number;
  removedFromSummaryCount: number;
  remainingCount: number;
  deletedIds: string[];
  cleanedStaffList: Staff[];
  firestoreConfirmed: boolean;
}

export interface FirestoreSaveDetailedResult {
  firestoreConfirmed: boolean;
  partialFailure: boolean;
  errorDetail?: string;
}

/**
 * Save staff list directly to Firebase Firestore with detailed confirmation & partial-failure reporting.
 */
export const saveStaffListToFirestoreDetailed = async (
  staffList: Staff[]
): Promise<FirestoreSaveDetailedResult> => {
  // Guard: Writing requires an active authenticated administrator
  if (!auth.currentUser) {
    console.warn('[Firestore] Notice: Penulisan staf ke Firestore dibatalkan kerana pengguna belum log masuk sebagai pentadbir.');
    return {
      firestoreConfirmed: false,
      partialFailure: false,
      errorDetail: 'Pengguna belum log masuk sebagai Master Admin.',
    };
  }

  let wroteSummaryOrBatches = false;
  try {
    // 1. Single summary container document for instant bulk syncing
    const summaryRef = doc(db, 'system', 'staff_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: staffList.length,
      data: staffList,
    });
    wroteSummaryOrBatches = true;

    // 2. Individual documents in 'staff' collection (in chunks of up to 400 per batch)
    const chunkSize = 400;
    const activeDocIds = new Set<string>();

    for (let i = 0; i < staffList.length; i += chunkSize) {
      const chunk = staffList.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const rawId = s.ID || s.staff_id || `ST_${Math.random().toString(36).substring(2, 8)}`;
        const docId = rawId.toUpperCase().trim().replace(/[\/\s]/g, '_');
        activeDocIds.add(docId);
        const staffRef = doc(db, 'staff', docId);
        batch.set(staffRef, s, { merge: true });
      });
      await batch.commit();
    }

    // 3. Read all documents in 'staff' collection and purge any document not in activeDocIds
    try {
      const allStaffDocsSnap = await getDocs(collection(db, 'staff'));
      const docsToDelete: string[] = [];

      allStaffDocsSnap.forEach((d) => {
        const normalizedId = d.id.toUpperCase().trim();
        if (!activeDocIds.has(normalizedId)) {
          docsToDelete.push(d.id);
        }
      });

      if (docsToDelete.length > 0) {
        for (let i = 0; i < docsToDelete.length; i += chunkSize) {
          const deleteChunk = docsToDelete.slice(i, i + chunkSize);
          const deleteBatch = writeBatch(db);
          deleteChunk.forEach((delId) => {
            deleteBatch.delete(doc(db, 'staff', delId));
          });
          await deleteBatch.commit();
        }
      }
    } catch (cleanupErr: any) {
      console.warn('Perhatian semasa membersihkan dokumen staf terbuang:', cleanupErr);
      return {
        firestoreConfirmed: false,
        partialFailure: true,
        errorDetail: `Ringkasan dikemas kini, tetapi pembersihan dokumen staf terbuang gagal: ${cleanupErr?.message || cleanupErr}`,
      };
    }

    return { firestoreConfirmed: true, partialFailure: false };
  } catch (error: any) {
    console.warn('[Firestore] Notice ralat menyimpan senarai staf ke Firebase Firestore:', error?.message || error);
    return {
      firestoreConfirmed: false,
      partialFailure: wroteSummaryOrBatches,
      errorDetail: error?.message || String(error),
    };
  }
};

/**
 * Save staff list directly to Firebase Firestore:
 * Returns true only when full write and purge complete cleanly.
 */
export const saveStaffListToFirestore = async (staffList: Staff[]): Promise<boolean> => {
  const res = await saveStaffListToFirestoreDetailed(staffList);
  return res.firestoreConfirmed;
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.resolve(fallback);
  }
  let timer: any;
  const timeoutPromise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
};

/**
 * Fetch staff list from Firebase Firestore:
 * system/staff_data is the single primary source of truth.
 * Documents from 'staff' collection only merge extra fields into IDs already present in staff_data.
 * No new IDs from 'staff' collection are added if staff_data is populated.
 */
export const fetchStaffListFromFirestore = async (): Promise<Staff[]> => {
  return withTimeout(
    (async () => {
      try {
        const staffSummarySnap = await getDoc(doc(db, 'system', 'staff_data'));
        let foundData: Staff[] = [];
        if (staffSummarySnap.exists() && Array.isArray(staffSummarySnap.data()?.data)) {
          foundData = staffSummarySnap.data().data;
        }

        // Exclude any legacy JTM duplicates from foundData if present
        foundData = foundData.filter((s) => {
          const id = (s.ID || s.staff_id || '').toUpperCase().trim();
          return !LEGACY_JTM_IDS.includes(id) && s.Unit !== 'JTM';
        });

        const staffMap = new Map<string, Staff>();
        foundData.forEach((s) => {
          const id = (s.ID || s.staff_id || '').toUpperCase().trim();
          if (id) staffMap.set(id, s);
        });

        // Check individual staff collection: ONLY merge into existing IDs from staff_data
        try {
          const querySnapshot = await getDocs(collection(db, 'staff'));
          querySnapshot.forEach((doc) => {
            const d = doc.data() as Staff;
            const id = (d.ID || d.staff_id || doc.id).toUpperCase().trim();
            // Ignore legacy JTM duplicates
            if (LEGACY_JTM_IDS.includes(id) || d.Unit === 'JTM') {
              return;
            }

            if (id && d.Nama && d.Nama.trim().length > 1 && d.Jawatan) {
              if (staffMap.has(id)) {
                // MERGE fields into the ID already present in staff_data
                staffMap.set(id, { ...staffMap.get(id)!, ...d });
              } else if (staffMap.size === 0 && id.startsWith('ST')) {
                // Fallback ONLY when system/staff_data was completely empty
                staffMap.set(id, d);
              }
            }
          });
        } catch (colErr) {
          console.warn('Notice reading individual staff collection:', colErr);
        }

        if (staffMap.size > 0) {
          const result = Array.from(staffMap.values());
          result.sort((a, b) => (parseInt(String(a.Bil || '999'), 10) || 999) - (parseInt(String(b.Bil || '999'), 10) || 999));
          return result;
        }

        return foundData;
      } catch (error) {
        console.warn('Notice reading staff data from Firebase:', error);
        return [];
      }
    })(),
    3000,
    []
  );
};

/**
 * Read-only pre-flight inspection for legacy JTM duplicate cleanup.
 * Never mutates Firestore or LocalStorage.
 * Selection criteria: Explicit StaffID allowlist (LEGACY_JTM_IDS) excluding authoritative IDs.
 * Never matches or deletes based only on staff names.
 */
export const previewLegacyJtmDuplicates = async (
  currentStaffList: Staff[],
  authoritativeIds: string[] = []
): Promise<CleanupPreview> => {
  const authSet = new Set(authoritativeIds.map((id) => id.toUpperCase().trim()).filter(Boolean));
  const legacySet = new Set(LEGACY_JTM_IDS.map((id) => id.toUpperCase().trim()));
  const selectionCriteria =
    'Padanan tepat StaffID legasi (13 ID JTM terasing) yang tiada dalam senarai ID autoritatif asas. Padanan nama sahaja tidak digunakan.';

  const isAuthenticated = Boolean(auth.currentUser);
  const localTargetIds = new Set<string>();
  const localAmbiguousIds = new Set<string>();

  currentStaffList.forEach((s) => {
    const id = (s.ID || s.staff_id || '').toUpperCase().trim();
    const unit = String(s.Unit || '').trim();
    if (id && legacySet.has(id) && !authSet.has(id)) {
      localTargetIds.add(id);
    } else if (unit === 'JTM' && (!id || !legacySet.has(id))) {
      localAmbiguousIds.add(id || '(TANPA_ID)');
    }
  });

  try {
    let previewTimer: any;
    const timeoutError = new Promise<never>((_, reject) => {
      previewTimer = setTimeout(
        () => reject(new Error('Sambungan Firestore tamat masa semasa semakan pratonton')),
        5000
      );
    });
    const [staffDocsSnap, staffSummarySnap] = await Promise.race([
      Promise.all([
        getDocs(collection(db, 'staff')),
        getDoc(doc(db, 'system', 'staff_data')),
      ]),
      timeoutError,
    ]).finally(() => {
      clearTimeout(previewTimer);
    });

    const firestoreDocIds = new Set<string>();
    const summaryTargetIds = new Set<string>();
    const ambiguousIds = new Set<string>(localAmbiguousIds);
    const preservedIds = new Set<string>();

    staffDocsSnap.forEach((d) => {
      const data = d.data() as Staff;
      const id = (data?.ID || data?.staff_id || d.id).toUpperCase().trim();
      const unit = String(data?.Unit || '').trim();
      if (id && legacySet.has(id) && !authSet.has(id)) {
        firestoreDocIds.add(d.id);
      } else if (unit === 'JTM') {
        ambiguousIds.add(id || d.id);
      } else if (id) {
        preservedIds.add(id);
      }
    });

    const summaryData: Staff[] =
      staffSummarySnap.exists() && Array.isArray(staffSummarySnap.data()?.data)
        ? staffSummarySnap.data().data
        : [];

    summaryData.forEach((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      const unit = String(s.Unit || '').trim();
      if (id && legacySet.has(id) && !authSet.has(id)) {
        summaryTargetIds.add(id);
      } else if (unit === 'JTM') {
        ambiguousIds.add(id || '(TANPA_ID)');
      } else if (id) {
        preservedIds.add(id);
      }
    });

    const allTargetIds = Array.from(
      new Set([
        ...Array.from(firestoreDocIds).map((id) => id.toUpperCase().trim()),
        ...Array.from(summaryTargetIds),
        ...Array.from(localTargetIds),
      ])
    ).sort();

    const ambiguousList = Array.from(ambiguousIds).sort();
    const preservedCount =
      preservedIds.size > 0
        ? preservedIds.size
        : currentStaffList.filter((s) => {
            const id = (s.ID || s.staff_id || '').toUpperCase().trim();
            return !legacySet.has(id);
          }).length;

    let canExecute = true;
    let blockReason: string | undefined;

    if (!isAuthenticated) {
      canExecute = false;
      blockReason = 'Pengesahan Master Admin diperlukan sebelum melaksanakan pemadaman di Firestore.';
    } else if (ambiguousList.length > 0) {
      canExecute = false;
      blockReason = `Operasi disekat kerana terdapat ${ambiguousList.length} rekod Unit JTM di luar senarai ID legasi yang tidak dapat dikenal pasti secara yakin (${ambiguousList.join(', ')}).`;
    } else if (allTargetIds.length === 0) {
      canExecute = false;
      blockReason = 'Tiada rekod duplikat legasi ditemui di Firestore atau storan semasa.';
    }

    return {
      firestoreReachable: true,
      isAuthenticated,
      targetIds: allTargetIds,
      firestoreDocIds: Array.from(firestoreDocIds).sort(),
      summaryTargetIds: Array.from(summaryTargetIds).sort(),
      localTargetIds: Array.from(localTargetIds).sort(),
      ambiguousIds: ambiguousList,
      preservedCount,
      expectedRemainingCount: preservedCount,
      selectionCriteria,
      canExecute,
      blockReason,
    };
  } catch (error: any) {
    return {
      firestoreReachable: false,
      isAuthenticated,
      targetIds: Array.from(localTargetIds).sort(),
      firestoreDocIds: [],
      summaryTargetIds: [],
      localTargetIds: Array.from(localTargetIds).sort(),
      ambiguousIds: Array.from(localAmbiguousIds).sort(),
      preservedCount: currentStaffList.length - localTargetIds.size,
      expectedRemainingCount: currentStaffList.length - localTargetIds.size,
      selectionCriteria,
      canExecute: false,
      blockReason: `Operasi disekat: Gagal membaca koleksi Firestore untuk pengesahan pratonton (${error?.message || 'rangkaian luar talian'}).`,
    };
  }
};

/**
 * Pembersihan rekod duplikat legasi (13 StaffID JTM terasing):
 * - Memerlukan sesi Master Admin yang sah (`auth.currentUser`).
 * - Hanya memadam ID dalam LEGACY_JTM_IDS yang bukan rekod autoritatif.
 * - Menyekat operasi sekiranya terdapat rekod meragukan (`Unit === 'JTM'` di luar senarai legasi).
 */
export const cleanupLegacyJtmDuplicates = async (
  authoritativeIds: string[] = []
): Promise<CleanupResult> => {
  if (!auth.currentUser) {
    throw new Error('Akses ditolak: Pengesahan Master Admin diperlukan untuk melaksanakan pembersihan di Firestore.');
  }

  const authSet = new Set(authoritativeIds.map((id) => id.toUpperCase().trim()).filter(Boolean));
  const legacySet = new Set(LEGACY_JTM_IDS.map((id) => id.toUpperCase().trim()));

  let deletedCount = 0;
  const deletedIdsSet = new Set<string>();

  try {
    // 1. Read all docs from 'staff' collection and verify targets strictly by LEGACY_JTM_IDS
    const staffDocsSnap = await getDocs(collection(db, 'staff'));
    const toDeleteDocs: string[] = [];
    const ambiguousDocs: string[] = [];

    staffDocsSnap.forEach((d) => {
      const id = (d.data()?.ID || d.data()?.staff_id || d.id).toUpperCase().trim();
      const unit = String(d.data()?.Unit || '').trim();
      if (id && legacySet.has(id) && !authSet.has(id)) {
        toDeleteDocs.push(d.id);
        deletedIdsSet.add(id);
      } else if (unit === 'JTM') {
        ambiguousDocs.push(id || d.id);
      }
    });

    if (ambiguousDocs.length > 0) {
      throw new Error(
        `Operasi disekat: Rekod Unit JTM tidak dapat dipastikan sebagai duplikat (${ambiguousDocs.join(', ')}). Tiada rekod dipadam.`
      );
    }

    if (toDeleteDocs.length > 0) {
      const chunkSize = 400;
      for (let i = 0; i < toDeleteDocs.length; i += chunkSize) {
        const chunk = toDeleteDocs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((docId) => {
          batch.delete(doc(db, 'staff', docId));
        });
        await batch.commit();
        deletedCount += chunk.length;
      }
    }

    // 2. Fetch and clean system/staff_data
    const staffSummarySnap = await getDoc(doc(db, 'system', 'staff_data'));
    let currentStaffData: Staff[] = [];
    if (staffSummarySnap.exists() && Array.isArray(staffSummarySnap.data()?.data)) {
      currentStaffData = staffSummarySnap.data().data;
    }

    let removedFromSummaryCount = 0;
    const cleanMap = new Map<string, Staff>();
    currentStaffData.forEach((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      if (id && legacySet.has(id) && !authSet.has(id)) {
        removedFromSummaryCount++;
        deletedIdsSet.add(id);
        return;
      }
      if (id) {
        cleanMap.set(id, s);
      }
    });

    staffDocsSnap.forEach((d) => {
      const data = d.data() as Staff;
      const id = (data.ID || data.staff_id || d.id).toUpperCase().trim();
      if ((!legacySet.has(id) || authSet.has(id)) && data.Nama && data.Jawatan) {
        if (!cleanMap.has(id)) {
          cleanMap.set(id, data);
        } else {
          cleanMap.set(id, { ...cleanMap.get(id)!, ...data });
        }
      }
    });

    const cleanedStaffList = Array.from(cleanMap.values());
    cleanedStaffList.sort((a, b) => (parseInt(String(a.Bil || '999'), 10) || 999) - (parseInt(String(b.Bil || '999'), 10) || 999));

    // Update Bil sequentially to ensure clean numbers
    cleanedStaffList.forEach((s, idx) => {
      s.Bil = String(idx + 1);
    });

    // Save cleaned list to system/staff_data (confirmed by Firestore)
    const summaryRef = doc(db, 'system', 'staff_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: cleanedStaffList.length,
      data: cleanedStaffList,
    });

    // 3. Clean LocalStorage only after Firestore confirms
    if (typeof window !== 'undefined') {
      localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(cleanedStaffList));
    }

    return {
      deletedCount,
      removedFromSummaryCount,
      remainingCount: cleanedStaffList.length,
      deletedIds: Array.from(deletedIdsSet).sort(),
      cleanedStaffList,
      firestoreConfirmed: true,
    };
  } catch (error: any) {
    console.error('Ralat semasa pembersihan duplikat JTM:', error);
    if (deletedCount > 0 && error instanceof Error) {
      (error as any).partialFailure = true;
      (error as any).deletedCount = deletedCount;
      (error as any).deletedIds = Array.from(deletedIdsSet).sort();
    }
    throw error;
  }
};

function dedupeCommitteesList(list: StaffCommittee[]): StaffCommittee[] {
  if (!Array.isArray(list) || list.length <= 1) return Array.isArray(list) ? list : [];
  const seen = new Map<string, StaffCommittee>();
  list.forEach((c) => {
    if (!c) return;
    const staffKey = (c.staff_id || c.staff_nama || '').toUpperCase().trim();
    const commKey = (c.jawatankuasa || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const roleKey = (c.peranan || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (!commKey) return;
    const key = `${staffKey}__${commKey}__${roleKey}`;
    if (!seen.has(key)) {
      seen.set(key, c);
    } else {
      const existing = seen.get(key)!;
      if (c.staff_nama && !existing.staff_nama) {
        seen.set(key, { ...existing, ...c });
      }
    }
  });
  return Array.from(seen.values());
}

/**
 * Save committee list directly to Firebase Firestore with detailed partial-failure reporting.
 */
export const saveCommitteesToFirestoreDetailed = async (
  committeesList: StaffCommittee[]
): Promise<FirestoreSaveDetailedResult> => {
  // Guard: Writing requires an active authenticated administrator
  if (!auth.currentUser) {
    console.warn('[Firestore] Notice: Penulisan jawatankuasa ke Firestore dibatalkan kerana pengguna belum log masuk sebagai pentadbir.');
    return {
      firestoreConfirmed: false,
      partialFailure: false,
      errorDetail: 'Pengguna belum log masuk sebagai Master Admin.',
    };
  }

  let wroteSummaryOrBatches = false;
  try {
    const cleaned = dedupeCommitteesList(committeesList);

    // 1. Single summary document for instant bulk retrieval
    const summaryRef = doc(db, 'system', 'committee_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: cleaned.length,
      data: cleaned,
    });
    wroteSummaryOrBatches = true;

    // 2. Individual committee documents in 'committees' collection + purge stale documents
    const chunkSize = 400;
    const activeDocIds = new Set<string>();
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((c, idx) => {
        const rawId = c.id || `c-${c.staff_id || 'st'}-${i + idx}`;
        const docId = rawId.replace(/[\/\s]/g, '_');
        activeDocIds.add(docId);
        const commRef = doc(db, 'committees', docId);
        batch.set(commRef, c, { merge: true });
      });
      await batch.commit();
    }

    // Purge stale committee documents so Firestore collection stays in parity
    try {
      const allCommSnap = await getDocs(collection(db, 'committees'));
      const docsToDelete: string[] = [];
      allCommSnap.forEach((d) => {
        if (!activeDocIds.has(d.id)) {
          docsToDelete.push(d.id);
        }
      });
      if (docsToDelete.length > 0) {
        for (let i = 0; i < docsToDelete.length; i += chunkSize) {
          const deleteChunk = docsToDelete.slice(i, i + chunkSize);
          const deleteBatch = writeBatch(db);
          deleteChunk.forEach((delId) => {
            deleteBatch.delete(doc(db, 'committees', delId));
          });
          await deleteBatch.commit();
        }
      }
    } catch (cleanupErr: any) {
      return {
        firestoreConfirmed: false,
        partialFailure: true,
        errorDetail: `Ringkasan jawatankuasa dikemas kini, tetapi pembersihan dokumen terbuang gagal: ${cleanupErr?.message || cleanupErr}`,
      };
    }

    return { firestoreConfirmed: true, partialFailure: false };
  } catch (error: any) {
    console.warn('[Firestore] Notice ralat menyimpan jawatankuasa ke Firebase Firestore:', error?.message || error);
    return {
      firestoreConfirmed: false,
      partialFailure: wroteSummaryOrBatches,
      errorDetail: error?.message || String(error),
    };
  }
};

/**
 * Save committee list directly to Firebase Firestore
 */
export const saveCommitteesToFirestore = async (committeesList: StaffCommittee[]): Promise<boolean> => {
  const res = await saveCommitteesToFirestoreDetailed(committeesList);
  return res.firestoreConfirmed;
};

/**
 * Fetch committee list from Firebase Firestore
 */
export const fetchCommitteesFromFirestore = async (): Promise<StaffCommittee[]> => {
  return withTimeout(
    (async () => {
      try {
        const commSummarySnap = await getDoc(doc(db, 'system', 'committee_data'));
        let foundData: StaffCommittee[] = [];
        if (commSummarySnap.exists() && Array.isArray(commSummarySnap.data()?.data)) {
          foundData = commSummarySnap.data().data;
        }

        if (foundData.length > 0) {
          return dedupeCommitteesList(foundData);
        }

        const querySnapshot = await getDocs(collection(db, 'committees'));
        const committees: StaffCommittee[] = [];
        querySnapshot.forEach((doc) => {
          committees.push(doc.data() as StaffCommittee);
        });
        return dedupeCommitteesList(committees);
    } catch (error) {
      console.warn('Notice reading committee data from Firebase:', error);
      return [];
    }
  })(),
  3000,
  []
  );
};


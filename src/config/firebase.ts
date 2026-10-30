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
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Staff, StaffCommittee } from '../types';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore with specific database ID and experimentalForceLongPolling
// to prevent 10-second WebChannel stream timeouts in iframe/sandbox environments
export const db = (() => {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId || undefined
    );
  } catch (_e) {
    return firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
})();

/**
 * 13 StaffID lama (Unit JTM) yang merupakan duplikat kepada StaffID baharu
 */
export const LEGACY_JTM_IDS = [
  'ST005', 'ST006', 'ST007', 'ST008', 'ST013',
  'ST014', 'ST016', 'ST017', 'ST024', 'ST025',
  'ST063', 'ST067', 'ST070'
];

export interface CleanupResult {
  deletedCount: number;
  remainingCount: number;
  cleanedStaffList: Staff[];
}

/**
 * Save staff list directly to Firebase Firestore:
 * 1. Writes summary document to system/staff_data.
 * 2. Writes each active staff document in batches of up to 400.
 * 3. Reads all documents from 'staff' collection and deletes any document whose ID
 *    is not in the current staffList (chunked into batches of up to 400),
 *    keeping the 'staff' collection in exact parity with staffList.
 */
export const saveStaffListToFirestore = async (staffList: Staff[]): Promise<boolean> => {
  try {
    // 1. Single summary container document for instant bulk syncing
    const summaryRef = doc(db, 'system', 'staff_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: staffList.length,
      data: staffList,
    });

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
    } catch (cleanupErr) {
      console.warn('Perhatian semasa membersihkan dokumen staf terbuang:', cleanupErr);
    }

    return true;
  } catch (error) {
    console.error('Ralat menyimpan senarai staf ke Firebase Firestore:', error);
    throw error;
  }
};

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
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
        const docSnap = await getDocs(collection(db, 'system'));
        let foundData: Staff[] = [];
        docSnap.forEach((d) => {
          if (d.id === 'staff_data' && Array.isArray(d.data()?.data)) {
            foundData = d.data().data;
          }
        });

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
    6000,
    []
  );
};

/**
 * Pembersihan sekali jalan:
 * Memadam 13 rekod duplikat lama (Unit JTM) daripada:
 * 1. Koleksi "staff" di Firestore.
 * 2. Dokumen "system/staff_data" di Firestore.
 * 3. LocalStorage "kpmbp_smarthub_staff".
 */
export const cleanupLegacyJtmDuplicates = async (): Promise<CleanupResult> => {
  try {
    let deletedCount = 0;

    // 1. Read all docs from 'staff' collection and delete the 13 legacy IDs or Unit === 'JTM'
    const staffDocsSnap = await getDocs(collection(db, 'staff'));
    const toDeleteDocs: string[] = [];

    staffDocsSnap.forEach((d) => {
      const id = (d.data()?.ID || d.data()?.staff_id || d.id).toUpperCase().trim();
      const unit = String(d.data()?.Unit || '').trim();
      if (LEGACY_JTM_IDS.includes(id) || unit === 'JTM') {
        toDeleteDocs.push(d.id);
      }
    });

    if (toDeleteDocs.length > 0) {
      const chunkSize = 400;
      for (let i = 0; i < toDeleteDocs.length; i += chunkSize) {
        const chunk = toDeleteDocs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((docId) => {
          batch.delete(doc(db, 'staff', docId));
        });
        await batch.commit();
      }
      deletedCount = toDeleteDocs.length;
    }

    // 2. Fetch and clean system/staff_data
    const systemSnap = await getDocs(collection(db, 'system'));
    let currentStaffData: Staff[] = [];
    systemSnap.forEach((d) => {
      if (d.id === 'staff_data' && Array.isArray(d.data()?.data)) {
        currentStaffData = d.data().data;
      }
    });

    // Also include valid non-legacy docs from staffDocsSnap (like ST089, ST090) if they were not in staff_data
    const cleanMap = new Map<string, Staff>();
    currentStaffData.forEach((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      if (!LEGACY_JTM_IDS.includes(id) && s.Unit !== 'JTM') {
        cleanMap.set(id, s);
      }
    });

    staffDocsSnap.forEach((d) => {
      const data = d.data() as Staff;
      const id = (data.ID || data.staff_id || d.id).toUpperCase().trim();
      if (!LEGACY_JTM_IDS.includes(id) && data.Unit !== 'JTM' && data.Nama && data.Jawatan) {
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

    // Save cleaned list to system/staff_data
    const summaryRef = doc(db, 'system', 'staff_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: cleanedStaffList.length,
      data: cleanedStaffList,
    });

    // 3. Clean LocalStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(cleanedStaffList));
    }

    return {
      deletedCount: deletedCount || LEGACY_JTM_IDS.length,
      remainingCount: cleanedStaffList.length,
      cleanedStaffList,
    };
  } catch (error) {
    console.error('Ralat semasa pembersihan duplikat JTM:', error);
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
 * Save committee list directly to Firebase Firestore
 */
export const saveCommitteesToFirestore = async (committeesList: StaffCommittee[]): Promise<boolean> => {
  try {
    const cleaned = dedupeCommitteesList(committeesList);

    // 1. Single summary document for instant bulk retrieval
    const summaryRef = doc(db, 'system', 'committee_data');
    await setDoc(summaryRef, {
      updatedAt: new Date().toISOString(),
      count: cleaned.length,
      data: cleaned,
    });

    // 2. Individual committee documents in 'committees' collection
    const chunkSize = 400;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((c, idx) => {
        const rawId = c.id || `c-${c.staff_id || 'st'}-${i + idx}`;
        const docId = rawId.replace(/[\/\s]/g, '_');
        const commRef = doc(db, 'committees', docId);
        batch.set(commRef, c, { merge: true });
      });
      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error('Ralat menyimpan jawatankuasa ke Firebase Firestore:', error);
    throw error;
  }
};

/**
 * Fetch committee list from Firebase Firestore
 */
export const fetchCommitteesFromFirestore = async (): Promise<StaffCommittee[]> => {
  return withTimeout(
    (async () => {
      try {
        const docSnap = await getDocs(collection(db, 'system'));
        let foundData: StaffCommittee[] = [];
        docSnap.forEach((d) => {
          if (d.id === 'committee_data' && d.data()?.data) {
            foundData = d.data().data;
          }
        });

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
    6000,
    []
  );
};

/**
 * Subscribe to the system/appVersion document in Firestore
 * Returns an unsubscribe function.
 */
export const subscribeToAppVersion = (onUpdate: (label: string | null) => void): (() => void) => {
  try {
    const versionDocRef = doc(db, 'system', 'appVersion');
    const unsubscribe = onSnapshot(
      versionDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          onUpdate(typeof data?.label === 'string' && data.label.trim() ? data.label.trim() : null);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.warn('Notice subscribing to appVersion:', error);
        onUpdate(null);
      }
    );
    return unsubscribe;
  } catch (err) {
    console.warn('Failed to setup appVersion subscription:', err);
    onUpdate(null);
    return () => {};
  }
};

/**
 * Save custom app version to system/appVersion in Firestore
 */
export const saveAppVersionToCloud = async (label: string): Promise<void> => {
  const versionDocRef = doc(db, 'system', 'appVersion');
  await setDoc(versionDocRef, {
    label: label.trim(),
    updatedAt: serverTimestamp(),
  });
};


import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, getDocs, writeBatch, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Staff, StaffCommittee } from '../types';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore with specific database ID from config
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Test Firestore connection on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration.");
    }
  }
}
testConnection().catch(() => {});

/**
 * Save staff list directly to Firebase Firestore
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

    // 2. Individual documents in 'staff' collection (in chunks of up to 500 per batch)
    const chunkSize = 400;
    for (let i = 0; i < staffList.length; i += chunkSize) {
      const chunk = staffList.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach((s) => {
        const rawId = s.ID || s.staff_id || `ST_${Math.random().toString(36).substring(2, 8)}`;
        const docId = rawId.toUpperCase().trim().replace(/[\/\s]/g, '_');
        const staffRef = doc(db, 'staff', docId);
        batch.set(staffRef, s, { merge: true });
      });
      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error('Ralat menyimpan senarai staf ke Firebase Firestore:', error);
    throw error;
  }
};

/**
 * Fetch staff list from Firebase Firestore
 */
export const fetchStaffListFromFirestore = async (): Promise<Staff[]> => {
  try {
    const docSnap = await getDocs(collection(db, 'system'));
    let foundData: Staff[] = [];
    docSnap.forEach((d) => {
      if (d.id === 'staff_data' && d.data()?.data) {
        foundData = d.data().data;
      }
    });

    const staffMap = new Map<string, Staff>();
    foundData.forEach((s) => {
      const id = (s.ID || s.staff_id || '').toUpperCase().trim();
      if (id) staffMap.set(id, s);
    });

    // Check individual staff collection to include any newly registered staff documents
    try {
      const querySnapshot = await getDocs(collection(db, 'staff'));
      querySnapshot.forEach((doc) => {
        const d = doc.data() as Staff;
        const id = (d.ID || d.staff_id || doc.id).toUpperCase().trim();
        // Ignore invalid or incomplete dummy docs
        if (id && d.Nama && d.Nama.trim().length > 1 && d.Jawatan) {
          if (staffMap.has(id)) {
            staffMap.set(id, { ...staffMap.get(id)!, ...d });
          } else if (id.startsWith('ST')) {
            staffMap.set(id, d);
          }
        }
      });
    } catch (colErr) {
      console.warn('Error fetching individual staff collection:', colErr);
    }

    if (staffMap.size > 0) {
      const result = Array.from(staffMap.values());
      result.sort((a, b) => (parseInt(String(a.Bil || '999'), 10) || 999) - (parseInt(String(b.Bil || '999'), 10) || 999));
      return result;
    }

    return foundData;
  } catch (error) {
    console.error('Ralat mengambil data staf dari Firebase:', error);
    return [];
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
    console.error('Ralat mengambil data jawatankuasa dari Firebase:', error);
    return [];
  }
};

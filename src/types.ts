/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Staff {
  Bil?: number | string;
  StaffID: string;
  ID: string; // alias for StaffID
  staff_id?: string; // alias for StaffID
  Nama: string;
  NamaPendek?: string;
  Kategori: string; // "Pengurusan", "Akademik", "Sokongan Akademik", "Pentadbiran"
  Bahagian?: string; // alias for Kategori
  Jawatan: string;
  Unit: string; // e.g. "Pengurusan", "Pentadbiran", "Sains Kuantitatif", "Pengurusan Perniagaan", "Perakaunan", etc.
  DepartmentID?: string; // alias for Unit
  Kelulusan?: string;
  Pengkhususan?: string;
  DaerahAsal?: string;
  Telefon: string; // Office/General Phone
  Sambungan?: string; // Extension
  Email: string;
  Gred?: string;
  grade?: string; // alias for Gred
  IC?: string; // No. Kad Pengenalan / IC (akses terhad Admin Mode sahaja)
  NoKP?: string; // alias for IC
  'Tahun Lahir'?: string;
  TahunLahir?: string; // alias for 'Tahun Lahir'
  PlatNo1?: string;
  PlatNo2?: string;
  PlatNo3?: string;
  NoPlat?: string; // combined vehicle plates
  Foto?: string;
  Gambar?: string;
  Status?: string;
  Sumber?: string;
  [key: string]: any;
}

export interface StaffCommittee {
  id?: string;
  staff_id: string; // matches staff ID e.g. "ST001" or staff name
  staff_nama?: string;
  jawatankuasa: string; // e.g. "Jawatankuasa Pengurusan Kualiti (JKPK)"
  peranan: string; // e.g. "Pengerusi", "Setiausaha", "AJK", "Penyelaras"
  tahun?: string; // e.g. "2024/2025"
  peringkat?: string; // e.g. "Kolej", "Jabatan", "Kebangsaan"
  catatan?: string;
}

export type DivisionType = 'Semua' | 'Pengurusan' | 'Akademik' | 'Sokongan Akademik' | 'Pentadbiran';

export interface AuthorizedAdmin {
  id: string;
  email: string;
  name?: string;
  role: 'Master Administrator';
  level: 1;
  status: 'verified';
  photoUrl?: string;
  authProvider: 'google';
  createdAt?: string;
}

export interface StudentTimetable {
  classCode: string;
  fileName: string;
  imageUrl: string;
  downloadUrl?: string;
  size?: number;
  source: 'github';
  program?: string;
  semester?: string;
}

export interface PortalLink {
  id: string;
  title: string;
  desc: string;
  url: string;
  audience: 'Pelajar' | 'Staf' | 'Kedua-dua';
  category: string;
  imageUrl?: string;
  iconUrl?: string;
  faviconUrl?: string;
  detectedMeta?: {
    title?: string;
    description?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogUrl?: string;
    ogSiteName?: string;
    favicon?: string;
    pwaIcon?: string;
    manifestName?: string;
  };
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PortalMetadata {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogSiteName?: string;
  favicon?: string;
  manifestUrl?: string;
  manifestName?: string;
  manifestIcons?: Array<{ src: string; sizes?: string; type?: string }>;
}

export type PortalSyncStatus = 
  | 'loading'          // Initial loading state
  | 'ready_empty'      // State A: Successfully queried Firestore, collection empty (eligible for migration)
  | 'ready_migrated'   // State B: Successfully queried Firestore, contains records (migration complete)
  | 'permission_denied'// State C: Firestore permission denied (do not show migration banner)
  | 'error_network';   // State D: Network or connection failure (do not show migration banner)

export interface PortalSubscriptionResult {
  portals: PortalLink[];
  isMigrated: boolean;
  status: PortalSyncStatus;
  errorMessage?: string;
  source: 'firestore' | 'fallback';
}



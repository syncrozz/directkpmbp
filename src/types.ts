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

export type PlatformThumbnailSource =
  | 'homepage_snapshot'
  | 'og_image'
  | 'favicon'
  | 'custom_upload'
  | 'placeholder';

export interface PlatformLink {
  id: string;
  name: string;
  url: string;
  description: string;
  logoUrl?: string;
  thumbnailUrl?: string;
  thumbnailSource?: PlatformThumbnailSource;
  thumbnailGeneratedAt?: string;
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

export type PlatformSyncStatus =
  | 'loading'
  | 'ready_empty'
  | 'ready_migrated'
  | 'permission_denied'
  | 'error_network';

export interface PlatformSubscriptionResult {
  platforms: PlatformLink[];
  status: PlatformSyncStatus;
  errorMessage?: string;
}

export type NavigationType = 'parent' | 'child' | 'grandchild' | 'delta';
export type NavigationDisplayType = 'module' | 'drive' | 'empty_page';

export type ThumbnailStatus =
  | 'idle'
  | 'pending'
  | 'processing'
  | 'generating'
  | 'generated'
  | 'ready'
  | 'failed'
  | 'error';

export interface NavigationItem {
  id: string; // Stable unique identifier e.g. "nav_directory"
  name: string; // Display name e.g. "Directory Staff"
  icon: string; // Icon identifier e.g. "UserCheck", "BookOpen", "Calendar"
  type: NavigationType; // 'parent' | 'child' | 'grandchild' | 'delta'
  parentId?: string | null; // ID of immediate parent: null for parent (Alfa), Parent ID for child (Bravo), Child ID for grandchild (Charlie), Grandchild ID for delta (Delta)
  destination: string; // Module identifier or route ('directory' | 'platform' | 'jadual' | 'jadual-pensyarah' | 'daftar' | custom URL | navId)
  order: number; // Display order index within its parent container
  isActive: boolean; // Active toggle
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
  updatedBy?: string; // Admin email
  displayType?: NavigationDisplayType; // 'module' | 'drive' | 'empty_page'
  driveUrl?: string; // Google Drive PDF or Folder URL
  displayTitle?: string; // Custom title for content viewer
  slug?: string; // SEO-friendly human-readable unique slug e.g. 'jadual_exam'
  // Automatic PDF Thumbnail Generation Fields (SES Specification)
  thumbnailUrl?: string; // Firebase Storage public URL of rendered 1st page
  thumbnailStatus?: ThumbnailStatus; // 'idle' | 'generating' | 'ready' | 'error'
  thumbnailGeneratedAt?: string; // ISO timestamp when thumbnail was generated
  thumbnailFileId?: string; // Google Drive file ID for cache invalidation & change detection
  thumbnailError?: string; // Detailed error message if generation failed
  sourceFileMetadata?: {
    fileId: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    lastModified?: string;
  };
  keywords?: string[];
  searchableKeywords?: string;
}





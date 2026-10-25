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
  'Tahun Lahir'?: string;
  TahunLahir?: string; // alias for 'Tahun Lahir'
  PlatNo1?: string;
  PlatNo2?: string;
  PlatNo3?: string;
  NoPlat?: string; // combined vehicle plates
  Foto?: string;
  Gambar?: string;
  Status?: string;
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
  pin: string; // 4-digit PIN (last 4 digits of IC)
  icLast4?: string;
  name?: string;
  role?: string;
  createdAt?: string;
}

import { Staff } from '../types';

export const STAFF_GRADE_MAP: Record<string, string> = {
  'ST001': 'DG13',
  'ST002': 'DG12',
  'ST003': 'DG13',
  'ST004': 'E10',
  'ST009': 'DG10',
  'ST010': 'DG12',
  'ST011': 'F10',
  'ST012': 'S10',
  'ST015': 'N5',
  'ST018': 'DG10',
  'ST019': 'DG10',
  'ST020': 'DG9',
  'ST021': 'DG9',
  'ST022': 'DG9',
  'ST023': 'DG9',
  'ST026': 'DG10',
  'ST027': 'DG10',
  'ST028': 'DG9',
  'ST029': 'DG9',
  'ST030': 'DG9',
  'ST031': 'DG10',
  'ST032': 'DG12',
  'ST033': 'DG9',
  'ST034': 'DG10',
  'ST035': 'DG9',
  'ST036': 'DG9',
  'ST037': 'DG9',
  'ST038': 'DG9',
  'ST039': 'DG9',
  'ST040': 'DG9',
  'ST041': 'DG9',
  'ST042': 'DG10',
  'ST043': 'DG10',
  'ST044': 'DG12',
  'ST045': 'DG12',
  'ST046': 'DG10',
  'ST047': 'DG9',
  'ST048': 'DG9',
  'ST049': 'DG10',
  'ST050': 'DG10',
  'ST051': 'DG9',
  'ST052': 'DG12',
  'ST053': 'DG10',
  'ST054': 'DG9',
  'ST055': 'DG10',
  'ST056': 'DG10',
  'ST057': 'DG9',
  'ST058': 'DG9',
  'ST059': 'DG12',
  'ST060': 'DG10',
  'ST061': 'DG9',
  'ST062': 'DG9',
  'ST064': 'DG9',
  'ST065': 'DG10',
  'ST066': 'DG9',
  'ST068': 'DG10',
  'ST069': 'DG10',
  'ST071': 'S6',
  'ST072': 'JA6',
  'ST073': 'W2',
  'ST074': 'N1',
  'ST075': 'N1',
  'ST076': 'N2',
  'ST077': 'N2',
  'ST078': 'N2',
  'ST079': 'N2',
  'ST080': 'FA5',
  'ST081': 'FA5',
  'ST082': 'H1',
  'ST083': 'H1',
  'ST084': 'H1',
  'ST085': 'H1',
  'ST086': 'H1',
  'ST087': 'H1',
  'ST088': 'N3',
  'ST089': 'DG9',
};

/**
 * Resolves the real grade for a staff member.
 * Priorities:
 * 1. staff.grade / staff.Gred if defined and non-empty.
 * 2. Lookup in STAFF_GRADE_MAP using staff_id / ID.
 * 3. "-" if unavailable.
 */
export const getStaffGrade = (staff?: Staff | null): string => {
  if (!staff) return '-';

  // Check direct properties first
  const direct = staff.grade || staff.Gred;
  if (direct && direct.trim()) {
    return direct.trim();
  }

  // Lookup by ID
  const rawId = (staff.staff_id || staff.ID || '').trim().toUpperCase();
  const normalizedId = rawId.replace(/^STF-/i, 'ST').replace(/^STF/i, 'ST');

  if (normalizedId && STAFF_GRADE_MAP[normalizedId]) {
    return STAFF_GRADE_MAP[normalizedId];
  }

  if (rawId && STAFF_GRADE_MAP[rawId]) {
    return STAFF_GRADE_MAP[rawId];
  }

  return '-';
};

/**
 * Determines Bahagian for a staff member.
 * Rule: Only "Ketua Jabatan" and "Pensyarah" belong to "Akademik".
 */
export const determineBahagian = (jawatan: any, rawBahagian?: any): string => {
  const raw = String(rawBahagian || '').trim();
  if (raw && ['Pengurusan', 'Akademik', 'Sokongan Akademik', 'Pentadbiran'].includes(raw)) {
    return raw;
  }

  const j = String(jawatan || '').toLowerCase().trim();
  if (j.includes('pengarah')) {
    return 'Pengurusan';
  }

  const isAkademikJawatan = j.includes('pensyarah') || j.includes('ketua jabatan');
  if (isAkademikJawatan) {
    return 'Akademik';
  }

  if (
    j.includes('pustakawan') ||
    j.includes('perpustakaan') ||
    j.includes('teknologi maklumat') ||
    j.includes('ko-kurikulum') ||
    j.includes('kaunselor') ||
    j.includes('jurutera') ||
    j.includes('makmal') ||
    j.includes('teknikal')
  ) {
    return 'Sokongan Akademik';
  }

  return 'Pentadbiran';
};

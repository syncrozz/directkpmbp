import { Staff, StaffCommittee } from '../types';
import { COMMITTEE_CSV_DATA } from '../data/committeeCSV';

// Default / fallback committee generator if sheet StaffCommittee returns empty
export function generateDefaultCommitteesForStaff(staffList: Staff[]): StaffCommittee[] {
  const committees: StaffCommittee[] = deduplicateCommittees([...COMMITTEE_CSV_DATA]);

  // Map staff with existing records in CSV
  const existingStaffIds = new Set(committees.map(c => c.staff_id));

  staffList.forEach((staff) => {
    const id = (staff.ID || staff.staff_id || '').toUpperCase().trim();
    if (!id || existingStaffIds.has(id)) return;

    const name = staff.Nama || '';
    const jawatan = (staff.Jawatan || '').toLowerCase();

    if (jawatan.includes('pengarah') && !jawatan.includes('timb')) {
      committees.push(
        {
          id: `jk-${id}-1`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Pengurusan Kolej (JKPK)',
          peranan: 'Pengerusi',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Pengurusan Tertinggi Kolej',
        },
        {
          id: `jk-${id}-2`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Kecemerlangan Latihan & Pembangunan',
          peranan: 'Pengerusi',
          tahun: '2024/2025',
          peringkat: 'Kebangsaan / KPM',
          catatan: 'Pemantauan Standard Latihan',
        }
      );
    } else if (jawatan.includes('timb. pengarah')) {
      committees.push(
        {
          id: `jk-${id}-1`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Hal Ehwal Pelajar & Pembangunan Individu',
          peranan: 'Pengerusi',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Pengurusan Pelajar & Sahsiah',
        },
        {
          id: `jk-${id}-2`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Ekosistem Kondusif Sektor Awam (EKSA)',
          peranan: 'Timbalan Pengerusi',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Penarafan EKSA',
        }
      );
    } else if (jawatan.includes('ketua jabatan')) {
      committees.push(
        {
          id: `jk-${id}-1`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: `Jawatankuasa Akademik Jabatan (${staff.DepartmentID || 'Jabatan'})`,
          peranan: 'Pengerusi',
          tahun: '2024/2025',
          peringkat: 'Jabatan',
          catatan: 'Semakan Kurikulum & Pentaksiran',
        },
        {
          id: `jk-${id}-2`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Jaminan Kualiti & Akreditasi MQA',
          peranan: 'Penyelaras Jabatan',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Pematuhan Standard MQA',
        }
      );
    } else if (jawatan.includes('pensyarah')) {
      committees.push(
        {
          id: `jk-${id}-1`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Penyelidikan, Inovasi & Penerbitan',
          peranan: 'Ahli Jawatankuasa (AJK)',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Projek Inovasi KPMBP',
        },
        {
          id: `jk-${id}-2`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Penasihat Akademik & Bimbingan Staf',
          peranan: 'Mentor / Penasihat',
          tahun: '2024/2025',
          peringkat: 'Jabatan',
          catatan: 'Sistem Mentor-Mentee',
        }
      );
    } else if (jawatan.includes('kaunselor')) {
      committees.push(
        {
          id: `jk-${id}-1`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Bimbingan, Kaunseling & Kerjaya Pelajar',
          peranan: 'Setiausaha / Pegawai Penyelaras',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Bimbingan Sahsiah & Kerjaya Pelajar KPMBP',
        },
        {
          id: `jk-${id}-2`,
          staff_id: id,
          staff_nama: name,
          jawatankuasa: 'Jawatankuasa Pembangunan Sahsiah & Disiplin (JPSD)',
          peranan: 'Ahli Jawatankuasa (AJK)',
          tahun: '2024/2025',
          peringkat: 'Kolej',
          catatan: 'Program Motivasi & Intervensi Pelajar',
        }
      );
    } else {
      committees.push({
        id: `jk-${id}-1`,
        staff_id: id,
        staff_nama: name,
        jawatankuasa: 'Jawatankuasa Keselamatan & Kesihatan Pekerjaan (OJKK)',
        peranan: 'Ahli Jawatankuasa (AJK)',
        tahun: '2024/2025',
        peringkat: 'Kolej',
        catatan: 'Pengurusan Operasi & Pentadbiran',
      });
    }
  });

  return committees;
}

export function parseCommitteeRows(rows: any[]): StaffCommittee[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((row, idx) => {
    const rawStaffId = String(
      row.staff_id || row.ID || row['ID Staf'] || row.Staff_ID || row['ID Staff'] || row.Nama || ''
    ).trim();

    const cleanStaffId = rawStaffId.toUpperCase().replace(/^STF-/i, 'ST').replace(/^STF/i, 'ST');

    return {
      id: String(row.id || row.ID_Jawatankuasa || `JK-${idx + 1}`),
      staff_id: cleanStaffId,
      staff_nama: String(row.staff_nama || row.Nama || row['Nama Staf'] || row['Nama Staff'] || ''),
      jawatankuasa: String(
        row.jawatankuasa || row.Jawatankuasa || row['Nama Jawatankuasa'] || row.Committee || row['Jawatankuasa / Program'] || 'Jawatankuasa Rasmi'
      ),
      peranan: String(
        row.peranan || row.Peranan || row.Jawatan || row['Jawatan Dalam Jawatankuasa'] || row.Role || 'Ahli Jawatankuasa'
      ),
      tahun: String(row.tahun || row.Tahun || row.Sesi || row.Session || '2024/2025'),
      peringkat: String(row.peringkat || row.Peringkat || row.Category || 'Kolej'),
      catatan: String(row.catatan || row.Catatan || row.Remarks || ''),
    };
  });
}

/**
 * Menentukan tahap kekananan (senioriti) peranan jawatankuasa:
 * Nombor rank lebih kecil = kedudukan lebih tinggi/kanan (dipaparkan paling atas).
 *
 * Rank 10 : Penaung, Pengerusi, Pengerusi Tetap, "Ketua Jabatan / Pegawai Pengelas"
 * Rank 20 : Pengerusi Silih Ganti, Timbalan Pengerusi / Timb. Pengerusi,
 *           Naib Timbalan Pengerusi Tetap, Pegawai Pengelas
 * Rank 30 : Ketua (tepat) dan semua yang bermula "Ketua"
 *           (Ketua Unit ..., Ketua Program ..., Ketua Felo), YDP Muafakat,
 *           NYDP Muafakat, Komander Insiden
 * Rank 35 : Timb. Ketua Felo
 * Rank 40 : Setiausaha dan variasinya (Setiausaha I, Setiausaha II, Setiausaha JSK,
 *           Setiausaha JPP, Setiausaha Jurucakap ...)
 *           KECUALI yang bermula "Pen." atau "Penolong"
 * Rank 50 : Bendahari dan variasinya (Bendahari JSK, Bendahari JPP ...)
 *           KECUALI yang bermula "Pen." atau "Penolong"
 * Rank 60 : Pen. Setiausaha, Pen. Bendahari, Penolong
 * Rank 70 : Peranan khusus lain dan peranan yang tidak dikenali (DEFAULT), contohnya
 *           Penasihat ..., Pegawai ..., Juruaudit Dalaman ..., Panel Penilai,
 *           Pasukan ..., Wakil ..., Urus Setia, Teknikal, Logistik, SA 1 hingga SA 6
 * Rank 90 : Ahli, Ahli Unit ..., AJK ..., Felo (paling bawah)
 */
export function getRoleRank(peranan: string): number {
  const p = (peranan || '').toLowerCase().trim().replace(/\s+/g, ' ');
  if (!p) return 70;

  // Rank 10: Penaung, Pengerusi, Pengerusi Tetap, "Ketua Jabatan / Pegawai Pengelas"
  if (
    p === 'penaung' ||
    p.startsWith('penaung ') ||
    p.includes('ketua jabatan / pegawai pengelas') ||
    p.includes('ketua jabatan/pegawai pengelas') ||
    p === 'pengerusi tetap' ||
    p === 'pengerusi' ||
    (p.startsWith('pengerusi') && !p.startsWith('pengerusi silih ganti'))
  ) {
    return 10;
  }

  // Rank 20: Pengerusi Silih Ganti, Timbalan Pengerusi / Timb. Pengerusi,
  //          Naib Timbalan Pengerusi Tetap, Pegawai Pengelas
  if (
    p.startsWith('pengerusi silih ganti') ||
    p.startsWith('timbalan pengerusi') ||
    p.startsWith('timb. pengerusi') ||
    p.startsWith('timb pengerusi') ||
    p.includes('naib timbalan pengerusi') ||
    p.includes('naib timb. pengerusi') ||
    p.includes('naib timb pengerusi') ||
    p === 'pegawai pengelas' ||
    p.startsWith('pegawai pengelas ')
  ) {
    return 20;
  }

  // Rank 35: Timb. Ketua Felo (disemak sebelum Rank 30)
  if (
    p.startsWith('timb. ketua felo') ||
    p.startsWith('timb ketua felo') ||
    p.startsWith('timbalan ketua felo')
  ) {
    return 35;
  }

  // Rank 30: Ketua (tepat) dan semua yang bermula "Ketua"
  // (Ketua Unit ..., Ketua Program ..., Ketua Felo), YDP Muafakat,
  // NYDP Muafakat, Komander Insiden
  if (
    p === 'ketua' ||
    p.startsWith('ketua ') ||
    p.startsWith('ketua-') ||
    p.startsWith('ketua/') ||
    p === 'ydp muafakat' ||
    p.startsWith('ydp muafakat') ||
    p === 'nydp muafakat' ||
    p.startsWith('nydp muafakat') ||
    p === 'komander insiden' ||
    p.startsWith('komander insiden')
  ) {
    return 30;
  }

  const isPenolong = p.startsWith('pen.') || p.startsWith('pen ') || p.startsWith('penolong');

  // Rank 40: Setiausaha dan variasinya (Setiausaha I, Setiausaha II, Setiausaha JSK,
  // Setiausaha JPP, Setiausaha Jurucakap ...)
  // KECUALI yang bermula "Pen." atau "Penolong"
  if (
    !isPenolong &&
    (p === 'setiausaha' ||
      p.startsWith('setiausaha ') ||
      p.startsWith('setiausaha-') ||
      p.startsWith('setiausaha/') ||
      (p.includes('setiausaha') && !p.includes('timbalan') && !p.includes('timb.')))
  ) {
    return 40;
  }

  // Rank 50: Bendahari dan variasinya (Bendahari JSK, Bendahari JPP ...)
  // KECUALI yang bermula "Pen." atau "Penolong"
  if (
    !isPenolong &&
    (p === 'bendahari' ||
      p.startsWith('bendahari ') ||
      p.startsWith('bendahari-') ||
      p.startsWith('bendahari/') ||
      (p.includes('bendahari') && !p.includes('timbalan') && !p.includes('timb.')))
  ) {
    return 50;
  }

  // Rank 60: Pen. Setiausaha, Pen. Bendahari, Penolong
  if (
    p.startsWith('pen. setiausaha') ||
    p.startsWith('pen setiausaha') ||
    p.startsWith('penolong setiausaha') ||
    p.startsWith('pen. bendahari') ||
    p.startsWith('pen bendahari') ||
    p.startsWith('penolong bendahari') ||
    p === 'penolong' ||
    p.startsWith('penolong ') ||
    p.startsWith('pen. ')
  ) {
    return 60;
  }

  // Rank 90: Ahli, Ahli Unit ..., AJK ..., Felo (paling bawah)
  if (
    p === 'ahli' ||
    p.startsWith('ahli ') ||
    p.startsWith('ahli-') ||
    p.startsWith('ahli/') ||
    p.startsWith('ahli') ||
    p === 'ajk' ||
    p.startsWith('ajk ') ||
    p.startsWith('ajk-') ||
    p.startsWith('ajk/') ||
    p.startsWith('ajk') ||
    p === 'felo' ||
    p.startsWith('felo ')
  ) {
    return 90;
  }

  // Rank 70: Peranan khusus lain dan peranan yang tidak dikenali (DEFAULT)
  // Contoh: Penasihat ..., Pegawai ..., Juruaudit Dalaman ..., Panel Penilai,
  // Pasukan ..., Wakil ..., Urus Setia, Teknikal, Logistik, SA 1 hingga SA 6
  return 70;
}

/**
 * Membuang sebarang rekod jawatankuasa pendua (redundant):
 * Padanan unik berdasarkan kombinasi: staff_id (atau staff_nama), nama jawatankuasa, dan peranan.
 * Mengekalkan rekod yang mempunyai maklumat paling lengkap (contohnya rekod yang mempunyai staff_nama / ID rasmi).
 */
export function deduplicateCommittees(list: StaffCommittee[]): StaffCommittee[] {
  if (!Array.isArray(list) || list.length <= 1) {
    return Array.isArray(list) ? [...list] : [];
  }

  const seen = new Map<string, StaffCommittee>();

  list.forEach((item) => {
    if (!item) return;
    const staffKey = (item.staff_id || item.staff_nama || '').toUpperCase().trim();
    // Normalisasi nama jawatankuasa dan peranan: huruf kecil, trim, ringkaskan ruang putih berganda
    const commKey = (item.jawatankuasa || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
    const roleKey = (item.peranan || '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');

    if (!commKey) return;

    const uniqueKey = `${staffKey}__${commKey}__${roleKey}`;

    if (!seen.has(uniqueKey)) {
      seen.set(uniqueKey, item);
    } else {
      const existing = seen.get(uniqueKey)!;
      // Jika rekod semasa ada staff_nama dan yang sedia ada tiada, kemaskini dengan maklumat lebih lengkap
      if (item.staff_nama && !existing.staff_nama) {
        seen.set(uniqueKey, { ...existing, ...item });
      }
    }
  });

  return Array.from(seen.values());
}

/**
 * Menyusun senarai jawatankuasa mengikut kekananan peranan:
 * - Membuang sebarang rekod pendua terlebih dahulu (deduplicate)
 * - Menyalin array terlebih dahulu ([...list]) tanpa mengubah array asal
 * - Nombor rank lebih kecil dipaparkan di atas
 * - Jika rank sama, urutan asal dalam data dikekalkan (stable sort)
 */
export function sortCommitteesBySeniority(list: StaffCommittee[]): StaffCommittee[] {
  if (!Array.isArray(list) || list.length === 0) {
    return [];
  }

  // Bersihkan sebarang rekod pendua bagi setiap staf secara automatik
  const deduped = deduplicateCommittees(list);

  return deduped
    .map((item, index) => ({ item, index, rank: getRoleRank(item?.peranan || '') }))
    .sort((a, b) => {
      if (a.rank !== b.rank) {
        return a.rank - b.rank;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

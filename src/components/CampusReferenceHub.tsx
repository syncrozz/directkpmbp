/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Calendar, 
  Link, 
  PhoneCall, 
  BookOpen, 
  MapPin, 
  Info, 
  ExternalLink, 
  Clock, 
  Search, 
  CheckCircle2, 
  Sparkles, 
  ChevronRight, 
  MessageCircle,
  FileText,
  Bookmark,
  Shield,
  HelpCircle,
  Clock3,
  Compass
} from 'lucide-react';
import { CampusLocationMap } from './CampusLocationMap';

interface LinkItem {
  id: string;
  title: string;
  desc: string;
  url: string;
  audience: 'Pelajar' | 'Staf' | 'Kedua-dua';
  category: 'portal' | 'akademik' | 'hebahan';
}

interface CalendarEvent {
  id: string;
  title: string;
  dateRange: string;
  status: 'Sedang Berjalan' | 'Akan Datang' | 'Selesai';
  type: 'akademik' | 'aktiviti' | 'cuti';
}

interface ContactItem {
  id: string;
  department: string;
  role: string;
  phone: string;
  whatsapp: string;
  extension?: string;
  email?: string;
}

interface RuleItem {
  id: string;
  title: string;
  desc: string;
  details: string[];
}

interface CampusReferenceHubProps {
  onNavigateToTimetables?: () => void;
}

export const CampusReferenceHub: React.FC<CampusReferenceHubProps> = ({ onNavigateToTimetables }) => {
  const [activeRefTab, setActiveRefTab] = useState<'semua' | 'peta' | 'portal' | 'takwim' | 'bantuan' | 'panduan'>('semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Sample data designed specifically for KPMBP
  const quickLinks: LinkItem[] = [
    {
      id: 'l1',
      title: 'Portal SPMP Pelajar',
      desc: 'Sistem Pengurusan Maklumat Pelajar untuk pendaftaran subjek, semakan keputusan peperiksaan, gred GPA/CGPA, dan rekod kehadiran.',
      url: 'https://bpenawar.kpm.edu.my/spmp/',
      audience: 'Pelajar',
      category: 'portal'
    },
    {
      id: 'l2',
      title: 'Sistem SISPEN (Staf)',
      desc: 'Sistem Penilaian Pensyarah & Staf Kolej Profesional MARA Bandar Penawar.',
      url: 'https://bpenawar.kpm.edu.my/sispen/',
      audience: 'Staf',
      category: 'portal'
    },
    {
      id: 'l3',
      title: 'Microsoft Teams & Office 365',
      desc: 'Hab pembelajaran digital, kelas hibrid, kuiz dalam talian, kolaborasi kumpulan, dan mel rasmi @student.kpm.edu.my.',
      url: 'https://teams.microsoft.com/',
      audience: 'Kedua-dua',
      category: 'portal'
    },
    {
      id: 'l4',
      title: 'Perpustakaan Al-Ghazali Portal',
      desc: 'Semak katalog buku fizikal, pangkalan data jurnal e-Perpustakaan, waktu operasi, dan buat tempahan bilik belajar kumpulan.',
      url: 'https://bpenawar.kpm.edu.my/library/',
      audience: 'Kedua-dua',
      category: 'portal'
    },
    {
      id: 'l5',
      title: 'Sistem e-Kehadiran MARA',
      desc: 'Pintu gerbang kehadiran kerja harian untuk semua kakitangan pengurusan dan tenaga pengajar akademik MARA.',
      url: 'https://ekehadiran.mara.gov.my/',
      audience: 'Staf',
      category: 'portal'
    },
    {
      id: 'l6',
      title: 'Portal Integriti MARA',
      desc: 'Garis panduan etika, pelaporan integriti, dasar kebajikan MARA, dan pekeliling perkhidmatan awam semasa.',
      url: 'https://www.mara.gov.my/',
      audience: 'Staf',
      category: 'portal'
    }
  ];

  const calendarEvents: CalendarEvent[] = [
    {
      id: 'e1',
      title: 'Sesi Kuliah Semester I Sesi 2026/2027 Bermula',
      dateRange: '20 Julai 2026',
      status: 'Akan Datang',
      type: 'akademik'
    },
    {
      id: 'e2',
      title: 'Minggu Silaturrahim (MSR) Pelajar Baharu',
      dateRange: '15 Julai – 19 Julai 2026',
      status: 'Akan Datang',
      type: 'aktiviti'
    },
    {
      id: 'e3',
      title: 'Cuti Pertengahan Semester I Sesi 2026/2027',
      dateRange: '05 September – 13 September 2026',
      status: 'Akan Datang',
      type: 'cuti'
    },
    {
      id: 'e4',
      title: 'Peperiksaan Akhir Semester I Sesi 2026/2027',
      dateRange: '26 Oktober – 10 November 2026',
      status: 'Akan Datang',
      type: 'akademik'
    },
    {
      id: 'e5',
      title: 'Cuti Akhir Semester I',
      dateRange: '11 November – 29 November 2026',
      status: 'Akan Datang',
      type: 'cuti'
    },
    {
      id: 'e6',
      title: 'Sesi Penilaian Prestasi Mengajar Pensyarah (SPMP)',
      dateRange: '01 Oktober – 15 Oktober 2026',
      status: 'Akan Datang',
      type: 'akademik'
    }
  ];

  const keyContacts: ContactItem[] = [
    {
      id: 'c1',
      department: 'Unit Hal Ehwal Pelajar (HEP)',
      role: 'Urusan asrama, kebajikan, disiplin, biasiswa, dan aktiviti persatuan pelajar.',
      phone: '07-8842222',
      whatsapp: '60183854235',
      extension: '210',
      email: 'hep.penawar@mara.gov.my'
    },
    {
      id: 'c2',
      department: 'Unit Hal Ehwal Akademik (HEA)',
      role: 'Semakan jadual kuliah, pendaftaran kelas, dewan peperiksaan, dan slip keputusan.',
      phone: '07-8842222',
      whatsapp: '60174693512',
      extension: '215',
      email: 'hea.penawar@mara.gov.my'
    },
    {
      id: 'c3',
      department: 'Warden Blok Asrama Lelaki (On-Duty)',
      role: 'Kebajikan asrama, keselamatan pelajar, kecemasan di luar waktu pejabat.',
      phone: '07-8843100',
      whatsapp: '60139500149',
      email: 'warden.lelaki@mara.gov.my'
    },
    {
      id: 'c4',
      department: 'Warden Blok Asrama Perempuan (On-Duty)',
      role: 'Hubungi untuk laporan asrama, kemudahan asrama, atau kecemasan kesihatan pelajar.',
      phone: '07-8843102',
      whatsapp: '60138661616',
      email: 'warden.perempuan@mara.gov.my'
    },
    {
      id: 'c5',
      department: 'Unit Pentadbiran & Kewangan Kolej',
      role: 'Pembayaran yuran pengajian, tuntutan elaun wang saku MARA, urusan pendaftaran masuk.',
      phone: '07-8842222',
      whatsapp: '60138661616',
      extension: '100',
      email: 'pentadbiran.penawar@mara.gov.my'
    },
    {
      id: 'c6',
      department: 'Unit Teknologi Maklumat & Sokongan Direktori KPMBP',
      role: 'Akses Wi-Fi kampus, penetapan emel rasmi, ID Teams, dan sokongan sistem digital.',
      phone: '07-8842222',
      whatsapp: '60137254391',
      extension: '144',
      email: 'it.penawar@mara.gov.my'
    }
  ];

  const collegeRules: RuleItem[] = [
    {
      id: 'r1',
      title: 'Etika Pemakaian & Rupa Diri (Staf & Pelajar)',
      desc: 'Setiap warga KPM Bandar Penawar mesti mematuhi etika pakaian formal mengikut pekeliling MARA sepanjang waktu kuliah/pejabat.',
      details: [
        'Pelajar Lelaki: Baju kemeja lengan panjang lengkap bertali leher, seluar slack hitam/gelap, rambut pendek kemas.',
        'Pelajar Perempuan: Baju kurung lengkap bertudung kemas (bagi muslim), pemakaian kasut bertutup (sukan/formal).',
        'Staf Akademik/Sokongan: Pakaian pejabat rasmi. Hari Khamis digalakkan memakai pakaian Batik Malaysia.'
      ]
    },
    {
      id: 'r2',
      title: 'Peraturan Keluar Masuk Kampus (Outing & Balik Bermalam)',
      desc: 'Sistem kemasukan dikawal selia oleh unit pengawal keselamatan dan HEP demi kesejahteraan komuniti kampus.',
      details: [
        'Outing Mingguan: Hari Rabu (selepas kelas - 6.30 PM), Jumaat (12.30 PM - 7.00 PM), Sabtu & Ahad (8.00 AM - 7.00 PM).',
        'Balik Bermalam (Homeleave): Pelajar dibenarkan pulang ke rumah dengan kelulusan Warden/HEP melalui borang digital sekurang-kurangnya 3 hari awal.',
        'Kawalan Pagar: Pagar utama ditutup sepenuhnya selepas jam 11:00 malam setiap hari.'
      ]
    },
    {
      id: 'r3',
      title: 'Panduan Am Perpustakaan Al-Ghazali',
      desc: 'Waktu operasi dan tatatertib di dalam dewan perpustakaan utama.',
      details: [
        'Waktu Operasi: Isnin hingga Jumaat (8.15 AM – 4.45 PM). Ditutup pada hari Sabtu, Ahad, dan cuti am.',
        'Pinjaman Buku: Setiap pelajar dibenarkan meminjam maksimum 4 buah buku pada satu masa selama 14 hari berturut-turut.',
        'Larangan: Dilarang membawa makanan, beg galas, minuman manis, atau membuat bising yang mengganggu fokus pembaca lain.'
      ]
    }
  ];

  // Helper trigger action
  const handleAction = (type: 'call' | 'whatsapp' | 'email', item: ContactItem) => {
    if (type === 'call') {
      window.location.href = `tel:${item.phone}`;
    } else if (type === 'whatsapp') {
      const cleanWa = item.whatsapp.replace(/\D/g, '');
      const waUrl = `https://wa.me/${cleanWa.startsWith('6') ? cleanWa : '60' + cleanWa}`;
      window.open(waUrl, '_blank');
    } else if (type === 'email' && item.email) {
      window.location.href = `mailto:${item.email}`;
    }
  };

  // Searching logic
  const filteredLinks = quickLinks.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.audience.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCalendar = calendarEvents.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.dateRange.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredContacts = keyContacts.filter(item =>
    item.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredRules = collegeRules.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.details.some(d => d.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 text-left">
      {/* Featured Banner: Jadual Kelas Pelajar */}
      {onNavigateToTimetables && (
        <div className="bg-gradient-to-r from-indigo-950 via-indigo-900 to-violet-950 rounded-3xl p-5 md:p-6 text-white shadow-md relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-indigo-800/40">
          <div className="space-y-1 relative z-10">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 text-indigo-200 text-[11px] font-bold">
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>Modul Baharu</span>
            </div>
            <h3 className="text-lg md:text-xl font-extrabold tracking-tight">
              Jadual Waktu Kelas Pelajar
            </h3>
            <p className="text-xs text-indigo-200 max-w-xl">
              Cari dan semak jadual waktu kelas anda secara terus (cth: DCAT7A, DIA4A, DLM3A) dengan paparan skrin penuh dan muat turun.
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToTimetables}
            className="px-4 py-2.5 bg-white text-indigo-950 hover:bg-indigo-50 font-extrabold text-xs rounded-2xl shadow-sm transition-all active:scale-95 cursor-pointer shrink-0 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Buka Jadual Kelas</span>
          </button>
        </div>
      )}

      {/* Segmented Selector for reference types with soft pastel themes */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveRefTab('semua')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'semua'
              ? 'bg-indigo-100/90 text-indigo-950 border-2 border-indigo-500 shadow-xs'
              : 'bg-indigo-50/70 text-indigo-800 hover:bg-indigo-100/70 border border-indigo-200/60'
          }`}
        >
          <Bookmark className={`w-3.5 h-3.5 ${activeRefTab === 'semua' ? 'text-indigo-600' : 'text-indigo-500'}`} />
          Semua Sumber
        </button>
        <button
          onClick={() => setActiveRefTab('peta')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'peta'
              ? 'bg-blue-100/90 text-blue-950 border-2 border-blue-500 shadow-xs'
              : 'bg-blue-50/70 text-blue-800 hover:bg-blue-100/70 border border-blue-200/60'
          }`}
        >
          <Compass className={`w-3.5 h-3.5 ${activeRefTab === 'peta' ? 'text-blue-600' : 'text-blue-500'}`} />
          Peta Lokasi Kampus
        </button>
        <button
          onClick={() => setActiveRefTab('portal')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'portal'
              ? 'bg-purple-100/90 text-purple-950 border-2 border-purple-500 shadow-xs'
              : 'bg-purple-50/70 text-purple-800 hover:bg-purple-100/70 border border-purple-200/60'
          }`}
        >
          <Link className={`w-3.5 h-3.5 ${activeRefTab === 'portal' ? 'text-purple-600' : 'text-purple-500'}`} />
          Pautan Penting & Portal
        </button>
        <button
          onClick={() => setActiveRefTab('takwim')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'takwim'
              ? 'bg-emerald-100/90 text-emerald-950 border-2 border-emerald-500 shadow-xs'
              : 'bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/70 border border-emerald-200/60'
          }`}
        >
          <Calendar className={`w-3.5 h-3.5 ${activeRefTab === 'takwim' ? 'text-emerald-600' : 'text-emerald-500'}`} />
          Takwim Akademik
        </button>
        <button
          onClick={() => setActiveRefTab('bantuan')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'bantuan'
              ? 'bg-rose-100/90 text-rose-950 border-2 border-rose-500 shadow-xs'
              : 'bg-rose-50/70 text-rose-800 hover:bg-rose-100/70 border border-rose-200/60'
          }`}
        >
          <PhoneCall className={`w-3.5 h-3.5 ${activeRefTab === 'bantuan' ? 'text-rose-600' : 'text-rose-500'}`} />
          Talian Bantuan & Warden
        </button>
        <button
          onClick={() => setActiveRefTab('panduan')}
          className={`px-4.5 py-2.5 rounded-2xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer ${
            activeRefTab === 'panduan'
              ? 'bg-amber-100/90 text-amber-950 border-2 border-amber-500 shadow-xs'
              : 'bg-amber-50/70 text-amber-800 hover:bg-amber-100/70 border border-amber-200/60'
          }`}
        >
          <BookOpen className={`w-3.5 h-3.5 ${activeRefTab === 'panduan' ? 'text-amber-600' : 'text-amber-500'}`} />
          Panduan & Peraturan
        </button>
      </div>

      {/* Dynamic Content Panels based on Active Tab */}
      <div className="space-y-8">
        
        {/* SECTION: Campus Location Map */}
        {(activeRefTab === 'semua' || activeRefTab === 'peta') && (
          <CampusLocationMap />
        )}

        {/* SECTION: Quick Portals Links */}
        {(activeRefTab === 'semua' || activeRefTab === 'portal') && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <Link className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Pautan Penting & Portal Akademik ({filteredLinks.length})
              </h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredLinks.map((link) => (
                <div 
                  key={link.id} 
                  className="p-5.5 glass-card rounded-[24px] flex flex-col justify-between border border-white/55 shadow-sm hover:scale-[1.01] transition-transform duration-300"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-lg border ${
                        link.audience === 'Pelajar' 
                          ? 'bg-blue-50 text-blue-700 border-blue-100' 
                          : link.audience === 'Staf' 
                            ? 'bg-amber-50 text-amber-700 border-amber-100' 
                            : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      }`}>
                        Sesuai: {link.audience}
                      </span>
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
                    </div>
                    <h4 className="font-sans font-extrabold text-slate-900 text-sm">{link.title}</h4>
                    <p className="text-xs text-slate-500 font-medium leading-relaxed">{link.desc}</p>
                  </div>
                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex justify-end">
                    <a 
                      href={link.url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-xs font-extrabold text-indigo-700 hover:text-indigo-900 flex items-center gap-1"
                    >
                      Buka Portal <ChevronRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ))}
              {filteredLinks.length === 0 && (
                <p className="text-xs text-gray-500">Tiada pautan yang sepadan dengan carian.</p>
              )}
            </div>
          </div>
        )}

        {/* SECTION: Academic Calendar Events */}
        {(activeRefTab === 'semua' || activeRefTab === 'takwim') && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Takwim Akademik Sesi 2026/2027 ({filteredCalendar.length})
              </h3>
            </div>

            <div className="glass-panel rounded-[26px] overflow-hidden border border-white/55 shadow-sm">
              <div className="divide-y divide-slate-100/80">
                {filteredCalendar.map((event) => {
                  const borderLColor = event.type === 'akademik' 
                    ? 'border-l-4 border-indigo-500' 
                    : event.type === 'cuti' 
                      ? 'border-l-4 border-rose-500' 
                      : 'border-l-4 border-emerald-500';

                  return (
                    <div 
                      key={event.id}
                      className={`p-4 md:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-white/50 transition-colors ${borderLColor}`}
                    >
                      <div className="flex items-start gap-3.5 text-left">
                        <div className="p-2.5 rounded-xl bg-white/80 border border-slate-100 text-indigo-700 shadow-2xs">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-sans font-extrabold text-slate-900 text-[13px]">{event.title}</h4>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 font-semibold">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{event.dateRange}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <span className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-md border ${
                          event.type === 'akademik' 
                            ? 'bg-blue-50 text-blue-800 border-blue-100' 
                            : event.type === 'cuti' 
                              ? 'bg-red-50 text-red-800 border-red-100' 
                              : 'bg-emerald-50 text-emerald-800 border-emerald-100'
                        }`}>
                          {event.type.toUpperCase()}
                        </span>
                        <span className="px-2.5 py-0.5 text-[10px] font-extrabold rounded-md bg-white border border-slate-100 text-slate-600 flex items-center gap-1 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          {event.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredCalendar.length === 0 && (
                  <p className="p-6 text-xs text-gray-500">Tiada acara takwim yang sepadan dengan carian.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION: Helpdesk & Warden Contacts */}
        {(activeRefTab === 'semua' || activeRefTab === 'bantuan') && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <PhoneCall className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Talian Bantuan Kampus, Kaunter & Warden ({filteredContacts.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredContacts.map((contact) => (
                <div 
                  key={contact.id} 
                  className="p-5.5 glass-card rounded-[24px] flex flex-col justify-between border border-white/55 shadow-sm hover:scale-[1.01] transition-transform duration-300 text-left"
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                      <h4 className="font-sans font-extrabold text-slate-900 text-sm tracking-tight leading-snug">
                        {contact.department}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">{contact.role}</p>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-700">{contact.phone}</span>
                      {contact.extension && (
                        <span className="text-xs font-mono font-extrabold text-indigo-700 bg-indigo-50/70 border border-indigo-100/50 px-2 py-0.5 rounded-lg">
                          ({contact.extension})
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Action row with direct triggers */}
                  <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAction('call', contact)}
                      className="py-2 rounded-xl border border-slate-100 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                    >
                      <PhoneCall className="w-3.5 h-3.5 text-indigo-600 animate-pulse" /> Hubungi
                    </button>
                    <button
                      onClick={() => handleAction('whatsapp', contact)}
                      className="py-2 rounded-xl border border-slate-100 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/70 text-[11px] font-extrabold flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp
                    </button>
                  </div>
                </div>
              ))}
              {filteredContacts.length === 0 && (
                <p className="text-xs text-gray-500">Tiada talian kecemasan sepadan dengan carian.</p>
              )}
            </div>
          </div>
        )}

        {/* SECTION: Rules & Student Guide */}
        {(activeRefTab === 'semua' || activeRefTab === 'panduan') && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50/60 border border-indigo-100/40 flex items-center justify-center text-indigo-700 font-extrabold">
                <BookOpen className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                Panduan Am, Polisi & Peraturan Kolej ({filteredRules.length})
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {filteredRules.map((rule) => (
                <div 
                  key={rule.id} 
                  className="p-6.5 glass-card rounded-[26px] border border-white/55 shadow-sm bg-gradient-to-b from-white/70 to-white/40 hover:scale-[1.005] transition-all text-left"
                >
                  <div className="space-y-2 border-b border-slate-100 pb-3.5">
                    <h4 className="font-sans font-extrabold text-slate-900 text-sm flex items-center gap-2.5">
                      <Shield className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                      {rule.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-semibold leading-relaxed">{rule.desc}</p>
                  </div>
                  <div className="mt-4.5 space-y-3">
                    {rule.details.map((detail, idx) => (
                      <div key={idx} className="flex gap-3 text-xs text-slate-600 font-semibold leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {filteredRules.length === 0 && (
                <p className="text-xs text-gray-500">Tiada maklumat peraturan ditemui.</p>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

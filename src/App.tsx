/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search,
  Filter, 
  X, 
  RotateCcw, 
  UserCheck, 
  Sparkles,
  Settings,
  Lock,
  Pencil,
  FileSpreadsheet,
  Upload,
  ChevronDown
} from 'lucide-react';
import { Staff, DivisionType, StaffCommittee, AuthorizedAdmin } from './types';
import { INITIAL_STAFF_DATA } from './data/initialStaff';
import { STAFF_GRADE_MAP, determineBahagian } from './utils/staffGrade';
import { getDistrictState } from './utils/stateMapping';
import { generateDefaultCommitteesForStaff, deduplicateCommittees } from './utils/committeeService';
import { StaffCard } from './components/StaffCard';
import { ProfileModal } from './components/ProfileModal';
import { CommitteeModal } from './components/CommitteeModal';
import { SyncSettings } from './components/SyncSettings';
import { AddEditStaffModal } from './components/AddEditStaffModal';
import { CampusReferenceHub } from './components/CampusReferenceHub';
import { AdminPinModal } from './components/AdminPinModal';
import { SelfRegistrationPage } from './components/SelfRegistrationPage';
import { 
  fetchStaffListFromFirestore, 
  fetchCommitteesFromFirestore, 
  saveStaffListToFirestore, 
  saveCommitteesToFirestore 
} from './config/firebase';

export default function App() {
  // Navigation State ('directory' | 'rujukan' | 'daftar')
  const [activeHub, setActiveHub] = useState<'directory' | 'rujukan' | 'daftar'>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const pageParam = (searchParams.get('page') || searchParams.get('tab') || '').toLowerCase();
      if (hash.includes('daftar') || pathname.endsWith('/daftar') || pageParam === 'daftar') {
        return 'daftar';
      }
      if (hash.includes('rujukan') || pathname.endsWith('/rujukan') || pageParam === 'rujukan') {
        return 'rujukan';
      }
    }
    return 'directory';
  });

  // Staff Directory State
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);

  // Committee State
  const [committees, setCommittees] = useState<StaffCommittee[]>([]);
  const [committeeStaff, setCommitteeStaff] = useState<Staff | null>(null);

  // Load committee data from Firestore / LocalStorage / Fallback
  const loadCommitteesData = async (currentStaffList: Staff[]) => {
    try {
      // 1. Check Firebase Firestore for persistent committee data
      const firestoreCommittees = await fetchCommitteesFromFirestore();
      if (firestoreCommittees && firestoreCommittees.length > 0) {
        const cleaned = deduplicateCommittees(firestoreCommittees);
        setCommittees(cleaned);
        localStorage.setItem('kpmbp_smarthub_committees', JSON.stringify(cleaned));
        return;
      }

      // 2. Check localStorage
      const cachedCommittees = localStorage.getItem('kpmbp_smarthub_committees');
      if (cachedCommittees) {
        const parsed = JSON.parse(cachedCommittees);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const cleaned = deduplicateCommittees(parsed);
          setCommittees(cleaned);
          saveCommitteesToFirestore(cleaned).catch(console.warn);
          return;
        }
      }
    } catch (err) {
      console.warn('Committee loading error:', err);
    }

    // 3. Fallback default generated committees
    const defaultComm = deduplicateCommittees(generateDefaultCommitteesForStaff(currentStaffList));
    setCommittees(defaultComm);
  };

  useEffect(() => {
    if (staffList.length > 0) {
      loadCommitteesData(staffList);
    }
  }, [staffList.length]);
  
  // Modals & Panel States
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [selectedDivision, setSelectedDivision] = useState<DivisionType>('Semua');
  const [selectedDepartment, setSelectedDepartment] = useState('Semua');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Debounce search input by 250ms for high performance
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  
  // Admin States
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<AuthorizedAdmin | null>(null);
  const [isAdminPinOpen, setIsAdminPinOpen] = useState(false);

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsPwaInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsPwaInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Listen to URL hash and history state for direct slug navigation (e.g. #/daftar)
  useEffect(() => {
    const handleUrlChange = () => {
      const hash = window.location.hash.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      const searchParams = new URLSearchParams(window.location.search);
      const pageParam = (searchParams.get('page') || searchParams.get('tab') || '').toLowerCase();

      if (hash.includes('daftar') || pathname.endsWith('/daftar') || pageParam === 'daftar') {
        setActiveHub('daftar');
      } else if (hash.includes('rujukan') || pathname.endsWith('/rujukan') || pageParam === 'rujukan') {
        setActiveHub('rujukan');
      }
    };

    handleUrlChange();
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsPwaInstalled(true);
      }
    } else {
      setIsSettingsOpen(true);
    }
  };

  const handleToggleAdminMode = () => {
    if (isAdminMode) {
      setIsAdminMode(false);
      setCurrentAdmin(null);
      setIsSettingsOpen(false);
    } else {
      setIsAdminPinOpen(true);
    }
  };

  // Home Trigger: Reset navigation, close modals/drawers/overlays, and reset filters to default
  const handleGoHome = () => {
    setActiveHub('directory');
    if (typeof window !== 'undefined' && window.location.hash) {
      window.location.hash = '';
    }
    setSelectedStaff(null);
    setCommitteeStaff(null);
    setIsAddEditOpen(false);
    setEditingStaff(null);
    setIsSettingsOpen(false);
    setIsAdminPinOpen(false);
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setSelectedDivision('Semua');
    setSelectedDepartment('Semua');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Save changes to localStorage and Firebase Firestore
  const saveStaffList = (updatedList: Staff[]) => {
    setStaffList(updatedList);
    localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(updatedList));
    saveStaffListToFirestore(updatedList).catch((err) => {
      console.warn('Sync staff to Firebase notice:', err);
    });
  };

  // Load initial staff dataset from LocalStorage and Firebase Firestore on mount
  useEffect(() => {
    const cachedStaff = localStorage.getItem('kpmbp_smarthub_staff');
    if (cachedStaff) {
      try {
        const parsed = JSON.parse(cachedStaff);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const enriched = parsed.map((s) => {
            const g = s.grade || s.Gred || STAFF_GRADE_MAP[s.staff_id || s.ID] || '';
            const b = s.Bahagian || determineBahagian(s.Jawatan, s.Bahagian);
            return {
              ...s,
              Bahagian: b,
              Gred: g,
              grade: g,
            };
          });
          setStaffList(enriched);
        } else {
          setStaffList(INITIAL_STAFF_DATA);
          localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(INITIAL_STAFF_DATA));
        }
      } catch (e) {
        setStaffList(INITIAL_STAFF_DATA);
      }
    } else {
      setStaffList(INITIAL_STAFF_DATA);
      localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(INITIAL_STAFF_DATA));
    }

    // Load stored records from Firebase Firestore
    fetchStaffListFromFirestore().then((fbStaff) => {
      if (fbStaff && fbStaff.length > 0) {
        const enriched = fbStaff.map((s) => {
          const g = s.grade || s.Gred || STAFF_GRADE_MAP[s.staff_id || s.ID] || '';
          const b = s.Bahagian || determineBahagian(s.Jawatan, s.Bahagian);
          return {
            ...s,
            Bahagian: b,
            Gred: g,
            grade: g,
          };
        });
        setStaffList(enriched);
        localStorage.setItem('kpmbp_smarthub_staff', JSON.stringify(enriched));
      }
    }).catch((err) => {
      console.warn('Firestore fetch notice:', err);
    });
  }, []);

  // Update existing staff handler
  const handleSaveStaff = (staff: Staff) => {
    const finalStaff = {
      ...staff,
      Bahagian: determineBahagian(staff.Jawatan, staff.Bahagian),
    };
    const updated = staffList.map((s) => (s.ID === finalStaff.ID ? finalStaff : s));
    saveStaffList(updated);
  };

  // Self-Registration Handler: Direct registration of new staff into platform & Firebase
  const handleRegisterStaff = (newStaff: Staff) => {
    const resolvedKategori = newStaff.Kategori || determineBahagian(newStaff.Jawatan, newStaff.Bahagian);
    const finalStaff: Staff = {
      ...newStaff,
      Bil: newStaff.Bil || String(staffList.length + 1),
      Bahagian: resolvedKategori,
      Kategori: resolvedKategori,
      Status: 'Aktif',
    };

    const existingIndex = staffList.findIndex(
      (s) => (s.ID || s.staff_id || '').toUpperCase() === finalStaff.ID.toUpperCase()
    );

    let updatedList: Staff[];
    if (existingIndex !== -1) {
      updatedList = [...staffList];
      updatedList[existingIndex] = finalStaff;
    } else {
      updatedList = [...staffList, finalStaff];
    }

    saveStaffList(updatedList);

    // Auto-generate default committees if none exist
    const currentCommStaffIds = new Set(committees.map((c) => (c.staff_id || '').toUpperCase()));
    if (!currentCommStaffIds.has(finalStaff.ID.toUpperCase())) {
      const newComms = generateDefaultCommitteesForStaff([finalStaff]);
      if (newComms.length > 0) {
        const mergedCommittees = [...committees, ...newComms];
        setCommittees(mergedCommittees);
        localStorage.setItem('kpmbp_smarthub_committees', JSON.stringify(mergedCommittees));
        saveCommitteesToFirestore(mergedCommittees).catch(console.warn);
      }
    }
  };

  const handleDeleteStaff = (id: string) => {
    const updated = staffList.filter((s) => s.ID !== id);
    saveStaffList(updated);
    if (selectedStaff?.ID === id) {
      setSelectedStaff(null);
    }
  };

  const handleResetStaffData = () => {
    saveStaffList(INITIAL_STAFF_DATA);
  };

  const handleImportCommitteeData = (importedCommittees: StaffCommittee[]) => {
    const cleaned = deduplicateCommittees(importedCommittees);
    setCommittees(cleaned);
    localStorage.setItem('kpmbp_smarthub_committees', JSON.stringify(cleaned));
    saveCommitteesToFirestore(cleaned).catch((err) => {
      console.warn('Sync committees to Firebase notice:', err);
    });
  };

  const handleResetCommitteeData = () => {
    localStorage.removeItem('kpmbp_smarthub_committees');
    loadCommitteesData(staffList);
  };

  // Build pre-computed searchable index on staff dataset load/change
  const indexedStaffList = useMemo(() => {
    return staffList.map((staff) => {
      const district = String(staff.DaerahAsal || '');
      const state = getDistrictState(district);

      // Collect all vehicle plates (PlatNo1, PlatNo2, PlatNo3)
      const allPlates = [
        staff.PlatNo1,
        staff.PlatNo2,
        staff.PlatNo3,
        staff.NoPlat,
      ].filter(Boolean) as string[];

      const platesNormalized = allPlates.map((p) => String(p).toLowerCase().trim());
      const platesNoSpace = allPlates.map((p) => String(p).toLowerCase().replace(/\s+/g, ''));

      // Combine searchable staff fields matching the 17 official columns
      const searchableText = [
        staff.Nama,
        staff.NamaPendek,
        staff.StaffID,
        staff.ID,
        staff.staff_id,
        staff.Kategori,
        staff.Bahagian,
        staff.Jawatan,
        staff.Unit,
        staff.DepartmentID,
        staff.Gred,
        staff.grade,
        staff.Email,
        staff.Telefon,
        staff.Sambungan,
        ...platesNormalized,
        ...platesNoSpace,
        staff.TahunLahir,
        staff['Tahun Lahir'],
        district,
        state,
        staff.Kelulusan,
        staff.Pengkhususan,
      ]
        .filter(Boolean)
        .map((val) => String(val).toLowerCase().trim())
        .join(' ');

      return {
        staff,
        searchableText,
        platesNoSpace,
      };
    });
  }, [staffList]);

  // Filters calculation using pre-computed index & debounced search query
  const uniqueDepartments = ['Semua', ...Array.from(new Set(staffList.map((s) => s.DepartmentID)))];

  const filteredStaff = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    const qNoSpace = q.replace(/\s+/g, '');

    return indexedStaffList
      .filter(({ staff, searchableText, platesNoSpace }) => {
        if (q) {
          const matchesQuery =
            searchableText.includes(q) ||
            searchableText.includes(qNoSpace) ||
            platesNoSpace.some((plate) => plate.includes(qNoSpace));
          if (!matchesQuery) return false;
        }

        if (selectedDivision !== 'Semua' && staff.Bahagian !== selectedDivision) {
          return false;
        }

        if (selectedDepartment !== 'Semua' && staff.DepartmentID !== selectedDepartment) {
          return false;
        }

        return true;
      })
      .map((item) => item.staff);
  }, [indexedStaffList, debouncedSearchQuery, selectedDivision, selectedDepartment]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDivision('Semua');
    setSelectedDepartment('Semua');
    setShowMobileFilters(false);
  };

  // Get count stats
  const totalStaff = staffList.length;
  const supportStaff = staffList.filter(s => s.Bahagian !== 'Akademik').length;
  const academicStaff = staffList.filter(s => s.Bahagian === 'Akademik').length;

  return (
    <div className="min-h-screen text-gray-800 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 relative">
      
      {/* Dynamic Ambient Background Blobs */}
      <div className="mesh-blob blob-1"></div>
      <div className="mesh-blob blob-2"></div>
      <div className="mesh-blob blob-3"></div>

      {/* Primary Glassmorphic Header */}
      <header className="glass-panel sticky top-0 z-40 px-6 py-4 border-b border-white/40 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo & Platform Info with Official KPMBP SmartHub Logo (Home Trigger) */}
          <button
            type="button"
            onClick={handleGoHome}
            title="Kembali ke Halaman Utama (Home)"
            aria-label="Kembali ke Halaman Utama DIRECTORY KPMBP"
            className="flex items-center gap-3.5 text-left cursor-pointer group focus:outline-hidden transition-opacity hover:opacity-90 active:scale-[0.99]"
          >
            <img
              src="https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/KPMBPSmartHub/favicon.svg"
              alt="Logo DIRECTORY KPMBP"
              className="w-11 h-11 object-contain drop-shadow-sm rounded-xl shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-extrabold text-gray-950 text-lg md:text-xl tracking-tight leading-tight">
                  DIRECTORY <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 bg-clip-text text-transparent">KPMBP</span>
                </h1>
              </div>
              <p className="text-[11px] text-gray-500 font-medium tracking-wide">Kolej Profesional MARA Bandar Penawar</p>
            </div>
          </button>

          {/* Dynamic Campus Center Control Deck */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Admin Mode Toggle Button */}
            <button
              onClick={handleToggleAdminMode}
              title={isAdminMode ? 'Matikan Admin Mode' : 'Aktifkan Admin Mode (Emel MARA / Master PIN)'}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all border cursor-pointer ${
                isAdminMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-200'
                  : 'bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600 border-slate-200/80 shadow-2xs'
              }`}
            >
              {isAdminMode ? (
                <>
                  <Pencil className="w-3.5 h-3.5" />
                  <span className="max-w-[140px] truncate">{currentAdmin?.name ? `Admin: ${currentAdmin.name}` : 'Admin Mode Aktif'}</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Admin Mode</span>
                </>
              )}
            </button>

            {/* Single Consolidated Database & CSV Management Settings Button (Hanya muncul semasa Admin Mode Aktif) */}
            {isAdminMode && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                title="Pengurusan Data & Import CSV"
                aria-label="Pengurusan Data & Import CSV"
                className={`relative p-2 rounded-2xl transition-all border cursor-pointer flex items-center justify-center ${
                  isSettingsOpen 
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white border-transparent shadow-md shadow-indigo-200' 
                    : 'bg-white/80 text-slate-700 hover:text-indigo-600 border-slate-200/80 hover:bg-white shadow-2xs'
                }`}
              >
                <Settings className={`w-5 h-5 transition-transform duration-300 hover:rotate-90 ${isSettingsOpen ? 'text-white' : 'text-indigo-600'}`} />
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Sub-Header Tab Switcher */}
      <div className="border-b border-slate-100/80 bg-white/40 backdrop-blur-md relative z-30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2">
          <button
            onClick={() => {
              setActiveHub('directory');
              if (typeof window !== 'undefined' && window.location.hash.includes('daftar')) {
                window.location.hash = '';
              }
            }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeHub === 'directory'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white/60 text-slate-700 hover:bg-white/80 border border-slate-100'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Rujukan Staff
          </button>
          <button
            onClick={() => {
              setActiveHub('rujukan');
              if (typeof window !== 'undefined' && window.location.hash.includes('daftar')) {
                window.location.hash = '';
              }
            }}
            className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
              activeHub === 'rujukan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                : 'bg-white/60 text-slate-700 hover:bg-white/80 border border-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            Rujukan Pelajar
          </button>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 relative z-10">
        {activeHub === 'directory' ? (
          <div className="space-y-6">
            
            {/* Unified Search & Directory Control Bar */}
            <div className="glass-panel rounded-3xl p-4 md:p-5 border border-white/55 shadow-sm space-y-3.5 text-left sticky top-2 z-30 bg-white/95 backdrop-blur-md transition-all">
              
              {/* Row 1: Search Box & Jabatan Selector */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                
                {/* Prominent Search Bar */}
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500 w-4 h-4 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama, no. plat (cth: SYM2539), gred, jabatan..."
                    className="w-full pl-11 pr-10 py-3 bg-white/90 border border-indigo-200/80 rounded-2xl text-xs md:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none transition-all shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer"
                      title="Padam carian"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Jabatan Selector (always on desktop; on mobile hidden while searching unless expanded) */}
                <div className={`relative min-w-[200px] ${searchQuery.trim() && !showMobileFilters ? 'hidden sm:block' : 'block'}`}>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-white/90 border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none appearance-none cursor-pointer shadow-2xs"
                  >
                    <option value="Semua">Semua Bahagian</option>
                    {uniqueDepartments.filter(d => d !== 'Semua').map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-3.5 flex items-center pointer-events-none text-slate-500">
                    <Filter className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Reset Filters button */}
                {(searchQuery || selectedDivision !== 'Semua' || selectedDepartment !== 'Semua') && (
                  <button
                    onClick={resetFilters}
                    className={`px-3.5 py-3 text-xs text-indigo-700 hover:text-indigo-950 font-bold items-center justify-center gap-1.5 bg-indigo-50/80 hover:bg-indigo-100/80 rounded-2xl border border-indigo-200/80 transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                      searchQuery.trim() && !showMobileFilters ? 'hidden sm:flex' : 'flex'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Set Semula</span>
                  </button>
                )}
              </div>

              {/* Mobile Search Live Toolbar: Appears when typing on mobile for instant feedback without layout shift */}
              {searchQuery.trim() && (
                <div className="flex sm:hidden items-center justify-between pt-1 pb-0.5 text-xs">
                  <div className="flex items-center gap-1.5 font-extrabold text-indigo-950 bg-indigo-50/90 px-3 py-1.5 rounded-xl border border-indigo-200/70 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span>{filteredStaff.length} staf ditemui</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => (document.activeElement as HTMLElement)?.blur()}
                      className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl cursor-pointer transition-all flex items-center gap-1 shadow-2xs"
                      title="Tutup papan kekunci maya untuk paparan luas"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      <span>Tutup Kekunci</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMobileFilters(!showMobileFilters)}
                      className={`px-2.5 py-1.5 text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center gap-1 border shadow-2xs ${
                        showMobileFilters 
                          ? 'bg-indigo-600 text-white border-indigo-600' 
                          : 'bg-white text-indigo-700 border-indigo-200/80 hover:bg-indigo-50'
                      }`}
                    >
                      <Filter className="w-3 h-3" />
                      <span>{showMobileFilters ? 'Ringkas' : 'Tapis'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Row 2: Horizontal Division (Bahagian) Filter Tabs (collapsed on mobile during search to bring results up) */}
              <div className={`items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-slate-100/80 pt-3 ${
                searchQuery.trim() && !showMobileFilters ? 'hidden sm:flex' : 'flex'
              }`}>
                {(['Semua', 'Pengurusan', 'Akademik', 'Sokongan Akademik', 'Pentadbiran'] as DivisionType[]).map((div) => {
                  const isActive = selectedDivision === div;
                  const count = div === 'Semua' 
                    ? staffList.length 
                    : staffList.filter(s => s.Bahagian === div).length;

                  let pastelStyle = '';
                  let badgeStyle = '';

                  if (div === 'Semua') {
                    pastelStyle = isActive
                      ? 'bg-rose-100/95 text-rose-950 border-2 border-rose-400 shadow-xs font-black'
                      : 'bg-rose-50/80 text-rose-900 hover:bg-rose-100/70 border border-rose-200/70 font-extrabold';
                    badgeStyle = isActive ? 'bg-rose-200 text-rose-950' : 'bg-rose-100 text-rose-900';
                  } else if (div === 'Pengurusan') {
                    pastelStyle = isActive
                      ? 'bg-purple-100/95 text-purple-950 border-2 border-purple-400 shadow-xs font-black'
                      : 'bg-purple-50/80 text-purple-900 hover:bg-purple-100/70 border border-purple-200/70 font-extrabold';
                    badgeStyle = isActive ? 'bg-purple-200 text-purple-950' : 'bg-purple-100 text-purple-900';
                  } else if (div === 'Akademik') {
                    pastelStyle = isActive
                      ? 'bg-amber-100/95 text-amber-950 border-2 border-amber-400 shadow-xs font-black'
                      : 'bg-amber-50/80 text-amber-900 hover:bg-amber-100/70 border border-amber-200/70 font-extrabold';
                    badgeStyle = isActive ? 'bg-amber-200 text-amber-950' : 'bg-amber-100 text-amber-900';
                  } else if (div === 'Sokongan Akademik') {
                    pastelStyle = isActive
                      ? 'bg-sky-100/95 text-sky-950 border-2 border-sky-400 shadow-xs font-black'
                      : 'bg-sky-50/80 text-sky-900 hover:bg-sky-100/70 border border-sky-200/70 font-extrabold';
                    badgeStyle = isActive ? 'bg-sky-200 text-sky-950' : 'bg-sky-100 text-sky-900';
                  } else if (div === 'Pentadbiran') {
                    pastelStyle = isActive
                      ? 'bg-emerald-100/95 text-emerald-950 border-2 border-emerald-400 shadow-xs font-black'
                      : 'bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100/70 border border-emerald-200/70 font-extrabold';
                    badgeStyle = isActive ? 'bg-emerald-200 text-emerald-950' : 'bg-emerald-100 text-emerald-900';
                  }

                  return (
                    <button
                      key={div}
                      onClick={() => setSelectedDivision(div)}
                      className={`px-4 py-2 rounded-2xl text-xs font-extrabold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${pastelStyle}`}
                    >
                      <span>{div}</span>
                      <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${badgeStyle}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Active Admin Mode Notification Banner */}
            {isAdminMode && (
              <div className="p-4 bg-amber-50/90 border border-amber-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-amber-950 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping shrink-0" />
                  <div>
                    <h4 className="text-xs font-extrabold text-amber-950">Mod Suntingan Admin Aktif</h4>
                    <p className="text-[11px] text-amber-800 font-medium">
                      Pendaftaran staf baharu dilakukan melalui import CSV. Klik ikon pensel pada kad staf untuk kemaskini profil.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Urus / Import CSV</span>
                  </button>
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="px-3 py-1.5 bg-white border border-amber-200 text-amber-900 hover:bg-amber-100/60 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
                  >
                    Tetapan Admin
                  </button>
                </div>
              </div>
            )}

            {/* Staff Results Section */}
            <div className="space-y-4">
              {/* Staff Grid Header */}
              <div className="flex items-center justify-between px-2 pt-2 text-left">
                <div>
                  <h2 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Senarai Kakitangan & Pensyarah ({filteredStaff.length})
                  </h2>
                </div>
                {isAdminMode && (
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    title="Pendaftaran kakitangan baharu dilaksanakan melalui import fail CSV"
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-extrabold transition-all shadow-md shadow-indigo-200 cursor-pointer active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV Staf Baharu</span>
                  </button>
                )}
              </div>

              {/* Staff Cards Grid */}
              {filteredStaff.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4.5">
                  {filteredStaff.map((staff) => (
                    <div key={staff.ID} className="relative">
                      <StaffCard
                        staff={staff}
                        onClick={(stf) => setSelectedStaff(stf)}
                        isAdminMode={isAdminMode}
                        onEdit={(stf) => {
                          setEditingStaff(stf);
                          setIsAddEditOpen(true);
                        }}
                        onOpenCommittee={(stf) => setCommitteeStaff(stf)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                /* Empty State */
                <div className="glass-panel rounded-3xl p-8 sm:p-12 text-center max-w-md mx-auto space-y-4 border border-slate-100 shadow-sm bg-white/50">
                  <div className="w-16 h-16 bg-white border border-slate-100 rounded-full flex items-center justify-center mx-auto text-indigo-600 shadow-sm">
                    <Search className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-extrabold text-slate-900 text-base">Tiada staf ditemui.</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                      Sila cuba lagi dengan kata kunci yang berbeza.
                    </p>
                  </div>
                  <button
                    onClick={resetFilters}
                    className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-extrabold shadow-md shadow-indigo-200 transition-all cursor-pointer"
                  >
                    Kosongkan Saringan
                  </button>
                </div>
              )}
            </div>

            {/* Mobile Floating Result Quick Dismiss Pill (Optional helper when searching on mobile) */}
            {searchQuery.trim() && filteredStaff.length > 0 && (
              <div className="sm:hidden fixed bottom-4 inset-x-4 z-40 flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => (document.activeElement as HTMLElement)?.blur()}
                  className="pointer-events-auto bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl backdrop-blur-md flex items-center gap-2 border border-slate-700/50 active:scale-95 transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{filteredStaff.length} staf dijumpai</span>
                  <span className="text-slate-400">•</span>
                  <span className="text-indigo-300 font-extrabold flex items-center gap-0.5">
                    Lihat Penuh <ChevronDown className="w-3.5 h-3.5 inline" />
                  </span>
                </button>
              </div>
            )}

          </div>
        ) : activeHub === 'rujukan' ? (
          <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/55 shadow-sm">
            <CampusReferenceHub />
          </div>
        ) : (
          <SelfRegistrationPage
            existingStaffList={staffList}
            onRegisterStaff={handleRegisterStaff}
            onNavigateHome={handleGoHome}
            onViewStaffProfile={(staff) => {
              handleGoHome();
              setSelectedStaff(staff);
            }}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="glass-panel border-t border-white/40 py-8 mt-16 text-center text-xs text-slate-500 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto px-6 space-y-6">
          
          {/* Statistik Direktori Section in Footer */}
          <div className="bg-white/60 border border-slate-200/60 rounded-3xl p-5 shadow-2xs">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-left">
              <div>
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  Statistik Direktori KPMBP
                </h3>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Ringkasan data bilangan kakitangan dan kepakaran Kolej Profesional MARA Bandar Penawar
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                <div className="bg-white/90 border border-slate-100 px-4 py-2.5 rounded-2xl text-center shadow-2xs">
                  <span className="text-xl font-extrabold text-slate-800 block leading-tight">{totalStaff}</span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Jumlah Staf</span>
                </div>
                <div className="bg-white/90 border border-slate-100 px-4 py-2.5 rounded-2xl text-center shadow-2xs">
                  <span className="text-xl font-extrabold text-emerald-600 block leading-tight">{supportStaff}</span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Pentadbiran & Sokongan</span>
                </div>
                <div className="bg-white/90 border border-slate-100 px-4 py-2.5 rounded-2xl text-center shadow-2xs">
                  <span className="text-xl font-extrabold text-indigo-600 block leading-tight">{academicStaff}</span>
                  <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Pakar / Akademik</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-center pt-2">
            <p className="font-semibold text-slate-500 text-center leading-relaxed">
              © 2026 KPMBP SmartHub. by{' '}
              <a
                href="https://wasap.my/60145313756"
                target="_blank"
                rel="noopener noreferrer"
                className="font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors cursor-pointer"
              >
                Syncrozz
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ProfileModal
        staff={selectedStaff}
        committees={committees}
        onClose={() => setSelectedStaff(null)}
        isAdminMode={isAdminMode}
        onEditStaff={(stf) => {
          setSelectedStaff(null);
          setEditingStaff(stf);
          setIsAddEditOpen(true);
        }}
        onOpenCommittee={(stf) => setCommitteeStaff(stf)}
        onOpenAdminPin={() => setIsAdminPinOpen(true)}
      />

      <CommitteeModal
        staff={committeeStaff}
        committees={committees}
        onClose={() => setCommitteeStaff(null)}
      />

      <AddEditStaffModal
        staff={editingStaff}
        isOpen={isAddEditOpen}
        onClose={() => {
          setIsAddEditOpen(false);
          setEditingStaff(null);
        }}
        onSave={handleSaveStaff}
        onDelete={handleDeleteStaff}
      />

      <SyncSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isAdminMode={isAdminMode}
        onToggleAdminMode={handleToggleAdminMode}
        onImportStaffData={(imported) => saveStaffList(imported)}
        onImportCommitteeData={handleImportCommitteeData}
        totalStaffCount={staffList.length}
        totalCommitteeCount={committees.length}
        staffList={staffList}
        committeeList={committees}
        onResetStaffData={handleResetStaffData}
        onResetCommitteeData={handleResetCommitteeData}
        onInstallPWA={handleInstallPWA}
        canInstallPWA={!isPwaInstalled}
        onNavigateToRegistration={() => {
          setIsSettingsOpen(false);
          setActiveHub('daftar');
          if (typeof window !== 'undefined') {
            window.location.hash = '#/daftar';
          }
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      <AdminPinModal
        isOpen={isAdminPinOpen}
        onClose={() => setIsAdminPinOpen(false)}
        onSuccess={(admin) => {
          setIsAdminMode(true);
          setCurrentAdmin(admin || null);
          setIsAdminPinOpen(false);
        }}
      />

    </div>
  );
}

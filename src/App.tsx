/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search,
  Filter, 
  X, 
  RotateCcw, 
  UserCheck, 
  Sparkles,
  BookOpen,
  Calendar,
  Settings,
  Lock,
  Pencil,
  FileSpreadsheet,
  Upload,
  ChevronDown,
  GraduationCap,
  Layers
} from 'lucide-react';
import { Staff, DivisionType, StaffCommittee, AuthorizedAdmin, NavigationItem } from './types';
import { INITIAL_STAFF_DATA } from './data/initialStaff';
import { STAFF_GRADE_MAP, determineBahagian } from './utils/staffGrade';
import { getDistrictState } from './utils/stateMapping';
import { generateDefaultCommitteesForStaff, deduplicateCommittees } from './utils/committeeService';
import { formatIC, cleanIC } from './utils/icFormatter';
import { StaffCard } from './components/StaffCard';
import { ProfileModal } from './components/ProfileModal';
import { CommitteeModal } from './components/CommitteeModal';
import { SyncSettings } from './components/SyncSettings';
import { AddEditStaffModal } from './components/AddEditStaffModal';
import { CampusReferenceHub } from './components/CampusReferenceHub';
import { AdminPinModal } from './components/AdminPinModal';
import { SelfRegistrationPage } from './components/SelfRegistrationPage';
import { StudentTimetableHub } from './components/StudentTimetableHub';
import { LecturerTimetableHub } from './components/LecturerTimetableHub';
import { DynamicNavigationBar } from './components/DynamicNavigationBar';
import { NavigationManagerModal } from './components/NavigationManagerModal';
import { DriveContentViewer } from './components/DriveContentViewer';
import { DEFAULT_NAVIGATION_ITEMS, subscribeToNavigation, saveNavigationItems } from './services/navigationService';
import { verifyGoogleAdmin, clearLegacyAdminState } from './utils/adminAuthService';
import { 
  fetchStaffListFromFirestore, 
  fetchCommitteesFromFirestore, 
  saveStaffListToFirestore, 
  saveCommitteesToFirestore,
  signOutAdmin,
  subscribeToAuthChanges
} from './config/firebase';

export default function App() {
  // Navigation State ('directory' | 'rujukan' | 'jadual' | 'jadual-pensyarah' | 'daftar' | custom item ID)
  const [activeHub, setActiveHub] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
      const searchParams = new URLSearchParams(window.location.search);
      const pageParam = (searchParams.get('page') || searchParams.get('tab') || '').toLowerCase();

      if (rawHash) {
        if (rawHash === 'daftar' || pageParam === 'daftar') return 'daftar';
        if (rawHash === 'pensyarah' || rawHash === 'jadual-pensyarah' || pageParam === 'pensyarah') return 'jadual-pensyarah';
        if (rawHash === 'jadual' || pageParam === 'jadual') return 'jadual';
        if (rawHash === 'rujukan' || pageParam === 'rujukan') return 'rujukan';
        return rawHash;
      }
    }
    return 'directory';
  });

  // Dynamic Hierarchical Navigation State (SES v4.4)
  const [navigationItems, setNavigationItems] = useState<NavigationItem[]>(DEFAULT_NAVIGATION_ITEMS);
  const [isNavManagerOpen, setIsNavManagerOpen] = useState(false);

  // Authoritative real-time Firestore synchronization for navigation architecture
  useEffect(() => {
    const unsubscribe = subscribeToNavigation((items) => {
      setNavigationItems(items);
    });
    return () => unsubscribe();
  }, []);

  // Compute active navigation item for current activeHub (prioritize ID match and child items)
  const activeNavItem = useMemo(() => {
    // 1. Direct match by ID
    const byId = navigationItems.find((item) => item.id === activeHub);
    if (byId) return byId;

    // 2. Child match by destination
    const childMatch = navigationItems.find(
      (item) => item.type === 'child' && item.destination === activeHub
    );
    if (childMatch) return childMatch;

    // 3. Parent match by destination
    return navigationItems.find((item) => item.destination === activeHub);
  }, [navigationItems, activeHub]);

  // Centralized Navigation Destination Resolver (SES v4.4)
  // Distinguishes between Navigation Identity (unique item ID) and Module Destination (internal module route)
  const resolvedDestination = useMemo(() => {
    // 1. If activeNavItem has a defined destination, use it
    if (activeNavItem?.destination) {
      return activeNavItem.destination;
    }

    // 2. Direct lookup in navigationItems by item ID
    const byId = navigationItems.find((item) => item.id === activeHub);
    if (byId?.destination) {
      return byId.destination;
    }

    // 3. Fallback to activeHub directly
    return activeHub;
  }, [activeNavItem, activeHub, navigationItems]);

  const handleSelectDestination = (destination: string) => {
    // Check if target is a known navigation item (by ID or destination)
    const matchedItem = navigationItems.find(
      (n) => n.id === destination || n.destination === destination
    );

    // If it's a Drive viewer item, ALWAYS open internally in DriveContentViewer
    if (matchedItem && (matchedItem.displayType === 'drive' || Boolean(matchedItem.driveUrl))) {
      setActiveHub(matchedItem.id);
      if (typeof window !== 'undefined') {
        window.location.hash = `#${matchedItem.id}`;
      }
      return;
    }

    // External Web Link
    if (destination.startsWith('http://') || destination.startsWith('https://')) {
      window.open(destination, '_blank', 'noopener,noreferrer');
      return;
    }

    if (destination.startsWith('#')) {
      const clean = destination.replace(/^#\/?/, '').trim();
      if (clean) setActiveHub(clean);
      if (typeof window !== 'undefined') {
        window.location.hash = destination;
      }
      return;
    }

    setActiveHub(destination);
    if (typeof window !== 'undefined') {
      if (destination === 'directory' || matchedItem?.destination === 'directory') {
        window.location.hash = '';
      } else if (destination === 'rujukan' || (matchedItem?.destination === 'rujukan' && matchedItem.id === destination)) {
        window.location.hash = destination.startsWith('nav_') ? `#${destination}` : '#rujukan';
      } else if (destination === 'jadual') {
        window.location.hash = '#jadual';
      } else if (destination === 'jadual-pensyarah') {
        window.location.hash = '#pensyarah';
      } else if (destination === 'daftar') {
        window.location.hash = '#daftar';
      } else {
        window.location.hash = `#${destination}`;
      }
    }
  };

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
  const [isAdminProfileOpen, setIsAdminProfileOpen] = useState(false);
  const adminProfileRef = useRef<HTMLDivElement>(null);

  // Close admin profile dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (adminProfileRef.current && !adminProfileRef.current.contains(event.target as Node)) {
        setIsAdminProfileOpen(false);
      }
    };
    if (isAdminProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAdminProfileOpen]);

  const getAdminInitials = (admin?: AuthorizedAdmin | null) => {
    if (!admin) return 'KK';
    if (admin.email === 'khaikerr@gmail.com' || (admin.name && admin.name.toLowerCase().includes('khai'))) {
      return 'KK';
    }
    if (admin.name) {
      const parts = admin.name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return admin.name.slice(0, 2).toUpperCase();
    }
    return 'KK';
  };

  // Clear obsolete admin LocalStorage keys and listen to authoritative Firebase Auth state
  useEffect(() => {
    // Purge legacy authentication keys from previous sessions
    clearLegacyAdminState();

    const unsubscribe = subscribeToAuthChanges((user) => {
      if (user && user.email) {
        const result = verifyGoogleAdmin({
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          uid: user.uid,
          emailVerified: user.emailVerified,
        });
        if (result.isValid && result.admin) {
          setIsAdminMode(true);
          setCurrentAdmin(result.admin);
        } else {
          setIsAdminMode(false);
          setCurrentAdmin(null);
        }
      } else {
        setIsAdminMode(false);
        setCurrentAdmin(null);
      }
    });
    return () => unsubscribe();
  }, []);

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

  // Listen to URL hash and history state for direct slug navigation (e.g. #/daftar, ?invite=, #nav_c_...)
  useEffect(() => {
    const handleUrlChange = () => {
      const rawHash = window.location.hash;
      const cleanHash = rawHash.replace(/^#\/?/, '').trim();
      const searchParams = new URLSearchParams(window.location.search);
      const pageParam = (searchParams.get('page') || searchParams.get('tab') || '').toLowerCase();

      if (cleanHash) {
        // 1. Direct match with navigation items by unique item ID
        const byId = navigationItems.find((n) => n.id === cleanHash);
        if (byId) {
          setActiveHub(byId.id);
          return;
        }

        // 2. Standard module aliases & query params
        if (cleanHash === 'daftar' || pageParam === 'daftar') {
          setActiveHub('daftar');
          return;
        }
        if (cleanHash === 'pensyarah' || cleanHash === 'jadual-pensyarah' || pageParam === 'pensyarah') {
          const pensyarahItem = navigationItems.find(
            (n) => n.type === 'child' && n.destination === 'jadual-pensyarah'
          );
          setActiveHub(pensyarahItem ? pensyarahItem.id : 'jadual-pensyarah');
          return;
        }
        if (cleanHash === 'jadual' || cleanHash === 'jadual-pelajar' || pageParam === 'jadual') {
          const pelajarItem = navigationItems.find(
            (n) => n.type === 'child' && n.destination === 'jadual'
          );
          setActiveHub(pelajarItem ? pelajarItem.id : 'jadual');
          return;
        }
        if (cleanHash === 'rujukan' || pageParam === 'rujukan') {
          const rujukanItem = navigationItems.find(
            (n) => n.destination === 'rujukan'
          );
          setActiveHub(rujukanItem ? rujukanItem.id : 'rujukan');
          return;
        }

        // 3. Fallback: match by destination (prioritizing child items over parent items)
        const childMatch = navigationItems.find(
          (n) => n.type === 'child' && n.destination === cleanHash
        );
        if (childMatch) {
          setActiveHub(childMatch.id);
          return;
        }

        const parentMatch = navigationItems.find(
          (n) => n.destination === cleanHash
        );
        if (parentMatch) {
          setActiveHub(parentMatch.id);
          return;
        }

        setActiveHub(cleanHash);
      } else {
        // Only set directory when hash is actually empty
        setActiveHub('directory');
      }
    };

    handleUrlChange();
    window.addEventListener('hashchange', handleUrlChange);
    window.addEventListener('popstate', handleUrlChange);
    return () => {
      window.removeEventListener('hashchange', handleUrlChange);
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [navigationItems]);

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
    setIsAdminProfileOpen(false);
    if (isAdminMode) {
      setIsAdminMode(false);
      setCurrentAdmin(null);
      setIsSettingsOpen(false);
      signOutAdmin().catch(() => {});
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
    setIsAdminProfileOpen(false);
    setIsNavManagerOpen(false);
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
            const initMatch = INITIAL_STAFF_DATA.find((init) => (init.ID === s.ID || init.StaffID === s.StaffID));
            const ic = formatIC(s.IC || s.NoKP || initMatch?.IC || '');
            return {
              ...s,
              IC: ic,
              NoKP: ic,
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
          const initMatch = INITIAL_STAFF_DATA.find((init) => (init.ID === s.ID || init.StaffID === s.StaffID));
          const ic = formatIC(s.IC || s.NoKP || initMatch?.IC || '');
          return {
            ...s,
            IC: ic,
            NoKP: ic,
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
      IC: formatIC(staff.IC || staff.NoKP || ''),
      NoKP: formatIC(staff.IC || staff.NoKP || ''),
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
        ...(isAdminMode && (staff.IC || staff.NoKP) ? [
          formatIC(staff.IC || staff.NoKP),
          cleanIC(staff.IC || staff.NoKP)
        ] : []),
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
  }, [staffList, isAdminMode]);

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
      <div className={`mesh-blob blob-1 transition-all duration-700 ${
        resolvedDestination === 'rujukan'
          ? '!bg-[radial-gradient(circle,rgba(16,185,129,0.18)_0%,rgba(20,184,166,0.06)_100%)]'
          : resolvedDestination === 'jadual'
          ? '!bg-[radial-gradient(circle,rgba(245,158,11,0.18)_0%,rgba(249,115,22,0.06)_100%)]'
          : resolvedDestination === 'jadual-pensyarah'
          ? '!bg-[radial-gradient(circle,rgba(244,63,94,0.18)_0%,rgba(236,72,153,0.06)_100%)]'
          : resolvedDestination === 'daftar'
          ? '!bg-[radial-gradient(circle,rgba(168,85,247,0.18)_0%,rgba(217,70,239,0.06)_100%)]'
          : ''
      }`}></div>
      <div className="mesh-blob blob-2"></div>
      <div className="mesh-blob blob-3"></div>

      {/* Primary Glassmorphic Header */}
      <header className="glass-panel sticky top-0 z-40 px-4 sm:px-6 py-2.5 sm:py-3.5 border-b border-white/40 shadow-xs backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4 flex-wrap">
          
          {/* Logo & Platform Info with Official KPMBP SmartHub Logo (Home Trigger) */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-nowrap shrink-0">
            <button
              type="button"
              onClick={handleGoHome}
              title="Kembali ke Halaman Utama (Home)"
              aria-label="Kembali ke Halaman Utama DIRECTORY KPMBP"
              className="flex items-center gap-2.5 sm:gap-3 cursor-pointer group focus:outline-hidden transition-opacity hover:opacity-90 active:scale-[0.99] shrink-0"
            >
              <img
                src="https://raw.githubusercontent.com/syncrozz/syncrozz-assets/main/logo/KPMBPSmartHub/favicon.svg"
                alt="Logo DIRECTORY KPMBP"
                className="w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-sm rounded-xl shrink-0"
                referrerPolicy="no-referrer"
              />
              <h1 className="font-sans font-extrabold text-gray-950 text-base sm:text-lg md:text-xl tracking-tight leading-none whitespace-nowrap">
                DIRECTORY <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 bg-clip-text text-transparent">KPMBP</span>
              </h1>
            </button>
          </div>

          {/* Dynamic Campus Center Control Deck */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Compact Standalone KK Avatar Icon & Profile Dropdown when Admin Mode is active */}
            {isAdminMode && currentAdmin && (
              <div className="relative" ref={adminProfileRef}>
                <button
                  type="button"
                  onClick={() => setIsAdminProfileOpen((prev) => !prev)}
                  title={`Profil Pentadbir: ${currentAdmin.email === 'khaikerr@gmail.com' ? 'Master Admin' : currentAdmin.name || 'Admin'} (${currentAdmin.email})`}
                  aria-label="Profil Pentadbir"
                  aria-expanded={isAdminProfileOpen}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 border-2 border-amber-300 shadow-2xs hover:shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
                >
                  {currentAdmin.photoUrl ? (
                    <img
                      src={currentAdmin.photoUrl}
                      alt={currentAdmin.name || 'Master Admin'}
                      className="w-full h-full rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-amber-500 text-white text-xs sm:text-xs font-black tracking-tight flex items-center justify-center select-none shadow-inner">
                      {getAdminInitials(currentAdmin)}
                    </div>
                  )}
                </button>

                {/* Admin Profile Dropdown Menu */}
                {isAdminProfileOpen && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white/95 backdrop-blur-md border border-amber-200/80 shadow-xl py-3 px-4 z-50 text-left">
                    <div className="flex items-center gap-3 pb-3 border-b border-amber-100">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 p-0.5 border-2 border-amber-300 shadow-2xs shrink-0 flex items-center justify-center">
                        {currentAdmin.photoUrl ? (
                          <img
                            src={currentAdmin.photoUrl}
                            alt={currentAdmin.name || 'Master Admin'}
                            className="w-full h-full rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-amber-500 text-white text-xs font-black flex items-center justify-center">
                            {getAdminInitials(currentAdmin)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 truncate">
                            {currentAdmin.email === 'khaikerr@gmail.com' ? 'Master Admin' : currentAdmin.name || 'Admin'}
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-100 text-amber-800 rounded-md border border-amber-200/70 shrink-0">
                            Level 1
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono truncate">
                          {currentAdmin.email}
                        </span>
                        <span className="text-[9px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Disahkan (Google Auth)
                        </span>
                      </div>
                    </div>

                    <div className="pt-2.5 pb-1 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminProfileOpen(false);
                          setIsSettingsOpen(true);
                        }}
                        className="w-full px-2.5 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Pengurusan Data & Import CSV</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminProfileOpen(false);
                          setIsNavManagerOpen(true);
                        }}
                        className="w-full px-2.5 py-2 text-xs font-bold text-slate-700 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Pengurusan Navigasi Dinamik</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAdminProfileOpen(false);
                          handleToggleAdminMode();
                        }}
                        className="w-full px-2.5 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Settings className="w-3.5 h-3.5 text-rose-500" />
                        <span>Matikan Mod Admin (Log Keluar)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Quick Admin Mode Toggle Button (Gear Icon) */}
            <button
              onClick={handleToggleAdminMode}
              title={isAdminMode ? (currentAdmin?.name ? `Matikan Admin Mode (${currentAdmin.email || currentAdmin.name})` : 'Matikan Admin Mode') : 'Aktifkan Admin Mode (Google Auth / Emel MARA / Master PIN)'}
              aria-label={isAdminMode ? 'Matikan Admin Mode' : 'Aktifkan Admin Mode'}
              className={`p-2 sm:p-2.5 rounded-xl sm:rounded-2xl transition-all border cursor-pointer flex items-center justify-center shrink-0 ${
                isAdminMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-200'
                  : 'bg-white/80 hover:bg-white text-slate-700 hover:text-indigo-600 border-slate-200/80 shadow-2xs'
              }`}
            >
              <Settings className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 hover:rotate-90 ${isAdminMode ? 'text-white' : 'text-slate-600 hover:text-indigo-600'}`} />
            </button>

            {/* Single Consolidated Database & CSV Management Settings Button (Hanya muncul semasa Admin Mode Aktif) */}
            {isAdminMode && (
              <button
                onClick={() => setIsSettingsOpen(true)}
                title="Pengurusan Data & Import CSV"
                aria-label="Pengurusan Data & Import CSV"
                className={`relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl transition-all border cursor-pointer flex items-center justify-center shrink-0 ${
                  isSettingsOpen 
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white border-transparent shadow-md shadow-indigo-200' 
                    : 'bg-white/80 text-slate-700 hover:text-indigo-600 border-slate-200/80 hover:bg-white shadow-2xs'
                }`}
              >
                <FileSpreadsheet className={`w-4 h-4 sm:w-5 sm:h-5 ${isSettingsOpen ? 'text-white' : 'text-indigo-600'}`} />
              </button>
            )}

            {/* Dynamic Navigation Architecture Manager Button (Hanya muncul semasa Admin Mode Aktif) */}
            {isAdminMode && (
              <button
                onClick={() => setIsNavManagerOpen(true)}
                title="Pengurusan Navigasi Dinamik (SES v4.4)"
                aria-label="Pengurusan Navigasi Dinamik"
                className={`relative p-2 sm:p-2.5 rounded-xl sm:rounded-2xl transition-all border cursor-pointer flex items-center justify-center shrink-0 ${
                  isNavManagerOpen 
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-700 text-white border-transparent shadow-md shadow-indigo-200' 
                    : 'bg-white/80 text-slate-700 hover:text-indigo-600 border-slate-200/80 hover:bg-white shadow-2xs'
                }`}
              >
                <Layers className={`w-4 h-4 sm:w-5 sm:h-5 ${isNavManagerOpen ? 'text-white' : 'text-indigo-600'}`} />
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Dynamic Navigation Architecture (SES v4.4 Specification) */}
      <DynamicNavigationBar
        items={navigationItems}
        activeHub={activeHub}
        onSelectDestination={handleSelectDestination}
        isAdminMode={isAdminMode}
        onOpenNavManager={() => setIsNavManagerOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 relative z-10">
        {activeNavItem && (activeNavItem.displayType === 'drive' || Boolean(activeNavItem.driveUrl)) ? (
          <DriveContentViewer
            item={activeNavItem}
            isAdminMode={isAdminMode}
            onUpdateConfig={async (newUrl, newTitle) => {
              const updated = navigationItems.map((n) =>
                n.id === activeNavItem.id
                  ? {
                      ...n,
                      driveUrl: newUrl,
                      displayTitle: newTitle || n.name,
                      updatedAt: new Date().toISOString(),
                    }
                  : n
              );
              setNavigationItems(updated);
              await saveNavigationItems(updated);
            }}
          />
        ) : resolvedDestination === 'directory' ? (
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
                    placeholder="Cari nama, no. plat, gred, jabatan..."
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
                {(['Semua', 'Pengurusan', 'Akademik', 'Sokongan Akademik', 'Pentadbiran'] as DivisionType[])
                  .filter((div) => {
                    if (div === 'Semua') return true;
                    // Sembunyikan kategori sekiranya tiada staf (bilangan 0 seperti Sokongan Akademik)
                    const count = staffList.filter((s) => s.Bahagian === div).length;
                    return count > 0;
                  })
                  .map((div) => {
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
        ) : resolvedDestination === 'jadual' ? (
          <StudentTimetableHub />
        ) : resolvedDestination === 'jadual-pensyarah' ? (
          <LecturerTimetableHub
            staffList={staffList}
            onSelectProfile={(staff) => {
              setSelectedStaff(staff);
            }}
          />
        ) : resolvedDestination === 'rujukan' ? (
          <div className="glass-panel rounded-3xl p-6 md:p-8 border border-white/55 shadow-sm">
            <CampusReferenceHub 
              isAdminMode={isAdminMode}
              onNavigateToTimetables={() => {
                handleSelectDestination('jadual');
              }}
            />
          </div>
        ) : resolvedDestination === 'daftar' ? (
          <SelfRegistrationPage
            existingStaffList={staffList}
            onRegisterStaff={handleRegisterStaff}
            onNavigateHome={handleGoHome}
            onViewStaffProfile={(staff) => {
              handleGoHome();
              setSelectedStaff(staff);
            }}
          />
        ) : (
          <div className="glass-panel rounded-3xl p-10 text-center space-y-4 max-w-lg mx-auto my-12">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800">Destinasi: {resolvedDestination}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Navigasi ini disambungkan ke laluan modul <strong>"{resolvedDestination}"</strong>. Sila pastikan modul atau pautan telah dikonfigurasikan dengan betul.
            </p>
            <button
              type="button"
              onClick={() => handleSelectDestination('directory')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95"
            >
              Kembali ke Directory Staff
            </button>
          </div>
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

          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-center pt-2">
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
        existingStaffList={staffList}
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
        onOpenNavigationManager={() => setIsNavManagerOpen(true)}
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

      {/* Dynamic Navigation Architecture Management Modal (SES v4.4) */}
      <NavigationManagerModal
        isOpen={isNavManagerOpen}
        onClose={() => setIsNavManagerOpen(false)}
        items={navigationItems}
        onItemsChange={setNavigationItems}
      />


    </div>
  );
}

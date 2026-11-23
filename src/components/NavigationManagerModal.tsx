/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — DYNAMIC NAVIGATION MANAGEMENT MODAL
 * SES v4.5 Specification (4-Level Architecture: Alfa → Bravo → Charlie → Delta)
 * 
 * Provides Admin with hierarchical CRUD for:
 * - Level 1: Parent Navigation (Alfa)
 * - Level 2: Child Navigation (Bravo — Direct content or Container)
 * - Level 3: Grandchild Navigation (Charlie — Direct content or Container)
 * - Level 4: Delta Navigation (Delta — Documents, Forms & Links inside Charlie Containers)
 * Safe deletion barriers, destination route validation,
 * visual icon pickers, clean slug editing, and reordering capabilities.
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers,
  X,
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Check,
  AlertCircle,
  RotateCcw,
  Eye,
  EyeOff,
  FolderTree,
  ShieldAlert,
  Loader2,
  FileText,
  CornerDownRight,
  Layout,
  Sparkles,
  CheckCircle2,
  Image as ImageIcon
} from 'lucide-react';
import { NavigationItem, NavigationType, NavigationDisplayType } from '../types';
import {
  KNOWN_MODULE_DESTINATIONS,
  AVAILABLE_NAV_ICONS,
  renderNavIcon,
  validateNavigationDestination,
  validateDriveUrl,
  canDeleteParent,
  canDeleteChild,
  canDeleteGrandchild,
  generateNavId,
  saveNavigationItems,
  resetNavigationToDefault,
  slugify,
  validateNavigationSlug,
  getHierarchicalSlug,
  getHierarchicalPath
} from '../services/navigationService';
import { parseTakwimLink } from '../services/takwimService';
import {
  generateThumbnailForItem,
  generateBulkThumbnails,
  isEligibleDrivePdf,
  extractGoogleDriveFileId,
  applyValidatedThumbnailOutcome
} from '../services/pdfThumbnailService';

export interface NavigationManagerContext {
  mode: 'contextual-charlie' | 'contextual-delta';
  bravoParentId?: string;
  charlieParentId?: string;
  autoOpenAdd?: boolean;
}

interface NavigationManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: NavigationItem[];
  onItemsChange?: (items: NavigationItem[]) => void;
  initialContext?: NavigationManagerContext | null;
}

interface FormState {
  id?: string;
  name: string;
  slug: string;
  isSlugCustomized: boolean;
  icon: string;
  type: NavigationType;
  parentId: string; // for child: parent id; for grandchild: child container id
  parentFilterId?: string; // helper for grandchild parent selection
  displayType: NavigationDisplayType;
  driveUrl: string;
  displayTitle: string;
  destination: string;
  customDestination: string;
  useCustomDestination: boolean;
  isActive: boolean;
}

export const NavigationManagerModal: React.FC<NavigationManagerModalProps> = ({
  isOpen,
  onClose,
  items,
  onItemsChange,
  initialContext = null,
}) => {
  const [activeTab, setActiveTab] = useState<'parents' | 'children' | 'grandchildren' | 'deltas'>('parents');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const prevIsOpenRef = useRef(false);
  const latestItemsRef = useRef<NavigationItem[]>(items);

  useEffect(() => {
    latestItemsRef.current = items;
  }, [items]);

  // Edit/Create Sub-modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NavigationItem | null>(null);
  const [formState, setFormState] = useState<FormState>({
    name: '',
    slug: '',
    isSlugCustomized: false,
    icon: 'Layers',
    type: 'parent',
    parentId: '',
    parentFilterId: '',
    displayType: 'module',
    driveUrl: '',
    displayTitle: '',
    destination: 'directory',
    customDestination: '',
    useCustomDestination: false,
    isActive: true,
  });

  // Delete Confirmation state
  const [itemToDelete, setItemToDelete] = useState<NavigationItem | null>(null);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  // Reset confirmation state
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Segregate Parents, Children, Grandchildren, and Deltas
  const parents = useMemo(
    () => items.filter((i) => i.type === 'parent').sort((a, b) => a.order - b.order),
    [items]
  );

  const children = useMemo(
    () => items.filter((i) => i.type === 'child').sort((a, b) => a.order - b.order),
    [items]
  );

  const grandchildren = useMemo(
    () => items.filter((i) => i.type === 'grandchild').sort((a, b) => a.order - b.order),
    [items]
  );

  const deltas = useMemo(
    () => items.filter((i) => i.type === 'delta').sort((a, b) => a.order - b.order),
    [items]
  );

  // Group children by parent
  const childrenByParent = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    parents.forEach((p) => map.set(p.id, []));
    map.set('orphans', []);

    children.forEach((c) => {
      if (c.parentId && map.has(c.parentId)) {
        map.get(c.parentId)!.push(c);
      } else {
        map.get('orphans')!.push(c);
      }
    });

    return map;
  }, [parents, children]);

  // Group grandchildren by child
  const grandchildrenByChild = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    children.forEach((c) => map.set(c.id, []));
    map.set('orphans', []);

    grandchildren.forEach((gc) => {
      if (gc.parentId && map.has(gc.parentId)) {
        map.get(gc.parentId)!.push(gc);
      } else {
        map.get('orphans')!.push(gc);
      }
    });

    return map;
  }, [children, grandchildren]);

  // Group deltas by grandchild (Charlie container)
  const deltasByGrandchild = useMemo(() => {
    const map = new Map<string, NavigationItem[]>();
    grandchildren.forEach((gc) => map.set(gc.id, []));
    map.set('orphans', []);

    deltas.forEach((d) => {
      if (d.parentId && map.has(d.parentId)) {
        map.get(d.parentId)!.push(d);
      } else {
        map.get('orphans')!.push(d);
      }
    });

    return map;
  }, [grandchildren, deltas]);

  // Charlie containers & Charlies that contain Delta items (displayed in Delta tab)
  const charlieContainersForDeltas = useMemo(() => {
    return grandchildren.filter(
      (gc) => gc.displayType === 'empty_page' || (deltasByGrandchild.get(gc.id)?.length || 0) > 0
    );
  }, [grandchildren, deltasByGrandchild]);

  const contextualBravoItem = useMemo(() => {
    if (initialContext?.mode !== 'contextual-charlie' || !initialContext.bravoParentId) return null;
    return children.find((c) => c.id === initialContext.bravoParentId) || null;
  }, [initialContext, children]);

  const contextualAlfaItem = useMemo(() => {
    if (!contextualBravoItem?.parentId) return null;
    return parents.find((p) => p.id === contextualBravoItem.parentId) || null;
  }, [contextualBravoItem, parents]);

  const contextualCharlieItem = useMemo(() => {
    if (initialContext?.mode !== 'contextual-delta' || !initialContext.charlieParentId) return null;
    return grandchildren.find((gc) => gc.id === initialContext.charlieParentId) || null;
  }, [initialContext, grandchildren]);

  const contextualBravoForDelta = useMemo(() => {
    if (!contextualCharlieItem?.parentId) return null;
    return children.find((c) => c.id === contextualCharlieItem.parentId) || null;
  }, [contextualCharlieItem, children]);

  const contextualAlfaForDelta = useMemo(() => {
    if (!contextualBravoForDelta?.parentId) return null;
    return parents.find((p) => p.id === contextualBravoForDelta.parentId) || null;
  }, [contextualBravoForDelta, parents]);

  const isContextualCharlieMode = Boolean(contextualBravoItem);
  const isContextualDeltaMode = Boolean(contextualCharlieItem);
  const isContextualMode = isContextualCharlieMode || isContextualDeltaMode;

  const liveDriveParsed = useMemo(
    () => parseTakwimLink(formState.driveUrl),
    [formState.driveUrl]
  );

  // Automatic PDF Thumbnail Generation States & Counts
  const [generatingThumbnailIds, setGeneratingThumbnailIds] = useState<Set<string>>(new Set());
  const [brokenThumbIds, setBrokenThumbIds] = useState<Set<string>>(new Set());
  const [isBulkGeneratingThumbnails, setIsBulkGeneratingThumbnails] = useState(false);
  const [bulkThumbnailProgress, setBulkThumbnailProgress] = useState<{ completed: number; total: number } | null>(null);

  const mergeThumbnailOutcome = (
    baseList: NavigationItem[],
    targetId: string,
    outcomeItem: NavigationItem,
    baselineGeneratedAt?: string
  ): NavigationItem[] =>
    baseList.map((entry) =>
      entry.id === targetId
        ? applyValidatedThumbnailOutcome(entry, outcomeItem, baselineGeneratedAt)
        : entry
    );

  const eligiblePdfItems = useMemo(() => {
    if (contextualCharlieItem) {
      return (deltasByGrandchild.get(contextualCharlieItem.id) || []).filter(isEligibleDrivePdf);
    }
    if (contextualBravoItem) {
      return (grandchildrenByChild.get(contextualBravoItem.id) || []).filter(isEligibleDrivePdf);
    }
    return items.filter(isEligibleDrivePdf);
  }, [items, contextualBravoItem, contextualCharlieItem, grandchildrenByChild, deltasByGrandchild]);
  const readyThumbnailsCount = useMemo(
    () => eligiblePdfItems.filter((i) => i.thumbnailUrl && (i.thumbnailStatus === 'generated' || i.thumbnailStatus === 'ready')).length,
    [eligiblePdfItems]
  );

  const handleSingleThumbnailGeneration = async (targetItem: NavigationItem) => {
    if (generatingThumbnailIds.has(targetItem.id)) return;
    setGeneratingThumbnailIds((prev) => new Set(prev).add(targetItem.id));
    setBrokenThumbIds((prev) => {
      if (!prev.has(targetItem.id)) return prev;
      const next = new Set(prev);
      next.delete(targetItem.id);
      return next;
    });
    setNotice(null);

    try {
      const baselineGeneratedAt = targetItem.thumbnailGeneratedAt;
      const result = await generateThumbnailForItem(targetItem, true);
      const updated = mergeThumbnailOutcome(
        latestItemsRef.current,
        targetItem.id,
        result.item,
        baselineGeneratedAt
      );
      try {
        await saveNavigationItems(updated);
        latestItemsRef.current = updated;
        onItemsChange?.(updated);
      } catch (saveErr: any) {
        console.warn('[NavigationManagerModal] Non-fatal thumbnail status save notice:', saveErr?.message || saveErr);
      }

      if (result.success) {
        setNotice({
          type: 'success',
          text: `Thumbnail untuk "${targetItem.name}" berjaya dijana dan disimpan ke Firebase Storage.`,
        });
      } else {
        setNotice({
          type: 'warning',
          text: `Thumbnail untuk "${targetItem.name}" gagal dijana (${result.error || 'sumber PDF tidak dapat dicapai'}). Rekod navigasi dan paparan dokumen kekal aktif tanpa halangan.`,
        });
      }
    } catch (err: any) {
      setNotice({
        type: 'warning',
        text: `Penjanaan thumbnail untuk "${targetItem.name}" gagal (${err?.message || 'ralat tidak diketahui'}), namun rekod navigasi kekal boleh digunakan.`,
      });
    } finally {
      setGeneratingThumbnailIds((prev) => {
        const next = new Set(prev);
        next.delete(targetItem.id);
        return next;
      });
    }
  };

  const handleBulkGenerateAllThumbnails = async () => {
    if (isBulkGeneratingThumbnails || eligiblePdfItems.length === 0) return;
    setIsBulkGeneratingThumbnails(true);
    setBulkThumbnailProgress({ completed: 0, total: eligiblePdfItems.length });
    setNotice(null);

    try {
      const result = await generateBulkThumbnails(
        latestItemsRef.current,
        true,
        (p) => {
          setBulkThumbnailProgress({ completed: p.completed, total: p.total });
        },
        () => latestItemsRef.current
      );

      latestItemsRef.current = result.updatedItems;
      onItemsChange?.(result.updatedItems);
      setNotice({
        type: result.failureCount > 0 ? 'warning' : 'success',
        text:
          result.failureCount > 0
            ? `Penjanaan thumbnail pukal selesai (tidak menyekat paparan): ${result.successCount} berjaya, ${result.failureCount} gagal, ${result.skippedCount} dilangkau.`
            : `Penjanaan thumbnail pukal selesai: ${result.successCount} berjaya, ${result.failureCount} gagal, ${result.skippedCount} dilangkau.`,
      });
    } catch (err: any) {
      setNotice({
        type: 'warning',
        text: err?.message || 'Ralat semasa penjanaan thumbnail pukal. Rekod navigasi kekal berfungsi seperti biasa.',
      });
    } finally {
      setIsBulkGeneratingThumbnails(false);
      setBulkThumbnailProgress(null);
    }
  };

  // Available children filtered by parent filter (used in Grandchild Form)
  const childrenForGrandchildForm = useMemo(() => {
    if (!formState.parentFilterId) return children;
    return children.filter((c) => c.parentId === formState.parentFilterId);
  }, [children, formState.parentFilterId]);

  // Available grandchildren filtered by Bravo filter (used in Delta Form)
  const grandchildrenForDeltaForm = useMemo(() => {
    const filtered = !formState.parentFilterId
      ? grandchildren
      : grandchildren.filter((gc) => gc.parentId === formState.parentFilterId);
    // Prioritize Charlie items configured as containers first
    return [...filtered].sort((a, b) => {
      const aIsContainer = a.displayType === 'empty_page' ? 0 : 1;
      const bIsContainer = b.displayType === 'empty_page' ? 0 : 1;
      if (aIsContainer !== bIsContainer) return aIsContainer - bIsContainer;
      return a.order - b.order;
    });
  }, [grandchildren, formState.parentFilterId]);

  // Open Form for Adding New Item
  const handleAddNew = (type: NavigationType, defaultParentId?: string) => {
    setEditingItem(null);
    let initialParentId = defaultParentId || '';
    let initialParentFilterId = '';

    if (type === 'child') {
      initialParentId = defaultParentId || (parents[0]?.id || '');
    } else if (type === 'grandchild') {
      if (defaultParentId) {
        initialParentId = defaultParentId;
        const matchingChild = children.find((c) => c.id === defaultParentId);
        initialParentFilterId = matchingChild?.parentId || parents[0]?.id || '';
      } else {
        const firstChild = children[0];
        initialParentId = firstChild?.id || '';
        initialParentFilterId = firstChild?.parentId || parents[0]?.id || '';
      }
    } else if (type === 'delta') {
      if (defaultParentId) {
        initialParentId = defaultParentId;
        const matchingGc = grandchildren.find((gc) => gc.id === defaultParentId);
        initialParentFilterId = matchingGc?.parentId || children[0]?.id || '';
      } else {
        const defaultGc =
          charlieContainersForDeltas[0] || grandchildren[0];
        initialParentId = defaultGc?.id || '';
        initialParentFilterId = defaultGc?.parentId || children[0]?.id || '';
      }
    }

    setFormState({
      name: '',
      slug: '',
      isSlugCustomized: false,
      icon:
        type === 'parent'
          ? 'Layers'
          : type === 'grandchild' || type === 'delta'
          ? 'FileText'
          : 'Folder',
      type,
      parentId: initialParentId,
      parentFilterId: initialParentFilterId,
      displayType: type === 'grandchild' || type === 'delta' ? 'drive' : 'module',
      driveUrl: '',
      displayTitle: '',
      destination: 'directory',
      customDestination: '',
      useCustomDestination: false,
      isActive: true,
    });
    setNotice(null);
    setIsEditorOpen(true);
  };

  // Initialize modal context only on open transition (never reset on live Firestore updates while open)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setNotice(null);
      setItemToDelete(null);
      setShowResetConfirm(false);

      if (contextualCharlieItem) {
        setActiveTab('deltas');
        if (initialContext?.autoOpenAdd) {
          handleAddNew('delta', contextualCharlieItem.id);
        } else {
          setIsEditorOpen(false);
        }
      } else if (contextualBravoItem) {
        setActiveTab('grandchildren');
        if (initialContext?.autoOpenAdd) {
          handleAddNew('grandchild', contextualBravoItem.id);
        } else {
          setIsEditorOpen(false);
        }
      } else {
        setActiveTab('parents');
        setIsEditorOpen(false);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, contextualBravoItem, contextualCharlieItem, initialContext]);

  // Open Form for Editing Existing Item
  const handleEdit = (item: NavigationItem) => {
    setEditingItem(item);
    const isParentEmptyPage = item.type === 'parent' && item.displayType === 'empty_page';
    const normalizedDest = item.destination === 'deadline-hub' ? 'deadline' : item.destination;
    const isStandardModule = KNOWN_MODULE_DESTINATIONS.some((m) => m.id === normalizedDest);
    const itemDisplayType: NavigationDisplayType = item.displayType || (item.driveUrl ? 'drive' : 'module');

    let initialParentFilterId = '';
    if (item.type === 'grandchild') {
      const immediateChild = children.find((c) => c.id === item.parentId);
      initialParentFilterId = immediateChild?.parentId || parents[0]?.id || '';
    } else if (item.type === 'delta') {
      const immediateGc = grandchildren.find((gc) => gc.id === item.parentId);
      initialParentFilterId = immediateGc?.parentId || children[0]?.id || '';
    }

    setFormState({
      id: item.id,
      name: item.name,
      slug: item.slug || slugify(item.name),
      isSlugCustomized: true,
      icon: item.icon,
      type: item.type,
      parentId: item.parentId || '',
      parentFilterId: initialParentFilterId,
      displayType: itemDisplayType,
      driveUrl: item.driveUrl || '',
      displayTitle: item.displayTitle || '',
      destination: isParentEmptyPage ? 'empty_page' : isStandardModule ? normalizedDest : 'custom',
      customDestination: isParentEmptyPage || isStandardModule ? '' : item.destination,
      useCustomDestination: !isParentEmptyPage && !isStandardModule && itemDisplayType !== 'drive' && itemDisplayType !== 'empty_page',
      isActive: item.isActive,
    });
    setNotice(null);
    setIsEditorOpen(true);
  };

  // Save changes from Form (Add or Edit)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formState.name.trim()) {
      setNotice({ type: 'error', text: 'Sila masukkan nama paparan navigasi.' });
      return;
    }

    if (formState.type === 'child' && !formState.parentId) {
      setNotice({ type: 'error', text: 'Navigasi bravo wajib dikaitkan dengan satu Navigasi Alfa.' });
      return;
    }

    if (formState.type === 'grandchild' && !formState.parentId) {
      setNotice({ type: 'error', text: 'Navigasi charlie wajib dikaitkan dengan satu Navigasi Bravo (Bekas / Container).' });
      return;
    }

    if (formState.type === 'delta' && !formState.parentId) {
      setNotice({ type: 'error', text: 'Navigasi delta wajib dikaitkan dengan satu Navigasi Charlie.' });
      return;
    }

    // Validate Slug (SES v4.5 Clean Hierarchical URL Architecture)
    const targetSlug = (formState.slug.trim() || slugify(formState.name)).toLowerCase();
    const slugCheck = validateNavigationSlug(targetSlug, editingItem?.id, items, formState.parentId, formState.type);
    if (!slugCheck.valid) {
      setNotice({ type: 'error', text: slugCheck.error || 'URL Slug tidak sah.' });
      return;
    }

    const isDriveDisplay =
      (formState.type === 'child' || formState.type === 'grandchild' || formState.type === 'delta') &&
      formState.displayType === 'drive';
    const isParentEmptyPage = formState.type === 'parent' && !formState.useCustomDestination && formState.destination === 'empty_page';
    const isEmptyPageDisplay =
      isParentEmptyPage ||
      ((formState.type === 'child' || formState.type === 'grandchild') && formState.displayType === 'empty_page');

    let finalDest = '';
    if (isDriveDisplay) {
      const driveCheck = validateDriveUrl(formState.driveUrl);
      if (!driveCheck.valid) {
        setNotice({
          type: 'error',
          text: driveCheck.error || 'Pautan Google Drive tidak sah. Sila masukkan pautan fail PDF atau folder yang betul.',
        });
        return;
      }
      finalDest = editingItem?.id || generateNavId(formState.name, formState.type);
    } else if (isEmptyPageDisplay) {
      // Empty page container uses its own unique ID as destination
      finalDest = editingItem?.id || generateNavId(formState.name, formState.type);
    } else {
      finalDest = formState.useCustomDestination
        ? formState.customDestination.trim()
        : formState.destination.trim();

      const validCheck = validateNavigationDestination(finalDest, formState.displayType);
      if (!validCheck.valid) {
        setNotice({ type: 'error', text: validCheck.error || 'Destinasi tidak sah.' });
        return;
      }
    }

    try {
      setIsSaving(true);
      setNotice(null);

      let updatedList: NavigationItem[];
      const trimmedDriveUrl = isDriveDisplay ? formState.driveUrl.trim() : '';
      const driveFileId = isDriveDisplay ? extractGoogleDriveFileId(trimmedDriveUrl) : null;
      const parsedDriveLink = isDriveDisplay ? parseTakwimLink(trimmedDriveUrl) : null;
      const isDrivePdfCandidate = Boolean(
        isDriveDisplay &&
          driveFileId &&
          parsedDriveLink &&
          parsedDriveLink.kind !== 'drive-folder'
      );
      let shouldGenerateBackgroundThumb = false;
      let targetSavedId = editingItem?.id || '';

      if (editingItem) {
        // Update existing item (never block parent record update on thumbnail generation)
        updatedList = items.map((item) => {
          if (item.id === editingItem.id) {
            const isSameDriveUrl = (item.driveUrl || '').trim() === trimmedDriveUrl;
            const hasValidExistingThumb =
              isSameDriveUrl &&
              Boolean(item.thumbnailUrl) &&
              (item.thumbnailStatus === 'generated' || item.thumbnailStatus === 'ready') &&
              item.thumbnailFileId === driveFileId;

            if (isDrivePdfCandidate && !hasValidExistingThumb) {
              shouldGenerateBackgroundThumb = true;
            }

            return {
              ...item,
              name: formState.name.trim(),
              slug: targetSlug,
              icon: formState.icon,
              type: formState.type,
              parentId: formState.type === 'parent' ? undefined : formState.parentId,
              destination: finalDest,
              displayType: formState.type === 'parent' ? (isParentEmptyPage ? 'empty_page' : undefined) : formState.displayType,
              driveUrl: isDriveDisplay ? trimmedDriveUrl : undefined,
              displayTitle: isDriveDisplay ? (formState.displayTitle.trim() || formState.name.trim()) : undefined,
              isActive: formState.isActive,
              thumbnailUrl: !isDriveDisplay
                ? undefined
                : hasValidExistingThumb
                ? item.thumbnailUrl
                : undefined,
              thumbnailStatus: !isDriveDisplay
                ? 'idle'
                : hasValidExistingThumb
                ? item.thumbnailStatus
                : isDrivePdfCandidate
                ? 'generating'
                : 'idle',
              thumbnailFileId: isDriveDisplay ? driveFileId || undefined : undefined,
              thumbnailGeneratedAt: !isDriveDisplay
                ? undefined
                : hasValidExistingThumb
                ? item.thumbnailGeneratedAt
                : undefined,
              thumbnailError: undefined,
              updatedAt: new Date().toISOString(),
            };
          }
          return item;
        });
      } else {
        // Create new item
        const newId = (isDriveDisplay || isEmptyPageDisplay) && finalDest ? finalDest : generateNavId(formState.name, formState.type);
        targetSavedId = newId;
        const siblings = formState.type === 'parent'
          ? parents
          : formState.type === 'child'
          ? children.filter((c) => c.parentId === formState.parentId)
          : formState.type === 'grandchild'
          ? grandchildren.filter((gc) => gc.parentId === formState.parentId)
          : deltas.filter((d) => d.parentId === formState.parentId);
        const nextOrder = siblings.length;

        if (isDrivePdfCandidate) {
          shouldGenerateBackgroundThumb = true;
        }

        const newItem: NavigationItem = {
          id: newId,
          name: formState.name.trim(),
          slug: targetSlug,
          icon: formState.icon,
          type: formState.type,
          parentId: formState.type === 'parent' ? undefined : formState.parentId,
          destination: (isDriveDisplay || isEmptyPageDisplay) ? newId : finalDest,
          displayType: formState.type === 'parent' ? (isParentEmptyPage ? 'empty_page' : undefined) : formState.displayType,
          driveUrl: isDriveDisplay ? trimmedDriveUrl : undefined,
          displayTitle: isDriveDisplay ? (formState.displayTitle.trim() || formState.name.trim()) : undefined,
          order: nextOrder,
          isActive: formState.isActive,
          thumbnailUrl: undefined,
          thumbnailStatus: isDrivePdfCandidate ? 'generating' : 'idle',
          thumbnailFileId: driveFileId || undefined,
          thumbnailGeneratedAt: undefined,
          thumbnailError: undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        updatedList = [...items, newItem];
      }

      await saveNavigationItems(updatedList);
      latestItemsRef.current = updatedList;
      onItemsChange?.(updatedList);
      setIsEditorOpen(false);
      setNotice({
        type: 'success',
        text: `Navigasi "${formState.name}" berjaya disimpan ke Firestore.`
      });

      // Automatically generate thumbnail in background as a strictly non-fatal enrichment step
      if (shouldGenerateBackgroundThumb && targetSavedId) {
        const savedItem = updatedList.find((i) => i.id === targetSavedId);
        if (savedItem && isEligibleDrivePdf(savedItem)) {
          const baselineGeneratedAt = savedItem.thumbnailGeneratedAt;
          generateThumbnailForItem(savedItem, true)
            .then(async (thumbResult) => {
              const withOutcomeList = mergeThumbnailOutcome(
                latestItemsRef.current,
                savedItem.id,
                thumbResult.item,
                baselineGeneratedAt
              );
              try {
                await saveNavigationItems(withOutcomeList);
                latestItemsRef.current = withOutcomeList;
                onItemsChange?.(withOutcomeList);
              } catch (saveThumbErr: any) {
                console.warn(
                  '[NavigationManagerModal] Non-fatal thumbnail status save notice:',
                  saveThumbErr?.message || saveThumbErr
                );
              }
            })
            .catch((thumbErr) => {
              console.warn('[NavigationManagerModal] Non-fatal auto-thumbnail notice:', thumbErr?.message || thumbErr);
            });
        }
      }
    } catch (err: any) {
      setNotice({
        type: 'error',
        text: err?.message || 'Gagal menyimpan konfigurasi navigasi ke Firestore.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Reorder Item (Move Up or Down)
  const handleMoveOrder = async (item: NavigationItem, direction: 'up' | 'down') => {
    try {
      setIsSaving(true);
      setNotice(null);

      let group: NavigationItem[];
      if (item.type === 'parent') {
        group = [...parents];
      } else if (item.type === 'child') {
        group = children.filter((c) => c.parentId === item.parentId);
      } else if (item.type === 'grandchild') {
        group = grandchildren.filter((gc) => gc.parentId === item.parentId);
      } else {
        group = deltas.filter((d) => d.parentId === item.parentId);
      }

      const currentIndex = group.findIndex((i) => i.id === item.id);
      if (currentIndex === -1) return;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= group.length) return;

      // Swap
      const temp = group[currentIndex];
      group[currentIndex] = group[targetIndex];
      group[targetIndex] = temp;

      // Re-assign order index
      group.forEach((itm, idx) => {
        itm.order = idx;
      });

      // Merge back to full list
      const groupIds = new Set(group.map((g) => g.id));
      const rest = items.filter((i) => !groupIds.has(i.id));
      const merged = [...rest, ...group];

      await saveNavigationItems(merged);
      onItemsChange?.(merged);
      setNotice({ type: 'success', text: `Susunan navigasi "${item.name}" berjaya diubah.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal mengubah susunan navigasi.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Active State
  const handleToggleActive = async (item: NavigationItem) => {
    try {
      setIsSaving(true);
      const updated = items.map((i) => {
        if (i.id === item.id) {
          return { ...i, isActive: !i.isActive, updatedAt: new Date().toISOString() };
        }
        return i;
      });
      await saveNavigationItems(updated);
      onItemsChange?.(updated);
      setNotice({
        type: 'success',
        text: `Status "${item.name}" ditukar kepada ${!item.isActive ? 'Aktif' : 'Tidak Aktif'}.`
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal mengemas kini status navigasi.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Safe Deletion Trigger (SES v4.5 Section 6B & 6C + 4-Level Guards)
  const handleDeletePrompt = (item: NavigationItem) => {
    setDeleteWarning(null);

    if (item.type === 'parent') {
      const check = canDeleteParent(item.id, items);
      if (!check.canDelete) {
        setDeleteWarning(
          `Navigasi Alfa ini mempunyai ${check.childrenCount} navigasi bravo (${check.childrenNames.join(', ')}). Sila padam atau pindahkan navigasi bravo tersebut terlebih dahulu sebelum memadam navigasi alfa ini.`
        );
      }
    } else if (item.type === 'child') {
      const checkChild = canDeleteChild(item.id, items);
      if (!checkChild.canDelete) {
        setDeleteWarning(
          `Navigasi Bravo ini mengandungi ${checkChild.grandchildrenCount} navigasi charlie (${checkChild.grandchildrenNames.join(', ')}). Sila padam atau pindahkan navigasi charlie terlebih dahulu sebelum memadam navigasi bravo ini.`
        );
      }
    } else if (item.type === 'grandchild') {
      const checkGrandchild = canDeleteGrandchild(item.id, items);
      if (!checkGrandchild.canDelete) {
        setDeleteWarning(
          `Navigasi Charlie ini mengandungi ${checkGrandchild.deltasCount} navigasi delta (${checkGrandchild.deltasNames.join(', ')}). Sila padam atau pindahkan navigasi delta terlebih dahulu sebelum memadam navigasi charlie ini.`
        );
      }
    }

    setItemToDelete(item);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;

    if (itemToDelete.type === 'parent') {
      const check = canDeleteParent(itemToDelete.id, items);
      if (!check.canDelete) {
        setNotice({
          type: 'error',
          text: 'Pemadaman disekat kerana masih terdapat navigasi bravo di bawah alfa ini.'
        });
        setItemToDelete(null);
        return;
      }
    } else if (itemToDelete.type === 'child') {
      const checkChild = canDeleteChild(itemToDelete.id, items);
      if (!checkChild.canDelete) {
        setNotice({
          type: 'error',
          text: 'Pemadaman disekat kerana masih terdapat navigasi charlie di bawah bravo ini.'
        });
        setItemToDelete(null);
        return;
      }
    } else if (itemToDelete.type === 'grandchild') {
      const checkGrandchild = canDeleteGrandchild(itemToDelete.id, items);
      if (!checkGrandchild.canDelete) {
        setNotice({
          type: 'error',
          text: 'Pemadaman disekat kerana masih terdapat navigasi delta di bawah charlie ini.'
        });
        setItemToDelete(null);
        return;
      }
    }

    try {
      setIsSaving(true);
      const filtered = items.filter((i) => i.id !== itemToDelete.id);
      await saveNavigationItems(filtered);
      onItemsChange?.(filtered);
      setNotice({
        type: 'success',
        text: `Navigasi "${itemToDelete.name}" telah berjaya dipadamkan.`
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal memadam navigasi.' });
    } finally {
      setItemToDelete(null);
      setIsSaving(false);
    }
  };

  // Reset to Default Navigation
  const handleResetDefaults = async () => {
    try {
      setIsSaving(true);
      await resetNavigationToDefault();
      setShowResetConfirm(false);
      setNotice({
        type: 'success',
        text: 'Struktur navigasi telah berjaya dikembalikan kepada tetapan lalai rasmi.'
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Gagal menetapkan semula navigasi.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-4xl bg-white rounded-3xl p-5 sm:p-7 shadow-2xl border border-slate-100 my-6 text-left max-h-[92vh] flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-600 via-violet-600 to-indigo-800 text-white rounded-2xl shadow-md shadow-indigo-200">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-sans font-extrabold text-slate-900 text-base sm:text-lg leading-tight flex items-center gap-2 flex-wrap">
                  <span>
                    {isContextualDeltaMode && contextualCharlieItem
                      ? `Urus Delta — ${contextualCharlieItem.name}`
                      : isContextualCharlieMode && contextualBravoItem
                      ? `Urus Charlie — ${contextualBravoItem.name}`
                      : 'Pengurusan Navigasi Dinamik'}
                  </span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {isContextualDeltaMode
                      ? 'SES v4.5 • Mod Konteks Delta'
                      : isContextualCharlieMode
                      ? 'SES v4.5 • Mod Konteks Charlie'
                      : 'SES v4.5 (4 Peringkat)'}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  {isContextualDeltaMode && contextualCharlieItem
                    ? `Delta di bawah: ${contextualCharlieItem.name}${
                        contextualBravoForDelta ? ` (${contextualBravoForDelta.name}${contextualAlfaForDelta ? ` • ${contextualAlfaForDelta.name}` : ''})` : ''
                      }`
                    : isContextualCharlieMode && contextualBravoItem
                    ? `Charlie di bawah: ${contextualBravoItem.name}${contextualAlfaItem ? ` (${contextualAlfaItem.name})` : ''}`
                    : 'Urus hierarki Alfa → Bravo → Charlie → Delta secara dinamik dengan storan masa nyata Firestore'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-all cursor-pointer shrink-0"
              title="Tutup Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Feedback Notice */}
          {notice && (
            <div
              className={`mt-3 p-3 rounded-2xl text-xs font-bold flex items-center justify-between gap-2 shrink-0 ${
                notice.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : notice.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {notice.type === 'success' ? (
                  <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                ) : notice.type === 'warning' ? (
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                )}
                <span>{notice.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setNotice(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Automatic PDF Thumbnail Engine Bar */}
          {eligiblePdfItems.length > 0 && (
            <div className="mt-3 p-3 bg-gradient-to-r from-violet-50 via-indigo-50 to-amber-50/50 rounded-2xl border border-violet-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-800">
                      Enjin Thumbnail PDF Google Drive
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {readyThumbnailsCount} / {eligiblePdfItems.length} Sedia
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Jana imej lakaran muka surat 1 dokumen secara automatik dan simpan ke Firebase Storage.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBulkGenerateAllThumbnails}
                disabled={isBulkGeneratingThumbnails}
                className="px-3.5 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50 shrink-0 self-start sm:self-auto"
              >
                {isBulkGeneratingThumbnails ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      Memproses... ({bulkThumbnailProgress?.completed}/{bulkThumbnailProgress?.total})
                    </span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Jana Semua ({eligiblePdfItems.length} Dokumen)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Contextual Delta / Charlie Header Bar OR Full Hierarchical Stepped Tree Tabs */}
          {isContextualDeltaMode && contextualCharlieItem ? (
            <div
              data-contextual-delta-parent={contextualCharlieItem.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 border-b border-teal-100 pb-3.5 shrink-0 bg-teal-50/60 px-3.5 py-3 rounded-2xl border"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  {renderNavIcon(contextualCharlieItem.icon, 'w-4 h-4')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      Delta di bawah: <span className="text-teal-700">{contextualCharlieItem.name}</span>
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-teal-700 border border-teal-200 shrink-0">
                      {(deltasByGrandchild.get(contextualCharlieItem.id) || []).length} Delta
                    </span>
                  </div>
                  {contextualBravoForDelta && (
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      Induk: <span className="font-bold text-slate-700">
                        {contextualAlfaForDelta ? `${contextualAlfaForDelta.name} → ` : ''}{contextualBravoForDelta.name}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAddNew('delta', contextualCharlieItem.id)}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Delta</span>
              </button>
            </div>
          ) : isContextualCharlieMode && contextualBravoItem ? (
            <div
              data-contextual-charlie-parent={contextualBravoItem.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 border-b border-violet-100 pb-3.5 shrink-0 bg-violet-50/60 px-3.5 py-3 rounded-2xl border"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  {renderNavIcon(contextualBravoItem.icon, 'w-4 h-4')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-black text-slate-900 truncate">
                      Charlie di bawah: <span className="text-violet-700">{contextualBravoItem.name}</span>
                    </span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-violet-700 border border-violet-200 shrink-0">
                      {(grandchildrenByChild.get(contextualBravoItem.id) || []).length} Charlie
                    </span>
                  </div>
                  {contextualAlfaItem && (
                    <p className="text-[11px] text-slate-500 font-medium truncate">
                      Induk Alfa: <span className="font-bold text-slate-700">{contextualAlfaItem.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleAddNew('grandchild', contextualBravoItem.id)}
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Charlie</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mt-4 border-b border-slate-100 pb-3.5 shrink-0">
              <div
                role="tablist"
                aria-label="Tahap Hierarki Navigasi"
                className="flex flex-col gap-1.5 min-w-0 flex-1"
              >
                {/* Level 1: Alfa — Primary Root Alignment */}
                <div className="flex items-center min-w-0">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'parents'}
                    data-nav-level="alfa"
                    onClick={() => setActiveTab('parents')}
                    className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 max-w-full ${
                      activeTab === 'parents'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">Navigasi Utama ({parents.length})</span>
                  </button>
                </div>

                {/* Level 2: Bravo — Indented Right Relative to Alfa */}
                <div className="flex items-center pl-4 sm:pl-7 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center justify-center shrink-0 transition-colors ${
                        activeTab === 'children' ? 'text-indigo-500' : 'text-slate-300'
                      }`}
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </span>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'children'}
                      data-nav-level="bravo"
                      onClick={() => setActiveTab('children')}
                      className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 max-w-full ${
                        activeTab === 'children'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FolderTree className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Navigasi Bravo ({children.length})</span>
                    </button>
                  </div>
                </div>

                {/* Level 3: Charlie — Indented Further Right Relative to Bravo */}
                <div className="flex items-center pl-8 sm:pl-14 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center justify-center shrink-0 transition-colors ${
                        activeTab === 'grandchildren' ? 'text-violet-500' : 'text-slate-300'
                      }`}
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </span>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'grandchildren'}
                      data-nav-level="charlie"
                      onClick={() => setActiveTab('grandchildren')}
                      className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 max-w-full ${
                        activeTab === 'grandchildren'
                          ? 'bg-violet-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Navigasi Charlie ({grandchildren.length})</span>
                    </button>
                  </div>
                </div>

                {/* Level 4: Delta — Indented Further Right Relative to Charlie */}
                <div className="flex items-center pl-12 sm:pl-20 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      aria-hidden="true"
                      className={`inline-flex items-center justify-center shrink-0 transition-colors ${
                        activeTab === 'deltas' ? 'text-teal-500' : 'text-slate-300'
                      }`}
                    >
                      <CornerDownRight className="w-3.5 h-3.5" />
                    </span>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === 'deltas'}
                      data-nav-level="delta"
                      onClick={() => setActiveTab('deltas')}
                      className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 max-w-full ${
                        activeTab === 'deltas'
                          ? 'bg-teal-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Navigasi Delta ({deltas.length})</span>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleAddNew(
                    activeTab === 'parents'
                      ? 'parent'
                      : activeTab === 'children'
                      ? 'child'
                      : activeTab === 'grandchildren'
                      ? 'grandchild'
                      : 'delta'
                  )
                }
                className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-extrabold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shrink-0 self-start sm:self-end"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {activeTab === 'parents'
                    ? 'Tambah Alfa'
                    : activeTab === 'children'
                    ? 'Tambah Bravo'
                    : activeTab === 'grandchildren'
                    ? 'Tambah Charlie'
                    : 'Tambah Delta'}
                </span>
              </button>
            </div>
          )}

          {/* Main Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
            {/* SECTION A: PARENT NAVIGATION LIST */}
            {!isContextualMode && activeTab === 'parents' && (
              <div className="space-y-2.5">
                {parents.map((p, idx) => {
                  const childCount = (childrenByParent.get(p.id) || []).length;
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        p.isActive
                          ? 'bg-white border-slate-200/80 shadow-2xs hover:border-indigo-200'
                          : 'bg-slate-50/80 border-slate-200/50 opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(p, 'up')}
                            disabled={idx === 0 || isSaving}
                            title="Pindah ke atas"
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveOrder(p, 'down')}
                            disabled={idx === parents.length - 1 || isSaving}
                            title="Pindah ke bawah"
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-700 shrink-0">
                          {renderNavIcon(p.icon, 'w-4 h-4')}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-sans font-extrabold text-slate-900 text-sm">
                              {p.name}
                            </h4>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                              #{p.order + 1}
                            </span>
                            {childCount > 0 ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                {childCount} Sub-Menu
                              </span>
                            ) : p.displayType === 'empty_page' ? (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                Container Kosong
                              </span>
                            ) : (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Akses Terus
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Destinasi: <span className="font-semibold text-slate-700">{p.destination}</span></span>
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                              /{p.slug || slugify(p.name)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          disabled={isSaving}
                          title={p.isActive ? 'Nyahaktifkan navigasi' : 'Aktifkan navigasi'}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                            p.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {p.isActive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          <span>{p.isActive ? 'Aktif' : 'Tutup'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(p)}
                          disabled={isSaving}
                          title="Sunting navigasi ini"
                          className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-xl transition-all cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePrompt(p)}
                          disabled={isSaving}
                          title="Padam navigasi ini"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {parents.length === 0 && (
                  <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl p-6">
                    <Layers className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">Tiada Navigasi Utama dikonfigurasikan.</p>
                    <button
                      type="button"
                      onClick={() => handleAddNew('parent')}
                      className="mt-3 px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold"
                    >
                      Tambah Navigasi Pertama
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* SECTION B: CHILD NAVIGATION LIST (Grouped by Parent) */}
            {!isContextualMode && activeTab === 'children' && (
              <div className="space-y-5">
                {parents.map((p) => {
                  const pChildren = (childrenByParent.get(p.id) || []).sort((a, b) => a.order - b.order);
                  return (
                    <div
                      key={p.id}
                      className="p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            {renderNavIcon(p.icon, 'w-3 h-3')}
                          </div>
                          <span className="text-xs font-extrabold text-slate-900">
                            Di bawah Alfa: <span className="text-indigo-600">{p.name}</span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                            {pChildren.length} Bravo
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddNew('child', p.id)}
                          className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Tambah Bravo</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {pChildren.map((c, cIdx) => {
                          const gcs = grandchildrenByChild.get(c.id) || [];
                          return (
                            <div
                              key={c.id}
                              className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                c.isActive ? 'border-slate-200 shadow-2xs' : 'border-slate-200/50 opacity-60'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(c, 'up')}
                                    disabled={cIdx === 0 || isSaving}
                                    title="Pindah ke atas"
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveOrder(c, 'down')}
                                    disabled={cIdx === pChildren.length - 1 || isSaving}
                                    title="Pindah ke bawah"
                                    className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                </div>

                                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center shrink-0">
                                  {renderNavIcon(c.icon, 'w-3.5 h-3.5')}
                                </div>

                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="font-sans font-extrabold text-slate-900 text-xs">
                                      {c.name}
                                    </h5>
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                      #{c.order + 1}
                                    </span>
                                    {c.displayType === 'empty_page' ? (
                                      <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                        <Layout className="w-2.5 h-2.5" />
                                        <span>Pages Kosong ({gcs.length} Charlie)</span>
                                      </span>
                                    ) : gcs.length > 0 ? (
                                      <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1">
                                        <FolderTree className="w-2.5 h-2.5" />
                                        <span>Bekas ({gcs.length} Charlie)</span>
                                      </span>
                                    ) : c.displayType === 'drive' || c.driveUrl ? (
                                      <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1">
                                        <FileText className="w-2.5 h-2.5" />
                                        <span>Google Drive</span>
                                      </span>
                                    ) : (
                                      <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                                        <Layers className="w-2.5 h-2.5" />
                                        <span>Modul</span>
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-xs sm:max-w-md flex items-center gap-2 flex-wrap">
                                    {c.displayType === 'empty_page' ? (
                                      <>Container: <span className="font-semibold text-emerald-700">Pages Kosong ({gcs.length} Charlie)</span></>
                                    ) : c.displayType === 'drive' || c.driveUrl ? (
                                      <>Drive URL: <span className="font-semibold text-violet-700">{c.driveUrl || 'Belum diisi'}</span></>
                                    ) : (
                                      <>Destinasi: <span className="font-semibold text-slate-700">{c.destination}</span></>
                                    )}
                                    <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded-md border border-indigo-200">
                                      /{getHierarchicalSlug(c, items)}
                                    </span>
                                  </div>

                                  {isEligibleDrivePdf(c) && (
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                      {generatingThumbnailIds.has(c.id) || c.thumbnailStatus === 'generating' || c.thumbnailStatus === 'processing' ? (
                                        <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 flex items-center gap-1">
                                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                          <span>Menjana...</span>
                                        </span>
                                      ) : c.thumbnailUrl && (c.thumbnailStatus === 'ready' || c.thumbnailStatus === 'generated') && !brokenThumbIds.has(c.id) ? (
                                        <div className="flex items-center gap-1.5">
                                          <img
                                            src={c.thumbnailUrl}
                                            alt={c.name}
                                            className="w-5 h-6 object-cover rounded border border-slate-200 bg-white"
                                            onError={() => setBrokenThumbIds((prev) => new Set(prev).add(c.id))}
                                          />
                                          <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                                            <CheckCircle2 className="w-2.5 h-2.5" />
                                            <span>Thumbnail Sedia</span>
                                          </span>
                                        </div>
                                      ) : c.thumbnailStatus === 'failed' || c.thumbnailStatus === 'error' || brokenThumbIds.has(c.id) ? (
                                        <span
                                          title={c.thumbnailError || 'Penjanaan thumbnail gagal; dokumen masih boleh dibuka.'}
                                          className="text-[9.5px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-1"
                                        >
                                          <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                          <span>Thumbnail Gagal (Opsional)</span>
                                        </span>
                                      ) : (
                                        <span className="text-[9.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 flex items-center gap-1">
                                          <AlertCircle className="w-2.5 h-2.5" />
                                          <span>Belum Dijana</span>
                                        </span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleSingleThumbnailGeneration(c)}
                                        disabled={generatingThumbnailIds.has(c.id)}
                                        title="Jana Semula Thumbnail Dokumen"
                                        className="text-[10px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded border border-violet-200 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                      >
                                        <RotateCcw className={`w-2.5 h-2.5 ${generatingThumbnailIds.has(c.id) ? 'animate-spin' : ''}`} />
                                        <span>Jana Thumbnail</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-center">
                                <button
                                  type="button"
                                  onClick={() => handleAddNew('grandchild', c.id)}
                                  title="Tambah Navigasi Charlie di bawah bekas ini"
                                  className="px-2 py-1 rounded-lg text-[11px] font-extrabold bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>+ Charlie</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(c)}
                                  disabled={isSaving}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                                    c.isActive
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {c.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                  <span>{c.isActive ? 'Aktif' : 'Tutup'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEdit(c)}
                                  disabled={isSaving}
                                  className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePrompt(c)}
                                  disabled={isSaving}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {pChildren.length === 0 && (
                          <p className="text-[11px] text-slate-400 italic py-2 pl-2">
                            Tiada navigasi bravo di bawah alfa ini. (Alfa bertindak sebagai akses terus).
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* SECTION C: GRANDCHILD NAVIGATION LIST (Grouped by Child container) */}
            {(isContextualCharlieMode || (!isContextualDeltaMode && activeTab === 'grandchildren')) && (
              <div className="space-y-5">
                {(contextualBravoItem ? [contextualBravoItem] : children).map((c) => {
                  const parentOfChild = parents.find((p) => p.id === c.parentId);
                  const cGrandchildren = (grandchildrenByChild.get(c.id) || []).sort((a, b) => a.order - b.order);

                  return (
                    <div
                      key={c.id}
                      className="p-4 bg-violet-50/50 rounded-2xl border border-violet-100 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                            {renderNavIcon(c.icon, 'w-3 h-3')}
                          </div>
                          <span className="text-xs font-extrabold text-slate-900">
                            Bekas Bravo: <span className="text-violet-700">{c.name}</span>
                            {parentOfChild && (
                              <span className="text-slate-400 font-normal ml-1">({parentOfChild.name})</span>
                            )}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-violet-700 border border-violet-200">
                            {cGrandchildren.length} Charlie
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddNew('grandchild', c.id)}
                          className="px-2.5 py-1 bg-white hover:bg-violet-100 border border-violet-200 text-violet-700 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Tambah Charlie</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {cGrandchildren.map((gc, gcIdx) => {
                          const gcDeltas = deltasByGrandchild.get(gc.id) || [];
                          const isGcContainer = gc.displayType === 'empty_page';

                          return (
                          <div
                            key={gc.id}
                            className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                              gc.isActive ? 'border-slate-200 shadow-2xs' : 'border-slate-200/50 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleMoveOrder(gc, 'up')}
                                  disabled={gcIdx === 0 || isSaving}
                                  title="Pindah ke atas"
                                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveOrder(gc, 'down')}
                                  disabled={gcIdx === cGrandchildren.length - 1 || isSaving}
                                  title="Pindah ke bawah"
                                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="w-7 h-7 rounded-lg bg-violet-100 text-violet-800 border border-violet-200 flex items-center justify-center shrink-0">
                                {renderNavIcon(gc.icon, 'w-3.5 h-3.5')}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-sans font-extrabold text-slate-900 text-xs">
                                    {gc.name}
                                  </h5>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    #{gc.order + 1}
                                  </span>
                                  {isGcContainer ? (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                      <Layout className="w-2.5 h-2.5" />
                                      <span>Pages Kosong ({gcDeltas.length} Delta)</span>
                                    </span>
                                  ) : gcDeltas.length > 0 ? (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1">
                                      <FolderTree className="w-2.5 h-2.5" />
                                      <span>Bekas ({gcDeltas.length} Delta)</span>
                                    </span>
                                  ) : gc.displayType === 'drive' || gc.driveUrl ? (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1">
                                      <FileText className="w-2.5 h-2.5" />
                                      <span>Google Drive</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                                      <Layers className="w-2.5 h-2.5" />
                                      <span>Modul</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-xs sm:max-w-md flex items-center gap-2 flex-wrap">
                                  {isGcContainer ? (
                                    <>Container: <span className="font-semibold text-emerald-700">Pages Kosong ({gcDeltas.length} Delta)</span></>
                                  ) : gc.displayType === 'drive' || gc.driveUrl ? (
                                    <>Drive URL: <span className="font-semibold text-violet-700">{gc.driveUrl || 'Belum diisi'}</span></>
                                  ) : (
                                    <>Destinasi: <span className="font-semibold text-slate-700">{gc.destination}</span></>
                                  )}
                                  <span className="text-[9.5px] font-bold text-violet-700 bg-violet-50 px-1.5 py-0.2 rounded-md border border-violet-200">
                                    /{getHierarchicalSlug(gc, items)}
                                  </span>
                                </div>

                                {isEligibleDrivePdf(gc) && (
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {generatingThumbnailIds.has(gc.id) || gc.thumbnailStatus === 'generating' || gc.thumbnailStatus === 'processing' ? (
                                      <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 flex items-center gap-1">
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        <span>Menjana...</span>
                                      </span>
                                    ) : gc.thumbnailUrl && (gc.thumbnailStatus === 'ready' || gc.thumbnailStatus === 'generated') && !brokenThumbIds.has(gc.id) ? (
                                      <div className="flex items-center gap-1.5">
                                        <img
                                          src={gc.thumbnailUrl}
                                          alt={gc.name}
                                          className="w-5 h-6 object-cover rounded border border-slate-200 bg-white"
                                          onError={() => setBrokenThumbIds((prev) => new Set(prev).add(gc.id))}
                                        />
                                        <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5" />
                                          <span>Thumbnail Sedia</span>
                                        </span>
                                      </div>
                                    ) : gc.thumbnailStatus === 'failed' || gc.thumbnailStatus === 'error' || brokenThumbIds.has(gc.id) ? (
                                      <span
                                        title={gc.thumbnailError || 'Penjanaan thumbnail gagal; dokumen masih boleh dibuka.'}
                                        className="text-[9.5px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-1"
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                        <span>Thumbnail Gagal (Opsional)</span>
                                      </span>
                                    ) : (
                                      <span className="text-[9.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 flex items-center gap-1">
                                        <AlertCircle className="w-2.5 h-2.5" />
                                        <span>Belum Dijana</span>
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleSingleThumbnailGeneration(gc)}
                                      disabled={generatingThumbnailIds.has(gc.id)}
                                      title="Jana Semula Thumbnail Dokumen"
                                      className="text-[10px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded border border-violet-200 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <RotateCcw className={`w-2.5 h-2.5 ${generatingThumbnailIds.has(gc.id) ? 'animate-spin' : ''}`} />
                                      <span>Jana Thumbnail</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              {(isGcContainer || gcDeltas.length > 0) && (
                                <button
                                  type="button"
                                  onClick={() => handleAddNew('delta', gc.id)}
                                  title="Tambah Navigasi Delta di bawah bekas Charlie ini"
                                  className="px-2 py-1 rounded-lg text-[11px] font-extrabold bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>+ Delta</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleToggleActive(gc)}
                                disabled={isSaving}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                                  gc.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {gc.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                <span>{gc.isActive ? 'Aktif' : 'Tutup'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(gc)}
                                disabled={isSaving}
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePrompt(gc)}
                                disabled={isSaving}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          );
                        })}

                        {cGrandchildren.length === 0 && (
                          <p className="text-[11px] text-slate-400 italic py-2 pl-2">
                            Tiada navigasi charlie di bawah bravo ini. Klik "+ Charlie" untuk menambah dokumen fail Drive, pautan atau bekas Charlie di bawah bravo ini.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {children.length === 0 && (
                  <div className="text-center py-10 border border-dashed border-slate-200 rounded-2xl p-6">
                    <FolderTree className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-500">Tiada Navigasi Bravo untuk dijadikan bekas charlie.</p>
                  </div>
                )}
              </div>
            )}

            {/* SECTION D: DELTA NAVIGATION LIST (Grouped by Charlie container) */}
            {(isContextualDeltaMode || (!isContextualCharlieMode && activeTab === 'deltas')) && (
              <div className="space-y-5">
                {(contextualCharlieItem ? [contextualCharlieItem] : charlieContainersForDeltas).map((gc) => {
                  const bravoOfGc = children.find((c) => c.id === gc.parentId);
                  const alfaOfGc = bravoOfGc?.parentId ? parents.find((p) => p.id === bravoOfGc.parentId) : undefined;
                  const gcDeltas = (deltasByGrandchild.get(gc.id) || []).sort((a, b) => a.order - b.order);

                  return (
                    <div
                      key={gc.id}
                      className="p-4 bg-teal-50/50 rounded-2xl border border-teal-100 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                            {renderNavIcon(gc.icon, 'w-3 h-3')}
                          </div>
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            Bekas Charlie: <span className="text-teal-700">{gc.name}</span>
                            {bravoOfGc && (
                              <span className="text-slate-400 font-normal ml-1">
                                ({alfaOfGc ? `${alfaOfGc.name} → ` : ''}{bravoOfGc.name})
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-teal-700 border border-teal-200 shrink-0">
                            {gcDeltas.length} Delta
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddNew('delta', gc.id)}
                          className="px-2.5 py-1 bg-white hover:bg-teal-100 border border-teal-200 text-teal-700 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Tambah Delta</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {gcDeltas.map((d, dIdx) => (
                          <div
                            key={d.id}
                            className={`p-3 rounded-xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                              d.isActive ? 'border-slate-200 shadow-2xs' : 'border-slate-200/50 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleMoveOrder(d, 'up')}
                                  disabled={dIdx === 0 || isSaving}
                                  title="Pindah ke atas"
                                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveOrder(d, 'down')}
                                  disabled={dIdx === gcDeltas.length - 1 || isSaving}
                                  title="Pindah ke bawah"
                                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 border border-teal-200 flex items-center justify-center shrink-0">
                                {renderNavIcon(d.icon, 'w-3.5 h-3.5')}
                              </div>

                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="font-sans font-extrabold text-slate-900 text-xs">
                                    {d.name}
                                  </h5>
                                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                    #{d.order + 1}
                                  </span>
                                  {d.displayType === 'drive' || d.driveUrl ? (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-violet-100 text-violet-800 border border-violet-200 flex items-center gap-1">
                                      <FileText className="w-2.5 h-2.5" />
                                      <span>Google Drive</span>
                                    </span>
                                  ) : (
                                    <span className="text-[9.5px] font-extrabold px-2 py-0.2 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                                      <Layers className="w-2.5 h-2.5" />
                                      <span>{/^https?:\/\//i.test(d.destination || '') ? 'Pautan Luar' : 'Modul'}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-xs sm:max-w-md flex items-center gap-2 flex-wrap">
                                  {d.displayType === 'drive' || d.driveUrl ? (
                                    <>Drive URL: <span className="font-semibold text-violet-700">{d.driveUrl || 'Belum diisi'}</span></>
                                  ) : (
                                    <>Destinasi: <span className="font-semibold text-slate-700">{d.destination}</span></>
                                  )}
                                  <span className="text-[9.5px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.2 rounded-md border border-teal-200">
                                    /{getHierarchicalSlug(d, items)}
                                  </span>
                                </div>

                                {isEligibleDrivePdf(d) && (
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {generatingThumbnailIds.has(d.id) || d.thumbnailStatus === 'generating' || d.thumbnailStatus === 'processing' ? (
                                      <span className="text-[9.5px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200 flex items-center gap-1">
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                        <span>Menjana...</span>
                                      </span>
                                    ) : d.thumbnailUrl && (d.thumbnailStatus === 'ready' || d.thumbnailStatus === 'generated') && !brokenThumbIds.has(d.id) ? (
                                      <div className="flex items-center gap-1.5">
                                        <img
                                          src={d.thumbnailUrl}
                                          alt={d.name}
                                          className="w-5 h-6 object-cover rounded border border-slate-200 bg-white"
                                          onError={() => setBrokenThumbIds((prev) => new Set(prev).add(d.id))}
                                        />
                                        <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-1">
                                          <CheckCircle2 className="w-2.5 h-2.5" />
                                          <span>Thumbnail Sedia</span>
                                        </span>
                                      </div>
                                    ) : d.thumbnailStatus === 'failed' || d.thumbnailStatus === 'error' || brokenThumbIds.has(d.id) ? (
                                      <span
                                        title={d.thumbnailError || 'Penjanaan thumbnail gagal; dokumen masih boleh dibuka.'}
                                        className="text-[9.5px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 flex items-center gap-1"
                                      >
                                        <AlertCircle className="w-2.5 h-2.5 text-amber-600" />
                                        <span>Thumbnail Gagal (Opsional)</span>
                                      </span>
                                    ) : (
                                      <span className="text-[9.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200 flex items-center gap-1">
                                        <AlertCircle className="w-2.5 h-2.5" />
                                        <span>Belum Dijana</span>
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleSingleThumbnailGeneration(d)}
                                      disabled={generatingThumbnailIds.has(d.id)}
                                      title="Jana Semula Thumbnail Dokumen"
                                      className="text-[10px] font-bold text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 px-2 py-0.5 rounded border border-violet-200 cursor-pointer flex items-center gap-1 disabled:opacity-50"
                                    >
                                      <RotateCcw className={`w-2.5 h-2.5 ${generatingThumbnailIds.has(d.id) ? 'animate-spin' : ''}`} />
                                      <span>Jana Thumbnail</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              <button
                                type="button"
                                onClick={() => handleToggleActive(d)}
                                disabled={isSaving}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 ${
                                  d.isActive
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-slate-100 text-slate-500'
                                }`}
                              >
                                {d.isActive ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                <span>{d.isActive ? 'Aktif' : 'Tutup'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(d)}
                                disabled={isSaving}
                                className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-lg"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePrompt(d)}
                                disabled={isSaving}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {gcDeltas.length === 0 && (
                          <p className="text-[11px] text-slate-400 italic py-2 pl-2">
                            Tiada navigasi delta di bawah charlie ini. Klik "Tambah Delta" untuk menambah dokumen PDF Drive atau pautan di bawah bekas Charlie ini.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {!contextualCharlieItem && charlieContainersForDeltas.length === 0 && (
                  <div className="text-center py-10 border border-dashed border-teal-200 rounded-2xl p-6 bg-teal-50/20">
                    <FolderTree className="w-8 h-8 text-teal-400 mx-auto mb-2" />
                    <p className="text-xs font-extrabold text-slate-700">
                      Tiada Bekas Charlie (Pages Kosong) atau Item Delta Buat Masa Ini.
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                      Tetapkan sesuatu item Charlie sebagai <b>"Pages Kosong"</b> di tab Charlie, atau klik <b>"Tambah Delta"</b> untuk menempatkan dokumen di bawah mana-mana Charlie.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
            {isContextualDeltaMode && contextualCharlieItem ? (
              <span className="text-[11px] font-bold text-slate-500">
                Menunjukkan item Delta di bawah <span className="text-teal-700 font-extrabold">{contextualCharlieItem.name}</span> sahaja
              </span>
            ) : isContextualCharlieMode && contextualBravoItem ? (
              <span className="text-[11px] font-bold text-slate-500">
                Menunjukkan item Charlie di bawah <span className="text-violet-700 font-extrabold">{contextualBravoItem.name}</span> sahaja
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                disabled={isSaving}
                className="text-[11px] font-extrabold text-slate-500 hover:text-amber-800 bg-slate-100 hover:bg-amber-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:border-amber-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Struktur Lalai</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold shadow-sm cursor-pointer ml-auto"
            >
              {isContextualDeltaMode && contextualCharlieItem
                ? `Kembali ke ${contextualCharlieItem.name}`
                : isContextualCharlieMode && contextualBravoItem
                ? `Kembali ke ${contextualBravoItem.name}`
                : 'Selesai'}
            </button>
          </div>

          {/* SUB-MODAL 1: ADD / EDIT NAVIGATION FORM */}
          {isEditorOpen && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl border border-slate-100 space-y-4 text-left max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="font-sans font-extrabold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                    <Pencil className="w-4 h-4 text-indigo-600" />
                    <span>{editingItem ? 'Kemaskini Navigasi' : 'Tambah Navigasi Baharu'}</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setIsEditorOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-3.5">
                  {/* Type Selector (Hidden/Locked in Contextual Charlie/Delta Modes) */}
                  {isContextualDeltaMode && contextualCharlieItem ? (
                    <div className="p-3 bg-teal-50/80 rounded-2xl border border-teal-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
                          {renderNavIcon(contextualCharlieItem.icon, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700 block">
                            Konteks Induk Tetap (Delta)
                          </span>
                          <p className="text-xs font-extrabold text-slate-900 truncate">
                            Delta di bawah: <span className="text-teal-700">{contextualCharlieItem.name}</span>
                            {contextualBravoForDelta ? (
                              <span className="text-slate-500 font-semibold"> ({contextualBravoForDelta.name})</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white text-teal-800 border border-teal-200 shrink-0">
                        {contextualCharlieItem.id}
                      </span>
                    </div>
                  ) : isContextualCharlieMode && contextualBravoItem ? (
                    <div className="p-3 bg-violet-50/80 rounded-2xl border border-violet-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center shrink-0">
                          {renderNavIcon(contextualBravoItem.icon, 'w-4 h-4')}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-700 block">
                            Konteks Induk Tetap (Charlie)
                          </span>
                          <p className="text-xs font-extrabold text-slate-900 truncate">
                            Charlie di bawah: <span className="text-violet-700">{contextualBravoItem.name}</span>
                            {contextualAlfaItem ? (
                              <span className="text-slate-500 font-semibold"> ({contextualAlfaItem.name})</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-white text-violet-800 border border-violet-200 shrink-0">
                        {contextualBravoItem.id}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <label className="text-[11px] font-extrabold text-slate-700">Peringkat Hierarki Navigasi</label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                type: 'parent',
                                parentId: '',
                                displayType: 'module',
                              }))
                            }
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              formState.type === 'parent'
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-indigo-600" />
                            <span>1. Alfa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                type: 'child',
                                parentId: parents[0]?.id || '',
                              }))
                            }
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              formState.type === 'child'
                                ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <FolderTree className="w-3.5 h-3.5 text-indigo-600" />
                            <span>2. Bravo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                type: 'grandchild',
                                parentId: children[0]?.id || '',
                                parentFilterId: children[0]?.parentId || parents[0]?.id || '',
                                displayType: 'drive',
                              }))
                            }
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              formState.type === 'grandchild'
                                ? 'bg-violet-50 border-violet-500 text-violet-900 ring-2 ring-violet-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-violet-600" />
                            <span>3. Charlie</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const defaultGc = charlieContainersForDeltas[0] || grandchildren[0];
                              setFormState((prev) => ({
                                ...prev,
                                type: 'delta',
                                parentId: defaultGc?.id || '',
                                parentFilterId: defaultGc?.parentId || children[0]?.id || '',
                                displayType: 'drive',
                              }));
                            }}
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              formState.type === 'delta'
                                ? 'bg-teal-50 border-teal-500 text-teal-900 ring-2 ring-teal-200'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-teal-600" />
                            <span>4. Delta</span>
                          </button>
                        </div>
                      </div>

                      {/* Parent Association Dropdown (Only for Child) */}
                      {formState.type === 'child' && (
                        <div className="space-y-1">
                          <label className="text-[11px] font-extrabold text-slate-700">Pilih Navigasi Alfa (Parent)</label>
                          <select
                            value={formState.parentId}
                            onChange={(e) => setFormState({ ...formState, parentId: e.target.value })}
                            required
                            className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                          >
                            {parents.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Grandchild Association: Select Child Container (Only for Grandchild) */}
                      {formState.type === 'grandchild' && (
                        <div className="space-y-2 p-3 bg-violet-50/60 rounded-2xl border border-violet-100">
                          <div className="space-y-1">
                            <label className="text-[11px] font-extrabold text-violet-950">
                              Tapis mengikut Alfa (Pilihan):
                            </label>
                            <select
                              value={formState.parentFilterId}
                              onChange={(e) => {
                                const newParentFilter = e.target.value;
                                const availableCh = children.filter((c) => !newParentFilter || c.parentId === newParentFilter);
                                setFormState({
                                  ...formState,
                                  parentFilterId: newParentFilter,
                                  parentId: availableCh[0]?.id || formState.parentId,
                                });
                              }}
                              className="w-full px-3 py-1.5 rounded-xl border border-violet-200 text-xs bg-white outline-none focus:ring-2 focus:ring-violet-300"
                            >
                              <option value="">Semua Alfa</option>
                              {parents.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-extrabold text-violet-950 flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-violet-600" />
                              <span>Pilih Navigasi Bravo (Bekas / Container) *</span>
                            </label>
                            <select
                              value={formState.parentId}
                              onChange={(e) => setFormState({ ...formState, parentId: e.target.value })}
                              required
                              className="w-full px-3 py-2 rounded-xl border border-violet-300 text-xs bg-white font-bold text-violet-900 outline-none focus:ring-2 focus:ring-violet-300 shadow-2xs"
                            >
                              {childrenForGrandchildForm.map((c) => {
                                const pName = parents.find((p) => p.id === c.parentId)?.name;
                                return (
                                  <option key={c.id} value={c.id}>
                                    {c.name} {pName ? `(di bawah ${pName})` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      )}

                      {/* Delta Association: Select Charlie Container (Only for Delta) */}
                      {formState.type === 'delta' && (
                        <div className="space-y-2 p-3 bg-teal-50/70 rounded-2xl border border-teal-100">
                          <div className="space-y-1">
                            <label className="text-[11px] font-extrabold text-teal-950">
                              Tapis mengikut Bravo (Pilihan):
                            </label>
                            <select
                              value={formState.parentFilterId}
                              onChange={(e) => {
                                const newBravoFilter = e.target.value;
                                const availableGc = grandchildren.filter((gc) => !newBravoFilter || gc.parentId === newBravoFilter);
                                setFormState({
                                  ...formState,
                                  parentFilterId: newBravoFilter,
                                  parentId: availableGc[0]?.id || formState.parentId,
                                });
                              }}
                              className="w-full px-3 py-1.5 rounded-xl border border-teal-200 text-xs bg-white outline-none focus:ring-2 focus:ring-teal-300"
                            >
                              <option value="">Semua Bravo</option>
                              {children.map((c) => {
                                const pName = parents.find((p) => p.id === c.parentId)?.name;
                                return (
                                  <option key={c.id} value={c.id}>
                                    {c.name} {pName ? `(${pName})` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-extrabold text-teal-950 flex items-center gap-1">
                              <CornerDownRight className="w-3 h-3 text-teal-600" />
                              <span>Pilih Navigasi Charlie (Bekas / Container) *</span>
                            </label>
                            <select
                              value={formState.parentId}
                              onChange={(e) => setFormState({ ...formState, parentId: e.target.value })}
                              required
                              className="w-full px-3 py-2 rounded-xl border border-teal-300 text-xs bg-white font-bold text-teal-950 outline-none focus:ring-2 focus:ring-teal-300 shadow-2xs"
                            >
                              {grandchildrenForDeltaForm.map((gc) => {
                                const cName = children.find((c) => c.id === gc.parentId)?.name;
                                const containerTag = gc.displayType === 'empty_page' ? ' [Bekas]' : '';
                                return (
                                  <option key={gc.id} value={gc.id}>
                                    {gc.name}{containerTag} {cName ? `(di bawah ${cName})` : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Display Name */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-extrabold text-slate-700">Nama Paparan Navigasi</label>
                    <input
                      type="text"
                      value={formState.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setFormState((prev) => ({
                          ...prev,
                          name: newName,
                          slug: !prev.isSlugCustomized ? slugify(newName) : prev.slug,
                        }));
                      }}
                      placeholder={
                        formState.type === 'delta'
                          ? 'Contoh: Lampiran E-1, Lampiran F, Garis Panduan...'
                          : formState.type === 'grandchild'
                          ? 'Contoh: Kertas Kerja, Grading, Panduan Peperiksaan...'
                          : 'Contoh: Directory Staff, Portal Pelajar, Jadual...'
                      }
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200 font-medium"
                    />
                  </div>

                  {/* URL Slug (Laluan Bersih / Clean URL Architecture SES v4.5) */}
                  <div className="space-y-1.5 p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-indigo-950 flex items-center gap-1.5">
                        <span>URL Slug</span>
                        <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                          SES v4.5
                        </span>
                      </label>
                      {formState.name.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormState((prev) => ({
                              ...prev,
                              slug: slugify(prev.name),
                              isSlugCustomized: false,
                            }));
                          }}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer underline"
                        >
                          Jana Semula dari Nama
                        </button>
                      )}
                    </div>

                    <div className="flex items-center rounded-xl border border-indigo-200 bg-white overflow-hidden shadow-2xs focus-within:ring-2 focus-within:ring-indigo-200">
                      <span className="pl-3 pr-1 text-xs font-mono font-bold text-slate-400 select-none">/</span>
                      <input
                        type="text"
                        value={formState.slug}
                        onChange={(e) => {
                          const cleaned = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_-]/g, '');
                          setFormState((prev) => ({
                            ...prev,
                            slug: cleaned,
                            isSlugCustomized: true,
                          }));
                        }}
                        placeholder={slugify(formState.name) || 'jadual_exam'}
                        required
                        className="w-full py-2 pr-3 text-xs font-mono text-indigo-950 bg-transparent outline-none font-bold"
                      />
                    </div>

                    {/* Live Hierarchical URL Preview (SES v4.5 4-Level Specification) */}
                    {(() => {
                      const currentSlug = formState.slug || slugify(formState.name) || 'slug';
                      let previewPath = currentSlug;
                      if ((formState.type === 'grandchild' || formState.type === 'delta') && formState.parentId) {
                        const parentObj = items.find((i) => i.id === formState.parentId);
                        const parentHierarchical = parentObj ? getHierarchicalSlug(parentObj, items) : '';
                        if (parentHierarchical) {
                          previewPath = `${parentHierarchical}/${currentSlug}`;
                        }
                      } else if (formState.type === 'parent' && (formState.destination === 'directory' || formState.id === 'nav_directory')) {
                        previewPath = '';
                      }

                      return (
                        <div className="text-[10.5px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-600">Pratonton URL Hierarki:</span>
                          <code className="text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-100 font-bold font-mono">
                            https://directkpmbp.syncrozz.com/{previewPath}
                          </code>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Icon Selector with Preview */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-extrabold text-slate-700">Ikon Navigasi</label>
                      <div className="flex items-center gap-1.5 text-xs text-indigo-700 font-bold">
                        <span>Pilihan:</span>
                        <div className="p-1 rounded-md bg-indigo-50 border border-indigo-200">
                          {renderNavIcon(formState.icon, 'w-3.5 h-3.5')}
                        </div>
                        <span className="font-mono text-[11px]">{formState.icon}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                      {AVAILABLE_NAV_ICONS.map((ic) => (
                        <button
                          key={ic.name}
                          type="button"
                          onClick={() => setFormState({ ...formState, icon: ic.name })}
                          title={ic.label}
                          className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                            formState.icon === ic.name
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200/60'
                          }`}
                        >
                          {renderNavIcon(ic.name, 'w-4 h-4')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SECTION B: DISPLAY TYPE & DESTINATION CONFIGURATION (Child, Grandchild & Delta) */}
                  {formState.type === 'child' || formState.type === 'grandchild' || formState.type === 'delta' ? (
                    <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-extrabold text-slate-800">
                          SEKSYEN B — JENIS PAPARAN KANDUNGAN
                        </label>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                          SES v4.5
                        </span>
                      </div>

                      {/* Display Type Selector Segmented Buttons */}
                      <div className={`grid ${formState.type === 'child' || formState.type === 'grandchild' ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                        <button
                          type="button"
                          onClick={() => setFormState({ ...formState, displayType: 'module' })}
                          className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            formState.displayType === 'module'
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>{formState.type === 'delta' ? 'Modul / Pautan Luar' : 'Modul Sedia Ada'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormState({ ...formState, displayType: 'drive' })}
                          className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            formState.displayType === 'drive'
                              ? 'bg-violet-600 text-white border-violet-600 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Paparan Google Drive</span>
                        </button>
                        {(formState.type === 'child' || formState.type === 'grandchild') && (
                          <button
                            type="button"
                            onClick={() => setFormState({ ...formState, displayType: 'empty_page' })}
                            className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                              formState.displayType === 'empty_page'
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <Layout className="w-3.5 h-3.5" />
                            <span>Pages Kosong</span>
                          </button>
                        )}
                      </div>

                      {formState.displayType === 'empty_page' && (formState.type === 'child' || formState.type === 'grandchild') ? (
                        <div className="space-y-2 p-3.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-left">
                          <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs">
                            <Layout className="w-4 h-4 text-emerald-600" />
                            <span>
                              {formState.type === 'grandchild'
                                ? 'Halaman Kosong / Container Navigasi Delta'
                                : 'Halaman Kosong / Container Navigasi Charlie'}
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-700 leading-relaxed">
                            {formState.type === 'grandchild' ? (
                              <>
                                Navigasi Charlie ini akan berfungsi sebagai <b>halaman container</b> yang membolehkan navigasi delta (dokumen PDF, borang, atau pautan) diletakkan di bawahnya.
                              </>
                            ) : (
                              <>
                                Navigasi ini akan berfungsi sebagai <b>halaman container</b> yang membolehkan navigasi charlie diletakkan di bawahnya. Tidak memerlukan pautan Google Drive atau modul aplikasi khusus.
                              </>
                            )}
                          </p>
                          <div className="text-[10px] text-emerald-900 bg-white/90 p-2.5 rounded-lg border border-emerald-200 font-medium space-y-1">
                            <div className="font-bold flex items-center gap-1 text-emerald-800">
                              <span>
                                ✓ Bersedia Menerima Navigasi {formState.type === 'grandchild' ? 'Delta' : 'Charlie'}:
                              </span>
                            </div>
                            <p className="text-slate-600 leading-normal">
                              {formState.type === 'grandchild'
                                ? 'Anda boleh menambah item Delta di bawah bekas Charlie ini bila-bila masa melalui tab Delta atau terus daripada paparan container Charlie.'
                                : 'Halaman kosong yang sah ini boleh menerima navigasi charlie kemudian. Anda boleh menambah navigasi charlie di bawahnya bila-bila masa melalui tab Charlie atau dari paparan container ini.'}
                            </p>
                          </div>
                        </div>
                      ) : formState.displayType === 'drive' ? (
                        <div className="space-y-2.5 pt-2 border-t border-slate-200/80">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-extrabold text-slate-800">
                                Pautan Google Drive
                              </label>
                              {liveDriveParsed ? (
                                <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {liveDriveParsed.kind === 'drive-folder' ? 'Folder Drive Dikesan' : 'Fail PDF Dikesan'}
                                </span>
                              ) : formState.driveUrl.trim() ? (
                                <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                                  Format Tidak Sah
                                </span>
                              ) : null}
                            </div>
                            <input
                              type="url"
                              value={formState.driveUrl}
                              onChange={(e) => setFormState({ ...formState, driveUrl: e.target.value })}
                              placeholder="https://drive.google.com/file/d/... atau https://drive.google.com/drive/folders/..."
                              required={formState.displayType === 'drive'}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white outline-none focus:ring-2 focus:ring-violet-300"
                            />
                            <p className="text-[10px] text-slate-500 leading-relaxed">
                              Pastikan perkongsian fail ditetapkan kepada <b>"Sesiapa sahaja yang mempunyai pautan"</b> sebagai Viewer. Paparan akan menyokong skrin penuh, butang Buka di Drive, dan iframe automatik.
                            </p>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-extrabold text-slate-800">
                              Tajuk Paparan Dokumen
                            </label>
                            <input
                              type="text"
                              value={formState.displayTitle}
                              onChange={(e) => setFormState({ ...formState, displayTitle: e.target.value })}
                              placeholder={formState.name || 'Contoh: Jadual Waktu Sesi 2026/2027'}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-violet-300"
                            />
                            <p className="text-[10px] text-slate-400">
                              Jika dikosongkan, nama paparan navigasi akan digunakan sebagai tajuk dokumen.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 pt-2 border-t border-slate-200/80">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-extrabold text-slate-700">Pilih Modul Sasaran</label>
                            <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer font-medium">
                              <input
                                type="checkbox"
                                checked={formState.useCustomDestination}
                                onChange={(e) => setFormState({ ...formState, useCustomDestination: e.target.checked })}
                                className="rounded text-indigo-600"
                              />
                              <span>Pautan Luar / Khas</span>
                            </label>
                          </div>

                          {!formState.useCustomDestination ? (
                            <select
                              value={formState.destination}
                              onChange={(e) => setFormState({ ...formState, destination: e.target.value })}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                            >
                              {KNOWN_MODULE_DESTINATIONS.map((mod) => (
                                <option key={mod.id} value={mod.id}>
                                  {mod.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={formState.customDestination}
                              onChange={(e) => setFormState({ ...formState, customDestination: e.target.value })}
                              placeholder="https://... atau #slug"
                              required={formState.useCustomDestination}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                            />
                          )}
                          <p className="text-[10px] text-slate-400">
                            Modul sasaran dalam aplikasi: <code>directory</code>, <code>platform</code>, <code>jadual</code>, <code>jadual-pensyarah</code>, <code>deadline</code>, <code>daftar</code>.
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Parent Destination / Route Configuration */
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-extrabold text-slate-700">Destinasi Modul / Pautan Alfa</label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer font-medium">
                          <input
                            type="checkbox"
                            checked={formState.useCustomDestination}
                            onChange={(e) => setFormState({ ...formState, useCustomDestination: e.target.checked })}
                            className="rounded text-indigo-600"
                          />
                          <span>Pautan Luar / Khas</span>
                        </label>
                      </div>

                      {!formState.useCustomDestination ? (
                        <select
                          value={formState.destination}
                          onChange={(e) => setFormState({ ...formState, destination: e.target.value })}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                        >
                          <option value="empty_page">
                            Container Kosong (Pages Kosong — Bekas Navigasi Bravo)
                          </option>
                          {KNOWN_MODULE_DESTINATIONS.map((mod) => (
                            <option key={mod.id} value={mod.id}>
                              {mod.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={formState.customDestination}
                          onChange={(e) => setFormState({ ...formState, customDestination: e.target.value })}
                          placeholder="https://... atau #slug"
                          required={formState.useCustomDestination}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono bg-white outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      )}
                      <p className="text-[10px] text-slate-400">
                        {!formState.useCustomDestination && formState.destination === 'empty_page'
                          ? 'Sesuai untuk kategori induk baharu: memaparkan halaman bekas kosong sehingga navigasi bravo ditambah (apabila bravo wujud, klik pada alfa akan membuka bravo pertama secara automatik).'
                          : 'Jika navigasi alfa mempunyai bravo, klik pada alfa akan membuka bravo pertama secara automatik.'}
                      </p>
                    </div>
                  )}

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <div>
                      <span className="text-xs font-extrabold text-slate-800">Status Keaktifan</span>
                      <p className="text-[10.5px] text-slate-500">Hanya navigasi aktif dipaparkan kepada pengguna awam.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formState.isActive}
                        onChange={(e) => setFormState({ ...formState, isActive: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {/* Submit buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsEditorOpen(false)}
                      disabled={isSaving}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Simpan Navigasi</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* SUB-MODAL 2: DELETE CONFIRMATION & SAFETY BARRIER */}
          {itemToDelete && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4 text-left">
                <div className="flex items-center gap-3 text-rose-600">
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <h4 className="font-sans font-extrabold text-slate-900 text-base">
                    Pengesahan Pemadaman Navigasi
                  </h4>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Adakah anda pasti ingin memadam navigasi <strong>"{itemToDelete.name}"</strong>?
                </p>

                {deleteWarning ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium leading-relaxed">
                    <strong className="block mb-1 text-amber-950 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Sekatan Keselamatan Integriti Data:
                    </strong>
                    {deleteWarning}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
                    Nota: Pemadaman navigasi HANYA memadam butang menu. Modul, data staf, jadual dan pangkalan data Firebase tidak terjejas sama sekali.
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setItemToDelete(null)}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={isSaving || Boolean(deleteWarning)}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>Padam Sekarang</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SUB-MODAL 3: RESET TO DEFAULT CONFIRMATION */}
          {showResetConfirm && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-slate-950/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-slate-100 space-y-4 text-left">
                <div className="flex items-center gap-3 text-amber-600">
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <h4 className="font-sans font-extrabold text-slate-900 text-base">
                    Kembalikan Struktur Navigasi Lalai
                  </h4>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Tindakan ini akan mengembalikan struktur navigasi kepada susunan standard SES v4.4:
                </p>

                <ul className="text-xs text-slate-700 list-disc list-inside space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
                  <li><strong>Alfa 1:</strong> Directory Staff</li>
                  <li><strong>Alfa 2:</strong> Rujukan Kolej</li>
                  <li><strong>Alfa 3:</strong> Jadual</li>
                  <li className="pl-4">↳ <strong>Bravo 1:</strong> Jadual Pelajar</li>
                  <li className="pl-4">↳ <strong>Bravo 2:</strong> Jadual Pensyarah</li>
                </ul>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    <span>Laksana Reset Lalai</span>
                  </button>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </div>
      )}
    </AnimatePresence>
  );
};

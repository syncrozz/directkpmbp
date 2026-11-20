/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * DIRECTKPMBP — AUTOMATIC PDF THUMBNAIL GENERATION SERVICE
 * SYNCROZZ ENGINEERING STANDARD
 * 
 * Pipeline:
 * 1. Resolves fileId and resourcekey from Google Drive URLs
 * 2. Fetches direct authorized PDF binary via secure proxy with PDF magic byte validation
 * 3. Renders Page 1 only using PDF.js & Canvas with crisp proportions & white background
 * 4. Persists high-efficiency WebP/PNG thumbnail to Firebase Storage without duplicate files
 * 5. Saves resulting thumbnail URL and status ('pending' | 'processing' | 'generated' | 'failed') in Firestore
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getDoc } from 'firebase/firestore';
import { storage, auth } from '../config/firebase';
import { NavigationItem } from '../types';
import { navigationDocRef, saveNavigationItems, LOCAL_STORAGE_NAV_KEY } from './navigationService';
import { parseTakwimLink } from './takwimService';

// Configure PDF.js worker using Vite-bundled matching module asset to avoid missing /public file & HTML MIME errors
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  } catch (_e) {
    // Ignore worker assignment error if already frozen
  }
}

export interface ResolvePdfEndpointOptions {
  baseUrl?: string;
  isProd?: boolean;
  hostname?: string;
}

/**
 * Resolves the backend base URL for /api/pdf/* routes.
 * - Uses VITE_SNAPSHOT_API_BASE_URL when configured (e.g. Cloud Run backend on Vercel production).
 * - Uses same-origin '' on localhost, *.run.app containers, or development mode.
 * - Returns null in split production when VITE_SNAPSHOT_API_BASE_URL is unset so callers fail
 *   non-fatally instead of fetching Vercel SPA index.html as PDF/PNG.
 */
export function resolvePdfEndpointUrl(
  routePath: '/api/pdf/proxy' | '/api/pdf/thumbnail-source',
  options: ResolvePdfEndpointOptions = {}
): string | null {
  const rawBase =
    options.baseUrl !== undefined
      ? options.baseUrl
      : ((import.meta as any).env?.VITE_SNAPSHOT_API_BASE_URL ?? '');

  const trimmed = String(rawBase).trim().replace(/\/+$/, '');
  if (trimmed) {
    if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) {
      return null;
    }
    const cleanBase = trimmed.replace(/\/api\/platform\/snapshot$/i, '');
    return `${cleanBase}${routePath}`;
  }

  const runtimeHostname = (
    options.hostname !== undefined
      ? options.hostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  )
    .trim()
    .toLowerCase();

  const isLocalHost =
    !runtimeHostname ||
    runtimeHostname === 'localhost' ||
    runtimeHostname === '127.0.0.1' ||
    runtimeHostname === '0.0.0.0' ||
    runtimeHostname === '[::1]';

  const isHostedExpressContainer = runtimeHostname.endsWith('.run.app');
  const isProductionBuild =
    options.isProd !== undefined ? options.isProd : Boolean((import.meta as any).env?.PROD);

  if (isProductionBuild && !isLocalHost && !isHostedExpressContainer) {
    return null;
  }

  return routePath;
}

/**
 * Extracts Google Drive File ID from diverse Google Drive URL permutations
 */
export function extractGoogleDriveFileId(url?: string | null): string | null {
  if (!url) return null;
  const input = url.trim();
  if (!input) return null;

  try {
    const parsedUrl = new URL(input);
    const host = parsedUrl.hostname.toLowerCase();
    if (!host.includes('google.com') && !host.includes('googleusercontent.com')) {
      return null;
    }

    // 1. Check pathname regex: /file/d/{id}, /document/d/{id}, /spreadsheets/d/{id}, /presentation/d/{id}
    const pathMatch = parsedUrl.pathname.match(/\/(?:file|document|presentation|spreadsheets|forms)\/d\/([a-zA-Z0-9_-]{10,128})/);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }

    // 2. Check query param ?id={id}
    const queryId = parsedUrl.searchParams.get('id');
    if (queryId && /^[a-zA-Z0-9_-]{10,128}$/.test(queryId)) {
      return queryId;
    }

    // 3. Check open?id={id} or uc?id={id}
    const openMatch = parsedUrl.pathname.match(/\/(?:open|uc)$/);
    if (openMatch && queryId) {
      return queryId;
    }

    // 4. Check fallback general alphanumeric match inside /d/{id}
    const generalD = parsedUrl.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,128})/);
    if (generalD && generalD[1]) {
      return generalD[1];
    }
  } catch {
    // Regex fallback if URL constructor fails
    const regexMatch = input.match(/[-\w]{25,}/);
    if (regexMatch && regexMatch[0]) {
      return regexMatch[0];
    }
  }

  return null;
}

/**
 * Extracts optional Google Drive resourcekey for older protected files (post-2021 Drive update)
 */
export function extractGoogleDriveResourceKey(url?: string | null): string | null {
  if (!url) return null;
  const input = url.trim();
  if (!input) return null;

  try {
    const parsedUrl = new URL(input);
    const key = parsedUrl.searchParams.get('resourcekey');
    if (key && /^[a-zA-Z0-9_-]+$/.test(key)) {
      return key;
    }
  } catch {
    const match = input.match(/[?&]resourcekey=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Determines whether a navigation item is an eligible Google Drive document
 */
export function isEligibleDrivePdf(item: NavigationItem): boolean {
  if (!item.driveUrl) return false;
  const parsed = parseTakwimLink(item.driveUrl);
  if (!parsed) return false;
  // Folders are not single-page PDFs
  if (parsed.kind === 'drive-folder') return false;
  const fileId = extractGoogleDriveFileId(item.driveUrl);
  return Boolean(fileId);
}

/**
 * Renders page 1 only of a PDF into an HTML5 Canvas using PDF.js
 */
async function renderPdfBufferToCanvas(data: ArrayBuffer | Uint8Array): Promise<HTMLCanvasElement> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(data),
    useSystemFonts: true,
  });

  const pdfDocument = await loadingTask.promise;
  const firstPage = await pdfDocument.getPage(1);

  // Target viewport width of ~800-900px for crisp cards on high-DPI displays
  const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
  const desiredWidth = 850;
  const scale = desiredWidth / unscaledViewport.width;
  const viewport = firstPage.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Gagal memulakan konteks Canvas 2D.');
  }

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);

  // White background for documents to avoid transparent artifacts
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext: any = {
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  };

  await firstPage.render(renderContext).promise;
  return canvas;
}

/**
 * Loads an image from URL into an offscreen Canvas (bounded by timeout)
 */
async function renderImageUrlToCanvas(imageUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Masa menunggu tamat semasa memuatkan imej pratonton daripada Google Drive.'));
      }
    }, 15000);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 800;
      canvas.height = img.naturalHeight || img.height || 1100;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Konteks Canvas tidak tersedia.'));
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Gagal memuatkan imej sumber dokumen daripada Google Drive.'));
    };

    img.src = imageUrl;
  });
}

/**
 * Converts HTMLCanvasElement to a high-quality WebP or PNG Blob
 */
async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    // Try modern WebP first with optimized quality
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // Fallback to PNG if WebP export is unsupported
          canvas.toBlob(
            (pngBlob) => {
              if (pngBlob) resolve(pngBlob);
              else reject(new Error('Gagal menukar canvas kepada imej blob.'));
            },
            'image/png'
          );
        }
      },
      'image/webp',
      0.88
    );
  });
}

/**
 * Uploads generated thumbnail blob exclusively to Firebase Storage and returns its public download URL.
 * Uses deterministic path without timestamps to avoid creating duplicate Storage files.
 * Never falls back to ephemeral local/container disk storage.
 */
async function uploadThumbnailBlob(blob: Blob, fileId: string): Promise<string> {
  const ext = blob.type.includes('png') ? 'png' : 'webp';
  // Deterministic file path prevents storage duplication across regenerations
  const storagePath = `platforms/directkpmbp/thumbnails/${fileId}.${ext}`;
  const storageRef = ref(storage, storagePath);

  // Refresh token if admin is authenticated
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (_e) {
      // ignore
    }
  }

  const snapshot = await uploadBytes(storageRef, blob, {
    contentType: blob.type || 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    customMetadata: {
      sourceFileId: fileId,
      generator: 'DirectoryKPMBP-PdfThumbnailService',
      generatedAt: new Date().toISOString(),
    },
  });

  return await getDownloadURL(snapshot.ref);
}

export interface ThumbnailGenerationResult {
  success: boolean;
  item: NavigationItem;
  error?: string;
}

/**
 * Generates thumbnail for a single navigation item (strictly non-fatal: never throws).
 *
 * Process:
 * 1. Resolves fileId & resourcekey from driveUrl
 * 2. Tier 1: Fetches PDF bytes from resolved /api/pdf/proxy?id={fileId}&resourcekey={resourcekey}
 * 3. Validates PDF magic header and renders Page 1 with PDF.js on Canvas
 * 4. Tier 2 Fallback: Loads direct page 1 preview from resolved /api/pdf/thumbnail-source
 * 5. Converts Canvas to WebP blob & uploads to Firebase Storage
 * 6. Returns updated NavigationItem with status: 'generated' or 'failed' (without blocking parent actions)
 */
export async function generateThumbnailForItem(
  item: NavigationItem,
  forceRegenerate = false
): Promise<ThumbnailGenerationResult> {
  if (!isEligibleDrivePdf(item)) {
    return {
      success: false,
      item: {
        ...item,
        thumbnailStatus: 'idle',
      },
      error: 'Bukan fail PDF Google Drive yang sah.',
    };
  }

  const fileId = extractGoogleDriveFileId(item.driveUrl);
  const resourcekey = extractGoogleDriveResourceKey(item.driveUrl);

  if (!fileId) {
    return {
      success: false,
      item: {
        ...item,
        thumbnailStatus: 'failed',
        thumbnailError: 'ID fail Google Drive tidak dapat dikenal pasti.',
      },
      error: 'ID fail Google Drive tidak sah.',
    };
  }

  const isAuthoritativeThumbUrl = Boolean(
    item.thumbnailUrl && !item.thumbnailUrl.trim().startsWith('/thumbnails/')
  );

  // Caching: Avoid re-generation if an authoritative Storage thumbnail already exists and source file ID matches
  const isAlreadyGenerated =
    isAuthoritativeThumbUrl &&
    (item.thumbnailStatus === 'generated' || item.thumbnailStatus === 'ready') &&
    item.thumbnailFileId === fileId;

  if (!forceRegenerate && isAlreadyGenerated) {
    return {
      success: true,
      item,
    };
  }

  let canvas: HTMLCanvasElement | null = null;
  let lastError: string | null = null;
  const rKeyParam = resourcekey ? `&resourcekey=${encodeURIComponent(resourcekey)}` : '';

  try {
    // Tier 1: Fetch actual PDF stream via authorized proxy and render page 1 using PDF.js
    const proxyBase = resolvePdfEndpointUrl('/api/pdf/proxy');
    if (proxyBase) {
      try {
        const proxyUrl = `${proxyBase}?id=${encodeURIComponent(fileId)}${rKeyParam}`;
        const response = await fetch(proxyUrl);
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (response.ok && !contentType.includes('text/html')) {
          const arrayBuffer = await response.arrayBuffer();
          // Verify buffer has PDF magic header %PDF- (0x25, 0x50, 0x44, 0x46)
          const uint8 = new Uint8Array(arrayBuffer);
          const isPdfHeader =
            uint8.length > 4 &&
            uint8[0] === 0x25 && // %
            uint8[1] === 0x50 && // P
            uint8[2] === 0x44 && // D
            uint8[3] === 0x46;   // F

          if (isPdfHeader) {
            canvas = await renderPdfBufferToCanvas(arrayBuffer);
          } else {
            lastError = 'Data yang diterima daripada Google Drive bukan bait PDF yang sah.';
          }
        } else if (!response.ok) {
          try {
            const errorData = contentType.includes('application/json') ? await response.json() : null;
            lastError = errorData?.error || `Pelayan Google Drive membalas status HTTP ${response.status}.`;
          } catch {
            lastError = `Ralat muat turun HTTP ${response.status}.`;
          }
        } else {
          lastError = 'Endpoint proksi PDF memulangkan halaman HTML dan bukannya fail PDF.';
        }
      } catch (pdfErr: any) {
        console.warn('[PdfThumbnailService] Tier 1 Notice (PDF.js buffer):', pdfErr?.message || pdfErr);
        lastError = pdfErr?.message || 'Gagal memproses bait fail PDF.';
      }
    } else {
      lastError = 'Endpoint proksi PDF belum dikonfigurasi untuk persekitaran produksi ini.';
    }

    // Tier 2 Fallback: Fetch direct page 1 thumbnail from resolved /api/pdf/thumbnail-source
    if (!canvas) {
      const sourceBase = resolvePdfEndpointUrl('/api/pdf/thumbnail-source');
      if (sourceBase) {
        try {
          const sourceUrl = `${sourceBase}?id=${encodeURIComponent(fileId)}${rKeyParam}`;
          canvas = await renderImageUrlToCanvas(sourceUrl);
        } catch (sourceErr: any) {
          console.warn('[PdfThumbnailService] Tier 2 Notice (Direct Preview):', sourceErr?.message || sourceErr);
          if (!lastError) {
            lastError = sourceErr?.message || 'Gagal mendapatkan pratonton daripada Google Drive.';
          }
        }
      }
    }

    if (!canvas) {
      const detailedError = lastError || 'Gagal menjana lakaran kenit (thumbnail) daripada dokumen sumber.';
      return {
        success: false,
        item: {
          ...item,
          thumbnailUrl:
            item.thumbnailFileId === fileId && isAuthoritativeThumbUrl ? item.thumbnailUrl : undefined,
          thumbnailStatus: 'failed',
          thumbnailFileId: fileId,
          thumbnailError: detailedError,
        },
        error: detailedError,
      };
    }

    // Convert to WebP blob & upload to Firebase Storage
    const blob = await canvasToBlob(canvas);
    const downloadUrl = await uploadThumbnailBlob(blob, fileId);

    const updatedItem: NavigationItem = {
      ...item,
      thumbnailUrl: downloadUrl,
      thumbnailStatus: 'generated',
      thumbnailGeneratedAt: new Date().toISOString(),
      thumbnailFileId: fileId,
      thumbnailError: undefined,
      sourceFileMetadata: {
        fileId,
        lastModified: new Date().toISOString(),
      },
    };

    return {
      success: true,
      item: updatedItem,
    };
  } catch (unexpectedErr: any) {
    console.warn('[PdfThumbnailService] Non-fatal thumbnail generation error:', unexpectedErr?.message || unexpectedErr);
    const errText = unexpectedErr?.message
      ? `Penjanaan thumbnail gagal: ${unexpectedErr.message}`
      : 'Gagal menjana atau memuat naik thumbnail PDF.';
    return {
      success: false,
      item: {
        ...item,
        thumbnailUrl:
          item.thumbnailFileId === fileId && isAuthoritativeThumbUrl ? item.thumbnailUrl : undefined,
        thumbnailStatus: 'failed',
        thumbnailFileId: fileId,
        thumbnailError: errText,
      },
      error: errText,
    };
  }
}

/**
 * Merges an async thumbnail generation outcome into a current NavigationItem only when
 * the item's type and Drive file ID still match the outcome, preventing stale/other-file overwrites.
 */
export function applyValidatedThumbnailOutcome(
  entry: NavigationItem,
  outcomeItem: NavigationItem,
  baselineGeneratedAt?: string
): NavigationItem {
  if (entry.id !== outcomeItem.id) return entry;

  // Reject stale result if item was changed away from a Google Drive PDF item
  if (entry.displayType && entry.displayType !== 'drive') return entry;
  if (!isEligibleDrivePdf(entry)) return entry;

  const currentFileId = extractGoogleDriveFileId(entry.driveUrl);
  const outcomeFileId =
    outcomeItem.thumbnailFileId || extractGoogleDriveFileId(outcomeItem.driveUrl);

  // Reject stale result if the Drive URL / file ID changed concurrently
  if (!currentFileId || !outcomeFileId || currentFileId !== outcomeFileId) {
    return entry;
  }

  // Reject delayed outcome if a newer successful thumbnail was already saved for this same file
  if (
    baselineGeneratedAt !== undefined &&
    entry.thumbnailFileId === currentFileId &&
    (entry.thumbnailStatus === 'generated' || entry.thumbnailStatus === 'ready') &&
    entry.thumbnailUrl &&
    !entry.thumbnailUrl.trim().startsWith('/thumbnails/') &&
    entry.thumbnailGeneratedAt &&
    entry.thumbnailGeneratedAt !== baselineGeneratedAt
  ) {
    return entry;
  }

  const safeThumbnailUrl =
    outcomeItem.thumbnailUrl && !outcomeItem.thumbnailUrl.trim().startsWith('/thumbnails/')
      ? outcomeItem.thumbnailUrl
      : undefined;

  return {
    ...entry,
    thumbnailUrl: safeThumbnailUrl,
    thumbnailStatus: outcomeItem.thumbnailStatus,
    thumbnailFileId: outcomeFileId,
    thumbnailGeneratedAt: outcomeItem.thumbnailGeneratedAt,
    thumbnailError: outcomeItem.thumbnailError,
    sourceFileMetadata: outcomeItem.sourceFileMetadata,
  };
}

async function resolveLatestNavigationListForBulk(
  fallbackItems: NavigationItem[],
  getLatestItems?: () => NavigationItem[]
): Promise<NavigationItem[]> {
  if (getLatestItems) {
    const provided = getLatestItems();
    if (Array.isArray(provided) && provided.length > 0) {
      return provided;
    }
  }

  try {
    const snap = await getDoc(navigationDocRef());
    if (snap.exists()) {
      const remoteItems = snap.data()?.items;
      if (Array.isArray(remoteItems) && remoteItems.length > 0) {
        return remoteItems as NavigationItem[];
      }
    }
  } catch (_e) {
    // Fall back to local cache / provided list when offline or unauthenticated
  }

  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_NAV_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as NavigationItem[];
        }
      }
    } catch (_e) {
      // ignore malformed cache
    }
  }

  return fallbackItems;
}

export interface BulkThumbnailProgress {
  total: number;
  completed: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  currentItem?: NavigationItem;
}

/**
 * Bulk generates thumbnails for all eligible Google Drive PDF documents in the navigation tree
 * without overwriting concurrent navigation edits when saving outcomes.
 */
export async function generateBulkThumbnails(
  items: NavigationItem[],
  forceRegenerate = false,
  onProgress?: (progress: BulkThumbnailProgress) => void,
  getLatestItems?: () => NavigationItem[]
): Promise<{
  updatedItems: NavigationItem[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}> {
  const eligibleItems = items.filter(isEligibleDrivePdf);
  const total = eligibleItems.length;
  let completed = 0;
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  const outcomeMap = new Map<string, { item: NavigationItem; baselineGeneratedAt?: string }>();

  for (const item of eligibleItems) {
    const fileId = extractGoogleDriveFileId(item.driveUrl);
    const isAuthoritativeThumbUrl = Boolean(
      item.thumbnailUrl && !item.thumbnailUrl.trim().startsWith('/thumbnails/')
    );

    // Skip if an authoritative thumbnail already exists and regeneration is not forced
    const isAlreadyDone =
      !forceRegenerate &&
      isAuthoritativeThumbUrl &&
      (item.thumbnailStatus === 'generated' || item.thumbnailStatus === 'ready') &&
      item.thumbnailFileId === fileId;

    if (isAlreadyDone) {
      completed++;
      skippedCount++;
      onProgress?.({
        total,
        completed,
        successCount,
        failureCount,
        skippedCount,
        currentItem: item,
      });
      continue;
    }

    const baselineGeneratedAt = item.thumbnailGeneratedAt;

    try {
      const result = await generateThumbnailForItem(item, forceRegenerate);
      outcomeMap.set(item.id, { item: result.item, baselineGeneratedAt });

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (err: any) {
      outcomeMap.set(item.id, {
        item: {
          ...item,
          thumbnailUrl:
            item.thumbnailFileId === fileId && isAuthoritativeThumbUrl ? item.thumbnailUrl : undefined,
          thumbnailStatus: 'failed',
          thumbnailFileId: fileId || item.thumbnailFileId,
          thumbnailError: err?.message || 'Penjanaan thumbnail gagal secara tidak dijangka.',
        },
        baselineGeneratedAt,
      });
      failureCount++;
    }

    completed++;
    onProgress?.({
      total,
      completed,
      successCount,
      failureCount,
      skippedCount,
      currentItem: item,
    });
  }

  const latestBaseList = await resolveLatestNavigationListForBulk(items, getLatestItems);
  const mergedList = latestBaseList.map((entry) => {
    const recorded = outcomeMap.get(entry.id);
    return recorded
      ? applyValidatedThumbnailOutcome(entry, recorded.item, recorded.baselineGeneratedAt)
      : entry;
  });

  // Persist only validated thumbnail outcomes merged onto the freshest navigation list
  if (successCount > 0 || failureCount > 0) {
    try {
      await saveNavigationItems(mergedList);
    } catch (saveErr) {
      console.warn('[PdfThumbnailService] Auto-save to Firestore notice:', saveErr);
    }
  }

  return {
    updatedItems: mergedList,
    successCount,
    failureCount,
    skippedCount,
  };
}

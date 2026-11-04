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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, auth } from '../config/firebase';
import { NavigationItem } from '../types';
import { saveNavigationItems } from './navigationService';
import { parseTakwimLink } from './takwimService';

// Configure PDF.js worker using local matching version to avoid version drift & CSP issues
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  } catch (_e) {
    // Ignore worker assignment error if already frozen
  }
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
 * Loads an image from URL into an offscreen Canvas
 */
async function renderImageUrlToCanvas(imageUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
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
 * Uploads generated thumbnail blob to Firebase Storage and returns public URL
 * Uses deterministic path without timestamps to avoid creating duplicate Storage files
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

  try {
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
  } catch (storageErr: any) {
    console.warn('[PdfThumbnailService] Firebase Storage upload notice:', storageErr?.message);
    // Reliable fallback: Persist to applet thumbnail storage
    try {
      const storeResp = await fetch(`/api/pdf/thumbnail-store?id=${encodeURIComponent(fileId)}&ext=${ext}`, {
        method: 'POST',
        headers: {
          'Content-Type': blob.type || 'image/webp',
        },
        body: blob,
      });

      if (storeResp.ok) {
        const storeData = await storeResp.json();
        if (storeData.url) {
          return storeData.url;
        }
      }
    } catch (storeErr: any) {
      console.warn('[PdfThumbnailService] Fallback store notice:', storeErr?.message);
    }

    throw storageErr;
  }
}

export interface ThumbnailGenerationResult {
  success: boolean;
  item: NavigationItem;
  error?: string;
}

/**
 * Generates thumbnail for a single navigation item
 * 
 * Process:
 * 1. Resolves fileId & resourcekey from driveUrl
 * 2. Fetches PDF bytes from /api/pdf/proxy?id={fileId}&resourcekey={resourcekey}
 * 3. Validates PDF magic header
 * 4. Renders Page 1 with PDF.js on Canvas
 * 5. Fallback: If PDF.js buffer fails, loads direct page 1 preview from /api/pdf/thumbnail-source
 * 6. Converts Canvas to WebP blob
 * 7. Uploads to Firebase Storage
 * 8. Returns updated NavigationItem with status: 'generated' or 'failed'
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

  // Caching: Avoid re-generation if thumbnail already exists and source file ID matches
  const isAlreadyGenerated =
    item.thumbnailUrl &&
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

  // Tier 1: Fetch actual PDF stream via authorized proxy and render page 1 using PDF.js
  try {
    const proxyUrl = `/api/pdf/proxy?id=${encodeURIComponent(fileId)}${rKeyParam}`;
    const response = await fetch(proxyUrl);
    if (response.ok) {
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
    } else {
      try {
        const errorData = await response.json();
        lastError = errorData?.error || `Pelayan Google Drive membalas status HTTP ${response.status}.`;
      } catch {
        lastError = `Ralat muat turun HTTP ${response.status}.`;
      }
    }
  } catch (pdfErr: any) {
    console.warn('[PdfThumbnailService] Tier 1 Notice (PDF.js buffer):', pdfErr?.message || pdfErr);
    lastError = pdfErr?.message || 'Gagal memproses bait fail PDF.';
  }

  // Tier 2 Fallback: Fetch direct page 1 thumbnail from /api/pdf/thumbnail-source
  if (!canvas) {
    try {
      const sourceUrl = `/api/pdf/thumbnail-source?id=${encodeURIComponent(fileId)}${rKeyParam}`;
      canvas = await renderImageUrlToCanvas(sourceUrl);
    } catch (sourceErr: any) {
      console.warn('[PdfThumbnailService] Tier 2 Notice (Direct Preview):', sourceErr?.message || sourceErr);
      if (!lastError) {
        lastError = sourceErr?.message || 'Gagal mendapatkan pratonton daripada Google Drive.';
      }
    }
  }

  if (!canvas) {
    const detailedError = lastError || 'Gagal menjana lakaran kenit (thumbnail) daripada dokumen sumber.';
    return {
      success: false,
      item: {
        ...item,
        thumbnailStatus: 'failed',
        thumbnailFileId: fileId,
        thumbnailError: detailedError,
      },
      error: detailedError,
    };
  }

  try {
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
  } catch (uploadErr: any) {
    console.error('[PdfThumbnailService] Storage Upload Error:', uploadErr);
    const errText = `Ralat muat naik ke Firebase Storage: ${uploadErr?.message || uploadErr}`;
    return {
      success: false,
      item: {
        ...item,
        thumbnailStatus: 'failed',
        thumbnailFileId: fileId,
        thumbnailError: errText,
      },
      error: errText,
    };
  }
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
 */
export async function generateBulkThumbnails(
  items: NavigationItem[],
  forceRegenerate = false,
  onProgress?: (progress: BulkThumbnailProgress) => void
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

  const resultMap = new Map<string, NavigationItem>();
  items.forEach((item) => resultMap.set(item.id, item));

  for (const item of eligibleItems) {
    const fileId = extractGoogleDriveFileId(item.driveUrl);

    // Skip if already generated and not forced
    const isAlreadyDone =
      !forceRegenerate &&
      item.thumbnailUrl &&
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

    try {
      const result = await generateThumbnailForItem(item, forceRegenerate);
      resultMap.set(item.id, result.item);

      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    } catch (_err) {
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

  const updatedList = Array.from(resultMap.values());

  // If any changes occurred, persist to Firestore
  if (successCount > 0 || failureCount > 0) {
    try {
      await saveNavigationItems(updatedList);
    } catch (saveErr) {
      console.warn('[PdfThumbnailService] Auto-save to Firestore notice:', saveErr);
    }
  }

  return {
    updatedItems: updatedList,
    successCount,
    failureCount,
    skippedCount,
  };
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — DEDICATED PLATFORM MANAGEMENT SERVICE
 * SYNCROZZ ENGINEERING STANDARD
 *
 * Firestore Path: /platforms/directkpmbp/platformLinks/{platformId}
 * Storage Path:   /platforms/directkpmbp/platform_assets/{assetFile}
 * Strictly isolated from /platforms/directkpmbp/portalLinks/{portalId}.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  db,
  auth,
  storage,
  effectiveFirebaseConfig,
  getPlatformStoragePath,
  OperationType,
  handleFirestoreError,
} from '../config/firebase';
import {
  PlatformLink,
  PlatformSubscriptionResult,
  PlatformThumbnailSource,
} from '../types';
import {
  sanitizeFirestorePayload,
  optimizeImageFile,
} from './portalService';

const PLATFORMS_PATH = 'platforms/directkpmbp/platformLinks';
const PLATFORM_ASSETS_PREFIX = 'platforms/directkpmbp/platform_assets/';
const PLATFORM_SNAPSHOT_PREFIX = 'platforms/directkpmbp/thumbnails/platform_snapshot_';
const VALID_THUMBNAIL_SOURCES: PlatformThumbnailSource[] = [
  'homepage_snapshot',
  'og_image',
  'favicon',
  'custom_upload',
  'placeholder',
];
const snapshotUrlCache = new Map<string, string>();
const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/gif',
];

async function ensureFreshAuthToken(): Promise<void> {
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      console.warn('[PlatformService] Notice refreshing ID token:', e);
    }
  }
}

export function normalizePlatformUrl(raw: string): string {
  let cleanUrl = (raw || '').trim();
  if (!cleanUrl) return '';

  // Fix accidental double-paste (str + str)
  if (cleanUrl.length > 8 && cleanUrl.length % 2 === 0) {
    const half = cleanUrl.length / 2;
    if (cleanUrl.slice(0, half) === cleanUrl.slice(half)) {
      cleanUrl = cleanUrl.slice(0, half);
    }
  }

  const urlMatches = cleanUrl.match(/https?:\/\/[^\s]+/gi);
  if (urlMatches && urlMatches.length > 1) {
    cleanUrl = urlMatches[0];
  }

  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }

  return cleanUrl.slice(0, 2000);
}

/**
 * Extracts a Firebase Storage object path from a download URL ONLY when it
 * belongs to this project's bucket and is scoped under platform_assets/ or
 * platform-owned thumbnails/platform_snapshot_*.
 * (Never touches PDF thumbnails under thumbnails/{fileId}.{ext}.)
 */
export function extractPlatformStoragePath(url?: string): string | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const bucket = effectiveFirebaseConfig.storageBucket;
    if (
      parsed.hostname === 'firebasestorage.googleapis.com' &&
      parsed.pathname.includes(`/v0/b/${bucket}/o/`)
    ) {
      const encodedPath = parsed.pathname.split(`/v0/b/${bucket}/o/`)[1];
      if (!encodedPath) return null;
      const decodedPath = decodeURIComponent(encodedPath);
      if (
        decodedPath.startsWith(PLATFORM_ASSETS_PREFIX) ||
        decodedPath.startsWith(PLATFORM_SNAPSHOT_PREFIX)
      ) {
        return decodedPath;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Safely deletes Firebase Storage platform assets ONLY if they are not
 * referenced by any remaining document in /platforms/directkpmbp/platformLinks.
 */
async function deleteUnusedPlatformAssets(
  excludedPlatformId: string,
  candidateUrls: Array<string | undefined>
): Promise<void> {
  const uniquePaths = new Map<string, string>();
  for (const url of candidateUrls) {
    if (!url) continue;
    const path = extractPlatformStoragePath(url);
    if (path) {
      uniquePaths.set(url.trim(), path);
    }
  }

  if (uniquePaths.size === 0) return;

  // Check all remaining platform records before deleting any shared Storage asset
  const remainingReferencedUrls = new Set<string>();
  const remainingReferencedPaths = new Set<string>();
  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'platformLinks');
    const snap = await getDocs(colRef);
    snap.forEach((docSnap) => {
      if (docSnap.id === excludedPlatformId) return;
      const data = docSnap.data() as Partial<PlatformLink>;
      [data.logoUrl, data.thumbnailUrl].forEach((refUrl) => {
        if (!refUrl) return;
        const cleanRefUrl = refUrl.trim();
        remainingReferencedUrls.add(cleanRefUrl);
        const refPath = extractPlatformStoragePath(cleanRefUrl);
        if (refPath) remainingReferencedPaths.add(refPath);
      });
    });
  } catch (scanErr) {
    // Fail-safe: do NOT delete assets if reference scan could not complete
    console.warn('[PlatformService] Aborting asset cleanup because reference check failed:', scanErr);
    return;
  }

  for (const [assetUrl, storagePath] of uniquePaths.entries()) {
    if (remainingReferencedUrls.has(assetUrl) || remainingReferencedPaths.has(storagePath)) {
      continue;
    }

    try {
      await deleteObject(ref(storage, storagePath));
      snapshotUrlCache.delete(storagePath);
    } catch (delErr: any) {
      if (delErr?.code !== 'storage/object-not-found') {
        console.warn(`[PlatformService] Storage asset deletion notice for "${storagePath}":`, delErr);
      }
    }
  }
}

/**
 * Safely deletes a single temporary session-uploaded platform asset if no
 * platform record in Firestore references it.
 */
export async function cleanupOrphanPlatformAssetUrl(
  assetUrl: string,
  excludedPlatformId = ''
): Promise<void> {
  if (!auth.currentUser || !assetUrl) return;
  await deleteUnusedPlatformAssets(excludedPlatformId, [assetUrl]);
}

/**
 * Fetch all platform records from Firestore once.
 * Returns empty list when collection is empty (never injects dummy records).
 */
export async function fetchPlatformLinks(): Promise<PlatformSubscriptionResult> {
  try {
    const colRef = collection(db, 'platforms', 'directkpmbp', 'platformLinks');
    const snapshot = await getDocs(colRef);

    const platforms: PlatformLink[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as PlatformLink;
      platforms.push({
        ...data,
        id: docSnap.id,
      });
    });

    platforms.sort((a, b) => {
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.name || '').localeCompare(b.name || '');
    });

    return {
      platforms,
      status: platforms.length > 0 ? 'ready_migrated' : 'ready_empty',
    };
  } catch (error: any) {
    const isPermission =
      error?.code === 'permission-denied' ||
      String(error?.message || '').toLowerCase().includes('permission');

    return {
      platforms: [],
      status: isPermission ? 'permission_denied' : 'error_network',
      errorMessage: error?.message || 'Ralat membaca rekod platform dari Firestore.',
    };
  }
}

/**
 * Real-time listener for platform records at /platforms/directkpmbp/platformLinks.
 * Strictly read-only for public users; never auto-creates dummy data.
 */
export function subscribeToPlatformLinks(
  callback: (result: PlatformSubscriptionResult) => void
): () => void {
  const colRef = collection(db, 'platforms', 'directkpmbp', 'platformLinks');

  return onSnapshot(
    colRef,
    (snapshot) => {
      const platforms: PlatformLink[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as PlatformLink;
        platforms.push({
          ...data,
          id: docSnap.id,
        });
      });

      platforms.sort((a, b) => {
        const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.name || '').localeCompare(b.name || '');
      });

      callback({
        platforms,
        status: platforms.length > 0 ? 'ready_migrated' : 'ready_empty',
      });
    },
    (err: any) => {
      console.warn('[PlatformService] Notice on snapshot listener:', err);
      const isPermissionDenied =
        err?.code === 'permission-denied' ||
        String(err?.message || '').toLowerCase().includes('insufficient permissions') ||
        String(err?.message || '').toLowerCase().includes('permission-denied');

      callback({
        platforms: [],
        status: isPermissionDenied ? 'permission_denied' : 'error_network',
        errorMessage: isPermissionDenied
          ? 'Akses Firestore ditolak oleh peraturan keselamatan. Sila pastikan firestore.rules telah diterbitkan.'
          : err?.message || 'Gagal menghubungi pelayan Firestore (Ralat Rangkaian).',
      });
    }
  );
}

/**
 * Create or update a platform record in /platforms/directkpmbp/platformLinks/{platformId}.
 * Administrator-only write access enforced by Firestore Rules.
 */
export async function savePlatformLink(platform: PlatformLink): Promise<boolean> {
  const rawId = (platform.id || `platform_${Date.now()}`).trim().replace(/[^a-zA-Z0-9_.-]/g, '_');
  const docId = rawId.slice(0, 128) || `platform_${Date.now()}`;
  const docPath = `${PLATFORMS_PATH}/${docId}`;

  await ensureFreshAuthToken();

  const cleanUrl = normalizePlatformUrl(platform.url);
  const cleanName = (platform.name || '').trim().slice(0, 200);
  const cleanDescription = (platform.description || '').trim().slice(0, 1000);
  const cleanLogoUrl = (platform.logoUrl || '').trim().slice(0, 2000);
  const cleanThumbnailUrl = (platform.thumbnailUrl || '').trim().slice(0, 2000);

  if (!cleanName) {
    throw new Error('Nama platform tidak boleh kosong.');
  }
  if (!cleanUrl || !/^https?:\/\/.+/i.test(cleanUrl)) {
    throw new Error('URL platform tidak sah. Sila pastikan bermula dengan http:// atau https://.');
  }
  if (cleanLogoUrl && !/^https?:\/\/.+/i.test(cleanLogoUrl)) {
    throw new Error('URL logo mestilah pautan HTTPS/HTTP atau URL muat naik Firebase Storage yang sah.');
  }
  if (cleanThumbnailUrl && !/^https?:\/\/.+/i.test(cleanThumbnailUrl)) {
    throw new Error('URL thumbnail mestilah pautan HTTPS/HTTP atau URL muat naik Firebase Storage yang sah.');
  }

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'platformLinks', docId);
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Partial<PlatformLink>) : null;
    const nowIso = new Date().toISOString();

    const validThumbSource =
      platform.thumbnailSource && VALID_THUMBNAIL_SOURCES.includes(platform.thumbnailSource)
        ? platform.thumbnailSource
        : undefined;
    const cleanThumbGeneratedAt =
      typeof platform.thumbnailGeneratedAt === 'string' && platform.thumbnailGeneratedAt.trim()
        ? platform.thumbnailGeneratedAt.trim().slice(0, 64)
        : undefined;

    const payload: Record<string, any> = {
      id: docId,
      name: cleanName,
      url: cleanUrl,
      description: cleanDescription,
      logoUrl: cleanLogoUrl,
      thumbnailUrl: cleanThumbnailUrl,
      ...(validThumbSource ? { thumbnailSource: validThumbSource } : {}),
      ...(cleanThumbGeneratedAt ? { thumbnailGeneratedAt: cleanThumbGeneratedAt } : {}),
      sortOrder: Math.min(9999, Math.max(0, Number.isFinite(Number(platform.sortOrder)) ? Number(platform.sortOrder) : 1)),
      isActive: platform.isActive !== false,
      createdAt: existingData?.createdAt || platform.createdAt || nowIso,
      updatedAt: nowIso,
      updatedBy: auth.currentUser?.email || 'admin',
      ...(platform.detectedMeta ? { detectedMeta: platform.detectedMeta } : {}),
    };

    const safeData = sanitizeFirestorePayload(payload);
    await setDoc(docRef, safeData, { merge: true });

    // Clean up replaced Firebase Storage assets if no longer referenced elsewhere
    if (existingData) {
      const replacedAssets: string[] = [];
      if (existingData.logoUrl && existingData.logoUrl !== cleanLogoUrl) {
        replacedAssets.push(existingData.logoUrl);
      }
      if (existingData.thumbnailUrl && existingData.thumbnailUrl !== cleanThumbnailUrl) {
        replacedAssets.push(existingData.thumbnailUrl);
      }
      if (replacedAssets.length > 0) {
        await deleteUnusedPlatformAssets(docId, replacedAssets);
      }
    }

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

/**
 * Delete a platform record from /platforms/directkpmbp/platformLinks/{platformId}
 * and safely remove unreferenced Firebase Storage assets owned by this record.
 */
export async function deletePlatformLink(platformId: string): Promise<boolean> {
  const docPath = `${PLATFORMS_PATH}/${platformId}`;
  await ensureFreshAuthToken();

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'platformLinks', platformId);
    const existingSnap = await getDoc(docRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Partial<PlatformLink>) : null;

    await deleteDoc(docRef);

    if (existingData) {
      await deleteUnusedPlatformAssets(platformId, [
        existingData.logoUrl,
        existingData.thumbnailUrl,
      ]);
    }

    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

/**
 * Toggle visibility (isActive) for a platform record.
 */
export async function togglePlatformVisibility(platformId: string, isActive: boolean): Promise<boolean> {
  const docPath = `${PLATFORMS_PATH}/${platformId}`;
  await ensureFreshAuthToken();

  try {
    const docRef = doc(db, 'platforms', 'directkpmbp', 'platformLinks', platformId);
    await updateDoc(docRef, {
      isActive,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

/**
 * Upload a custom platform logo or thumbnail image directly to Firebase Storage.
 * Fails explicitly on unauthenticated sessions, unprovisioned Storage buckets (404),
 * or Storage permission errors — never masks failed uploads with DataURLs.
 */
export async function uploadPlatformAsset(
  file: File,
  type: 'logo' | 'thumbnail'
): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('Pengesahan pentadbir Firebase Auth diperlukan sebelum memuat naik imej ke Firebase Storage.');
  }

  await ensureFreshAuthToken();

  const isAllowedMime = ALLOWED_IMAGE_MIME_TYPES.includes(file.type);
  const isAllowedExt = Boolean(file.name.match(/\.(jpg|jpeg|png|webp|svg|ico|gif)$/i));
  if (!isAllowedMime && !isAllowedExt) {
    throw new Error('Format fail tidak sah. Sila pilih fail imej (PNG, JPG, WebP, SVG, ICO, atau GIF).');
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Saiz fail asal melebihi had 15MB. Sila pilih imej yang lebih kecil.');
  }

  const maxWidth = type === 'logo' ? 256 : 800;
  const maxHeight = type === 'logo' ? 256 : 500;
  const { blob: optimizedBlob } = await optimizeImageFile(
    file,
    maxWidth,
    maxHeight,
    type === 'logo' ? 0.88 : 0.82
  );

  if (optimizedBlob.size > 5 * 1024 * 1024) {
    throw new Error('Saiz imej selepas pemampatan melebihi had 5MB yang dibenarkan oleh peraturan Firebase Storage.');
  }

  const resolvedMime =
    optimizedBlob.type && ALLOWED_IMAGE_MIME_TYPES.includes(optimizedBlob.type)
      ? optimizedBlob.type
      : isAllowedMime
        ? file.type
        : 'image/webp';

  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.[^.]+$/, '');
  const ext = resolvedMime === 'image/svg+xml' ? 'svg' : 'webp';
  const subPath = `platform_assets/${type}_${Date.now()}_${cleanName}.${ext}`;
  const fullPath = getPlatformStoragePath(subPath);

  const storageRef = ref(storage, fullPath);
  const metadata = {
    contentType: resolvedMime,
    customMetadata: {
      uploadedBy: auth.currentUser.email || 'admin',
      uploadedAt: new Date().toISOString(),
    },
  };

  try {
    const uploadPromise = async () => {
      const snap = await uploadBytes(storageRef, optimizedBlob, metadata);
      return await getDownloadURL(snap.ref);
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('storage/timeout: Masa tamat menghubungi Firebase Storage.')), 12000);
    });

    return await Promise.race([uploadPromise(), timeoutPromise]);
  } catch (err: any) {
    const code = err?.code || '';
    const msg = String(err?.message || '');
    if (code === 'storage/unauthorized') {
      throw new Error('Muat naik ditolak oleh Storage Rules (storage/unauthorized). Pastikan akaun pentadbir disahkan dan storage.rules telah diterbitkan.');
    }
    if (
      code === 'storage/bucket-not-found' ||
      code === 'storage/project-not-found' ||
      msg.includes('404') ||
      msg.includes('Not Found')
    ) {
      throw new Error(`Bucket Firebase Storage (${effectiveFirebaseConfig.storageBucket}) belum diaktifkan atau tidak ditemui (404). Sila aktifkan Storage di Firebase Console.`);
    }
    throw new Error(msg || 'Gagal memuat naik aset ke Firebase Storage.');
  }
}

export interface HomepageSnapshotUploadSuccess {
  ok: true;
  thumbnailUrl: string;
  thumbnailSource: 'homepage_snapshot';
  thumbnailGeneratedAt: string;
  storagePath: string;
  width: number;
  height: number;
  sizeBytes: number;
  sha256: string;
  reusedExisting: boolean;
}

export interface HomepageSnapshotUploadFailure {
  ok: false;
  code: string;
  error: string;
}

export type HomepageSnapshotUploadResult =
  | HomepageSnapshotUploadSuccess
  | HomepageSnapshotUploadFailure;

/**
 * Requests a server-side first-viewport homepage screenshot (1440x810 -> 640x360 WebP)
 * using the Master Admin Firebase ID token, then uploads the optimized WebP directly
 * to Firebase Storage under platforms/directkpmbp/thumbnails/ while avoiding duplicates.
 */
export async function requestPlatformHomepageSnapshot(
  targetUrl: string,
  existingThumbnailUrl?: string
): Promise<HomepageSnapshotUploadResult> {
  if (!auth.currentUser) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      error: 'Pengesahan pentadbir Firebase Auth diperlukan sebelum menjana snapshot.',
    };
  }

  let idToken: string;
  try {
    idToken = await auth.currentUser.getIdToken(true);
  } catch (err: any) {
    return {
      ok: false,
      code: 'AUTH_TOKEN_ERROR',
      error: err?.message || 'Gagal mendapatkan token pengesahan Firebase.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  let json: any;
  try {
    const res = await fetch('/api/platform/snapshot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ url: normalizePlatformUrl(targetUrl) }),
      signal: controller.signal,
    });
    json = await res.json().catch(() => null);
    if (!res.ok || !json?.success || !json?.data?.imageBase64) {
      return {
        ok: false,
        code: json?.code || `HTTP_${res.status}`,
        error: json?.error || `Penjanaan snapshot gagal (HTTP ${res.status}).`,
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      code: err?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
      error:
        err?.name === 'AbortError'
          ? 'Masa menunggu tamat semasa menjana snapshot halaman utama.'
          : err?.message || 'Gagal menghubungi perkhidmatan snapshot pelayan.',
    };
  } finally {
    clearTimeout(timeout);
  }

  const snap = json.data as {
    mimeType: string;
    width: number;
    height: number;
    sizeBytes: number;
    sha256: string;
    imageBase64: string;
    finalUrl: string;
  };

  if (snap.mimeType !== 'image/webp' || snap.width !== 640 || snap.height !== 360) {
    return {
      ok: false,
      code: 'INVALID_OUTPUT',
      error: 'Output snapshot tidak memenuhi spesifikasi WebP 640x360.',
    };
  }

  // Decode base64 WebP bytes cleanly
  const binaryString = atob(snap.imageBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
    return {
      ok: false,
      code: 'INVALID_SIZE',
      error: 'Saiz fail WebP snapshot melebihi had 5MB Firebase Storage.',
    };
  }

  let hostSlug = 'platform';
  try {
    const parsedHost = new URL(snap.finalUrl || targetUrl).hostname.replace(/^www\./i, '');
    hostSlug = parsedHost.replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 48) || 'platform';
  } catch {
    hostSlug = 'platform';
  }

  const shaPrefix = (snap.sha256 || '').replace(/[^a-f0-9]/gi, '').slice(0, 16) || String(Date.now());
  const subPath = `thumbnails/platform_snapshot_${hostSlug}_${shaPrefix}.webp`;
  const fullPath = getPlatformStoragePath(subPath);
  const generatedAt = new Date().toISOString();

  // Avoid duplicate uploads when identical content hash already matches existing or cached URL
  const existingPath = extractPlatformStoragePath(existingThumbnailUrl);
  if (existingPath === fullPath && existingThumbnailUrl) {
    snapshotUrlCache.set(fullPath, existingThumbnailUrl);
    return {
      ok: true,
      thumbnailUrl: existingThumbnailUrl,
      thumbnailSource: 'homepage_snapshot',
      thumbnailGeneratedAt: generatedAt,
      storagePath: fullPath,
      width: snap.width,
      height: snap.height,
      sizeBytes: bytes.length,
      sha256: snap.sha256,
      reusedExisting: true,
    };
  }

  const cachedUrl = snapshotUrlCache.get(fullPath);
  if (cachedUrl) {
    return {
      ok: true,
      thumbnailUrl: cachedUrl,
      thumbnailSource: 'homepage_snapshot',
      thumbnailGeneratedAt: generatedAt,
      storagePath: fullPath,
      width: snap.width,
      height: snap.height,
      sizeBytes: bytes.length,
      sha256: snap.sha256,
      reusedExisting: true,
    };
  }

  const webpBlob = new Blob([bytes], { type: 'image/webp' });
  const storageRef = ref(storage, fullPath);
  const metadata = {
    contentType: 'image/webp',
    customMetadata: {
      uploadedBy: auth.currentUser.email || 'admin',
      uploadedAt: generatedAt,
      sourceUrl: (snap.finalUrl || targetUrl).slice(0, 500),
      sha256: snap.sha256,
      dimensions: '640x360',
    },
  };

  try {
    const uploadPromise = async () => {
      const uploadedSnap = await uploadBytes(storageRef, webpBlob, metadata);
      return await getDownloadURL(uploadedSnap.ref);
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('storage/timeout: Masa tamat menghubungi Firebase Storage.')), 12000);
    });

    const downloadUrl = await Promise.race([uploadPromise(), timeoutPromise]);
    snapshotUrlCache.set(fullPath, downloadUrl);

    return {
      ok: true,
      thumbnailUrl: downloadUrl,
      thumbnailSource: 'homepage_snapshot',
      thumbnailGeneratedAt: generatedAt,
      storagePath: fullPath,
      width: snap.width,
      height: snap.height,
      sizeBytes: bytes.length,
      sha256: snap.sha256,
      reusedExisting: false,
    };
  } catch (err: any) {
    const code = err?.code || 'STORAGE_UPLOAD_FAILED';
    const msg = String(err?.message || '');
    if (code === 'storage/unauthorized') {
      return {
        ok: false,
        code,
        error: 'Muat naik snapshot ditolak oleh Storage Rules (storage/unauthorized).',
      };
    }
    return {
      ok: false,
      code,
      error: msg || 'Gagal menyimpan snapshot ke Firebase Storage.',
    };
  }
}

export interface ResolvedPlatformVisual {
  thumbnail?: string;
  logo?: string;
  source:
    | 'homepage_snapshot'
    | 'custom_upload'
    | 'custom_thumbnail'
    | 'og_image'
    | 'custom_logo'
    | 'pwa_icon'
    | 'favicon'
    | 'placeholder';
}

export function resolvePlatformVisual(platform: {
  url: string;
  logoUrl?: string;
  thumbnailUrl?: string;
  thumbnailSource?: PlatformThumbnailSource;
  detectedMeta?: {
    ogImage?: string;
    favicon?: string;
    pwaIcon?: string;
  };
}): ResolvedPlatformVisual {
  const savedThumb = platform.thumbnailUrl?.trim();
  const ogImage = platform.detectedMeta?.ogImage?.trim();
  const customLogo = platform.logoUrl?.trim();
  const pwaIcon = platform.detectedMeta?.pwaIcon?.trim();
  const favicon = platform.detectedMeta?.favicon?.trim();

  let googleFav = '';
  try {
    const host = new URL(platform.url).hostname;
    if (host) {
      googleFav = `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
    }
  } catch {
    // ignore invalid url
  }

  const logo = customLogo || pwaIcon || favicon || googleFav || undefined;

  if (platform.thumbnailSource === 'custom_upload' && savedThumb) {
    return { thumbnail: savedThumb, logo, source: 'custom_upload' };
  }
  if (platform.thumbnailSource === 'homepage_snapshot' && savedThumb) {
    return { thumbnail: savedThumb, logo, source: 'homepage_snapshot' };
  }
  if (platform.thumbnailSource === 'og_image' && (savedThumb || ogImage)) {
    return { thumbnail: savedThumb || ogImage, logo, source: 'og_image' };
  }
  if (platform.thumbnailSource === 'favicon') {
    return { thumbnail: undefined, logo, source: 'favicon' };
  }
  if (platform.thumbnailSource === 'placeholder') {
    return { thumbnail: undefined, logo: customLogo || pwaIcon || favicon || undefined, source: 'placeholder' };
  }

  const thumbnail = savedThumb || ogImage || undefined;
  let source: ResolvedPlatformVisual['source'] = 'placeholder';
  if (savedThumb) source = 'custom_thumbnail';
  else if (ogImage) source = 'og_image';
  else if (customLogo) source = 'custom_logo';
  else if (pwaIcon) source = 'pwa_icon';
  else if (favicon) source = 'favicon';

  return { thumbnail, logo, source };
}

export function getPlatformSiteName(platform: {
  url: string;
  detectedMeta?: { ogSiteName?: string };
}): string {
  if (platform.detectedMeta?.ogSiteName && platform.detectedMeta.ogSiteName.trim()) {
    return platform.detectedMeta.ogSiteName.trim();
  }
  try {
    const parsed = new URL(platform.url);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return platform.url.replace(/^https?:\/\//i, '').split('/')[0] || 'Platform Luar';
  }
}

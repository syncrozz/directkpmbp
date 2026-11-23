/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * DIRECTKPMBP — HOMEPAGE VISUAL SNAPSHOT ENGINE (SES v4.5)
 *
 * Captures the actual first desktop viewport (1440x810) of a validated external
 * URL using headless Chromium (playwright-core), enforces strict SSRF network
 * interception on every navigation, redirect, and subresource request, and
 * optimizes output to 640x360 WebP (< 100 KB target, quality 75-80%) via sharp.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import { URL } from 'node:url';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';
import sharp from 'sharp';
import { validateSafeUrl } from './serverMetadata.ts';

export const SNAPSHOT_VIEWPORT = { width: 1440, height: 810 } as const;
export const SNAPSHOT_OUTPUT = { width: 640, height: 360, format: 'webp' as const };

const MAX_CONCURRENT_CAPTURES = 2;
const MAX_QUEUED_CAPTURES = 4;
const MAX_REDIRECT_HOPS = 5;
const NAVIGATION_TIMEOUT_MS = 10000;
const NETWORK_SETTLE_TIMEOUT_MS = 2200;
const FONT_SETTLE_TIMEOUT_MS = 1200;
const VISUAL_SETTLE_DELAY_MS = 600;
const HARD_CAPTURE_DEADLINE_MS = 16000;
const MAX_RAW_SCREENSHOT_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES_LIMIT = 5 * 1024 * 1024;
const TARGET_OUTPUT_KB_BYTES = 100 * 1024;

export type SnapshotErrorCode =
  | 'INVALID_URL'
  | 'SSRF_BLOCKED'
  | 'BROWSER_UNAVAILABLE'
  | 'CONCURRENCY_LIMIT'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'CAPTURE_FAILED';

export interface HomepageSnapshotSuccess {
  success: true;
  mimeType: 'image/webp';
  width: 640;
  height: 360;
  sizeBytes: number;
  sha256: string;
  imageBase64: string;
  finalUrl: string;
  durationMs: number;
}

export interface HomepageSnapshotFailure {
  success: false;
  code: SnapshotErrorCode;
  error: string;
  statusCode: number;
}

export type HomepageSnapshotResult = HomepageSnapshotSuccess | HomepageSnapshotFailure;

let activeCaptures = 0;
let queuedCaptures = 0;
const waitQueue: Array<() => void> = [];
const inFlightCaptures = new Map<string, Promise<HomepageSnapshotResult>>();

function acquireCaptureSlot(): Promise<void> {
  if (activeCaptures < MAX_CONCURRENT_CAPTURES) {
    activeCaptures++;
    return Promise.resolve();
  }
  if (queuedCaptures >= MAX_QUEUED_CAPTURES) {
    return Promise.reject(new Error('CONCURRENCY_LIMIT'));
  }
  queuedCaptures++;
  return new Promise<void>((resolve) => {
    waitQueue.push(() => {
      queuedCaptures--;
      activeCaptures++;
      resolve();
    });
  });
}

function releaseCaptureSlot(): void {
  activeCaptures = Math.max(0, activeCaptures - 1);
  const next = waitQueue.shift();
  if (next) next();
}

function findPlaywrightDirExecutables(baseDir: string): string[] {
  const found: string[] = [];
  if (!baseDir || !fs.existsSync(baseDir)) {
    return found;
  }
  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const subDir = `${baseDir}/${entry.name}`;
      const candidates = [
        `${subDir}/chrome-headless-shell`,
        `${subDir}/chrome-headless-shell-linux64/chrome-headless-shell`,
        `${subDir}/chrome-linux64/chrome`,
        `${subDir}/chrome-linux/chrome`,
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          found.push(candidate);
        }
      }
    }
  } catch {
    // Ignore unreadable cache directories
  }
  return found;
}

/**
 * Automatically discovers headless Chromium executable without requiring manual env vars:
 * 1. Playwright `chromium.executablePath()`
 * 2. Supported container, Playwright cache, and system fallback paths
 */
export function resolveChromiumExecutablePath(): string | null {
  let playwrightExecutable: string | undefined;
  try {
    playwrightExecutable = chromium.executablePath();
  } catch {
    playwrightExecutable = undefined;
  }

  const homeDir = process.env.HOME || '';
  const configuredBrowsersDir = (process.env.PLAYWRIGHT_BROWSERS_PATH || '').trim();
  const candidates: Array<string | undefined> = [
    playwrightExecutable,
    ...(configuredBrowsersDir ? findPlaywrightDirExecutables(configuredBrowsersDir) : []),
    '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell',
    ...findPlaywrightDirExecutables('/ms-playwright'),
    ...(homeDir ? findPlaywrightDirExecutables(`${homeDir}/.cache/ms-playwright`) : []),
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function optimizeScreenshotToWebp(rawPng: Buffer): Promise<{
  buffer: Buffer;
  width: 640;
  height: 360;
}> {
  // Primary quality 78 inside 75-80% spec; top-aligned cover preserves 16:9 first viewport without distortion
  let webpBuffer = await sharp(rawPng)
    .resize(SNAPSHOT_OUTPUT.width, SNAPSHOT_OUTPUT.height, {
      fit: 'cover',
      position: 'top',
    })
    .webp({ quality: 78, effort: 4 })
    .toBuffer();

  // If image complexity pushes above 100 KB, step cleanly to quality 75 (still within 75-80%)
  if (webpBuffer.length > TARGET_OUTPUT_KB_BYTES) {
    const compactBuffer = await sharp(rawPng)
      .resize(SNAPSHOT_OUTPUT.width, SNAPSHOT_OUTPUT.height, {
        fit: 'cover',
        position: 'top',
      })
      .webp({ quality: 75, effort: 5 })
      .toBuffer();
    if (compactBuffer.length < webpBuffer.length) {
      webpBuffer = compactBuffer;
    }
  }

  if (webpBuffer.length === 0 || webpBuffer.length > MAX_OUTPUT_BYTES_LIMIT) {
    throw new Error('Saiz thumbnail WebP yang dijana melebihi had yang dibenarkan.');
  }

  const meta = await sharp(webpBuffer).metadata();
  if (meta.format !== 'webp' || meta.width !== SNAPSHOT_OUTPUT.width || meta.height !== SNAPSHOT_OUTPUT.height) {
    throw new Error('Format atau dimensi thumbnail WebP yang dijana tidak sepadan dengan 640x360.');
  }

  return {
    buffer: webpBuffer,
    width: 640 as const,
    height: 360 as const,
  };
}

async function executeSnapshotCapture(validatedHref: string): Promise<HomepageSnapshotResult> {
  const startedAt = Date.now();
  const executablePath = resolveChromiumExecutablePath();
  if (!executablePath) {
    return {
      success: false,
      code: 'BROWSER_UNAVAILABLE',
      statusCode: 503,
      error:
        'Pelayar headless Chromium tidak ditemui secara automatik pada pelayan ini (Playwright dan laluan sistem tiada binari yang sah). Pastikan Chromium dipasang melalui Playwright atau pakej sistem.',
    };
  }

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let abortedByDeadline = false;

  const hardTimer = setTimeout(() => {
    abortedByDeadline = true;
    browser?.close().catch(() => {});
  }, HARD_CAPTURE_DEADLINE_MS);

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
      ],
    });

    context = await browser.newContext({
      viewport: SNAPSHOT_VIEWPORT,
      deviceScaleFactor: 1,
      javaScriptEnabled: true,
      acceptDownloads: false,
      ignoreHTTPSErrors: false,
      locale: 'ms-MY',
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    const hostSafetyCache = new Map<string, { safe: boolean; checkedAt: number }>();
    let ssrfRejectionReason: string | null = null;

    await context.route('**/*', async (route) => {
      if (abortedByDeadline) {
        return route.abort('timedout').catch(() => {});
      }

      const request = route.request();
      const reqUrl = request.url();
      const isNav = request.isNavigationRequest();
      const resourceType = request.resourceType();

      // Block heavy/streaming or non-rendering background resource types
      if (['media', 'websocket', 'eventsource', 'manifest'].includes(resourceType)) {
        return route.abort('blockedbyclient').catch(() => {});
      }

      let parsed: URL;
      try {
        parsed = new URL(reqUrl);
      } catch {
        return route.abort('blockedbyclient').catch(() => {});
      }

      // Allow inline data/blob URLs ONLY for non-navigation subresources (inline fonts/SVGs/CSS images)
      if (!isNav && (parsed.protocol === 'data:' || parsed.protocol === 'blob:')) {
        return route.continue().catch(() => {});
      }

      // Strictly block non-HTTP(S) protocols (file:, ftp:, chrome:, javascript:, etc.)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        if (isNav) {
          ssrfRejectionReason = 'Protokol destinasi tidak dibenarkan (SSRF Guard).';
        }
        return route.abort('blockedbyclient').catch(() => {});
      }

      // Enforce redirect hop limit on navigations
      if (isNav) {
        let hops = 0;
        let prev = request.redirectedFrom();
        while (prev) {
          hops++;
          if (hops > MAX_REDIRECT_HOPS) {
            ssrfRejectionReason = 'Terlalu banyak lencongan (redirect) URL melebihi had keselamatan.';
            return route.abort('blockedbyclient').catch(() => {});
          }
          prev = prev.redirectedFrom();
        }
      }

      // Always revalidate navigation & redirect destinations via fresh DNS + IP check;
      // subresource hosts use a tight 10-second per-capture cache to prevent DNS rebinding while avoiding stalls
      const hostKey = parsed.hostname.toLowerCase();
      const cached = !isNav ? hostSafetyCache.get(hostKey) : undefined;
      if (cached && Date.now() - cached.checkedAt < 10000) {
        if (!cached.safe) {
          return route.abort('blockedbyclient').catch(() => {});
        }
        return route.continue().catch(() => {});
      }

      const safety = await validateSafeUrl(reqUrl);
      hostSafetyCache.set(hostKey, { safe: safety.safe, checkedAt: Date.now() });

      if (!safety.safe) {
        if (isNav) {
          ssrfRejectionReason = safety.error || 'Destinasi disekat oleh perlindungan SSRF.';
        }
        return route.abort('blockedbyclient').catch(() => {});
      }

      return route.continue().catch(() => {});
    });

    const page = await context.newPage();
    page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);

    const response = await page.goto(validatedHref, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    if (ssrfRejectionReason) {
      return {
        success: false,
        code: 'SSRF_BLOCKED',
        statusCode: 403,
        error: ssrfRejectionReason,
      };
    }

    if (!response) {
      return {
        success: false,
        code: 'CAPTURE_FAILED',
        statusCode: 502,
        error: 'Pelayan web sasaran tidak memulangkan respons HTML yang sah.',
      };
    }

    const status = response.status();
    if (status >= 400) {
      return {
        success: false,
        code: 'HTTP_ERROR',
        statusCode: 502,
        error: `Halaman sasaran membalas dengan status HTTP ${status}.`,
      };
    }

    const finalUrl = page.url();
    const finalCheck = await validateSafeUrl(finalUrl);
    if (!finalCheck.safe) {
      return {
        success: false,
        code: 'SSRF_BLOCKED',
        statusCode: 403,
        error: finalCheck.error || 'URL destinasi akhir disekat oleh SSRF Guard.',
      };
    }

    // Wait briefly for primary network assets and web fonts to paint cleanly without stalling on analytics
    await page.waitForLoadState('networkidle', { timeout: NETWORK_SETTLE_TIMEOUT_MS }).catch(() => {});
    await page
      .evaluate(async (fontTimeoutMs) => {
        window.scrollTo(0, 0);
        if (document.fonts && document.fonts.ready) {
          await Promise.race([
            document.fonts.ready,
            new Promise<void>((resolve) => setTimeout(resolve, fontTimeoutMs)),
          ]);
        }
      }, FONT_SETTLE_TIMEOUT_MS)
      .catch(() => {});

    await page.waitForTimeout(VISUAL_SETTLE_DELAY_MS);

    // Ensure viewport stays strictly at top-left first viewport (1440x810)
    const rawScreenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
      clip: { x: 0, y: 0, width: SNAPSHOT_VIEWPORT.width, height: SNAPSHOT_VIEWPORT.height },
      animations: 'disabled',
    });

    if (!rawScreenshot || rawScreenshot.length === 0 || rawScreenshot.length > MAX_RAW_SCREENSHOT_BYTES) {
      return {
        success: false,
        code: 'CAPTURE_FAILED',
        statusCode: 502,
        error: 'Saiz imej tangkapan skrin tidak sah atau melebihi had pelayan.',
      };
    }

    const optimized = await optimizeScreenshotToWebp(rawScreenshot);
    const sha256 = crypto.createHash('sha256').update(optimized.buffer).digest('hex');

    return {
      success: true,
      mimeType: 'image/webp',
      width: optimized.width,
      height: optimized.height,
      sizeBytes: optimized.buffer.length,
      sha256,
      imageBase64: optimized.buffer.toString('base64'),
      finalUrl,
      durationMs: Date.now() - startedAt,
    };
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    const isTimeout = abortedByDeadline || err?.name === 'TimeoutError' || msg.toLowerCase().includes('timeout');
    return {
      success: false,
      code: isTimeout ? 'TIMEOUT' : 'CAPTURE_FAILED',
      statusCode: isTimeout ? 504 : 502,
      error: isTimeout
        ? 'Masa menunggu tamat semasa menangkap paparan halaman utama platform.'
        : `Gagal menangkap paparan halaman utama: ${msg}`,
    };
  } finally {
    clearTimeout(hardTimer);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

/**
 * Validates URL safety, prevents duplicate concurrent captures, and executes
 * bounded headless homepage capture with 640x360 WebP optimization.
 */
export async function captureHomepageSnapshot(rawUrl: string): Promise<HomepageSnapshotResult> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed || trimmed.length > 2000) {
    return {
      success: false,
      code: 'INVALID_URL',
      statusCode: 400,
      error: 'Sila berikan URL platform yang sah (maksimum 2000 aksara).',
    };
  }

  const preflight = await validateSafeUrl(trimmed);
  if (!preflight.safe || !preflight.url) {
    const isSsrfBlock =
      (preflight.error || '').includes('SSRF') ||
      (preflight.error || '').includes('disekat') ||
      (preflight.error || '').includes('persendirian');
    return {
      success: false,
      code: isSsrfBlock ? 'SSRF_BLOCKED' : 'INVALID_URL',
      statusCode: isSsrfBlock ? 403 : 400,
      error: preflight.error || 'URL platform tidak sah atau disekat.',
    };
  }

  const normalizedHref = preflight.url.href;

  // Deduplicate simultaneous snapshot requests for the same URL
  const existingInFlight = inFlightCaptures.get(normalizedHref);
  if (existingInFlight) {
    return existingInFlight;
  }

  const runPromise = (async (): Promise<HomepageSnapshotResult> => {
    try {
      await acquireCaptureSlot();
    } catch {
      return {
        success: false,
        code: 'CONCURRENCY_LIMIT',
        statusCode: 429,
        error: 'Pelayan sedang sibuk memproses tangkapan skrin lain. Sila cuba sebentar lagi.',
      };
    }

    try {
      return await executeSnapshotCapture(normalizedHref);
    } finally {
      releaseCaptureSlot();
    }
  })();

  inFlightCaptures.set(normalizedHref, runPromise);
  try {
    return await runPromise;
  } finally {
    inFlightCaptures.delete(normalizedHref);
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Vercel Serverless Function — Smart URL Metadata Detection
 * Fully self-contained implementation using Node.js 22 built-ins (node:dns, node:url, fetch).
 * Eliminates cross-directory ESM module resolution failures on Vercel.
 */

import dns from 'node:dns';
import { URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ExtractedPortalMetadata {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogSiteName?: string;
  favicon?: string;
  fallbackFavicon?: string;
  manifestUrl?: string;
  manifestName?: string;
  manifestIcons?: Array<{ src: string; sizes?: string; type?: string }>;
}

/**
 * Checks whether an IP address belongs to private, loopback, or reserved networks.
 */
function isPrivateOrReservedIP(ip: string): boolean {
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv4 Checks
  if (ip.includes('.')) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) {
      return true;
    }

    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }

  // IPv6 Checks
  const normalized = ip.toLowerCase();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF attacks (private IPs, loopback, cloud metadata).
 */
async function validateSafeUrl(urlString: string): Promise<{ safe: boolean; error?: string; url?: URL }> {
  try {
    const url = new URL(urlString.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { safe: false, error: 'Protokol URL tidak sah. Hanya http:// dan https:// dibenarkan.' };
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === 'metadata.google.internal' ||
      hostname === '169.254.169.254'
    ) {
      return { safe: false, error: 'Akses ke hos tempatan/persendirian disekat (SSRF Guard).' };
    }

    try {
      const addresses = await dns.promises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { safe: false, error: 'Hos domain tidak dapat diselesaikan melalui DNS.' };
      }

      for (const item of addresses) {
        if (isPrivateOrReservedIP(item.address)) {
          return {
            safe: false,
            error: `Akses ke alamat IP rangkaian persendirian (${item.address}) disekat demi keselamatan.`,
          };
        }
      }
    } catch (dnsErr: any) {
      return { safe: false, error: `Ralat DNS semasa mencari domain: ${dnsErr?.message || dnsErr}` };
    }

    return { safe: true, url };
  } catch (_e) {
    return { safe: false, error: 'Format URL tidak sah.' };
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .trim();
}

function extractMeta(html: string, key: string): string | undefined {
  const p1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const m1 = html.match(p1);
  if (m1 && m1[1]) return decodeHtmlEntities(m1[1]);

  const p2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const m2 = html.match(p2);
  if (m2 && m2[1]) return decodeHtmlEntities(m2[1]);

  return undefined;
}

function extractLinkHref(html: string, relPattern: RegExp): string | undefined {
  const m = html.match(new RegExp(`<link[^>]+rel=["'](${relPattern.source})["'][^>]+href=["']([^"']+)["']`, 'i'));
  if (m && m[2]) return m[2].trim();

  const m2 = html.match(new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](${relPattern.source})["']`, 'i'));
  if (m2 && m2[1]) return m2[1].trim();

  return undefined;
}

function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string | undefined {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return undefined;
  }
}

async function detectUrlMetadataInternal(inputUrl: string): Promise<ExtractedPortalMetadata> {
  let currentUrl = inputUrl;
  let redirects = 0;
  const maxRedirects = 4;
  let responseText = '';
  let finalUrl = inputUrl;

  while (redirects <= maxRedirects) {
    const safetyCheck = await validateSafeUrl(currentUrl);
    if (!safetyCheck.safe || !safetyCheck.url) {
      const err = new Error(safetyCheck.error || 'URL tidak melepasi semakan keselamatan.');
      (err as any).statusCode = 400;
      throw err;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    try {
      const response = await fetch(safetyCheck.url.href, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (DirectoryKPMBP-Bot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ms,en-US,en;q=0.9',
        },
      });

      clearTimeout(timeoutId);

      // Handle Redirects
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) {
          const err = new Error(`Pelayan membalas dengan status lencongan ${response.status} tanpa pengepala Lokasi.`);
          (err as any).statusCode = 502;
          throw err;
        }
        currentUrl = resolveUrl(location, currentUrl) || location;
        redirects++;
        continue;
      }

      if (!response.ok && response.status !== 304) {
        const err = new Error(`Pelayan sasaran membalas dengan status kod HTTP ${response.status}. Laman web ini mungkin menyekat bot.`);
        (err as any).statusCode = response.status === 404 ? 404 : 502;
        throw err;
      }

      finalUrl = response.url || currentUrl;

      // Read max 512 KB
      const reader = response.body?.getReader();
      if (reader) {
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;
        const maxBytes = 524288; // 512 KB

        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          chunks.push(value);
          totalBytes += value.length;
          if (totalBytes >= maxBytes) {
            reader.cancel();
            break;
          }
        }
        const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
        responseText = decoder.decode(Buffer.concat(chunks));
      } else {
        responseText = await response.text();
      }

      break;
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        const err = new Error('Masa menunggu tamat (Timeout 6.5s) semasa menghubungi pelayan web sasaran.');
        (err as any).statusCode = 504;
        throw err;
      }
      throw fetchErr;
    }
  }

  // 1. Title Extraction
  let title: string | undefined;
  const titleMatch = responseText.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = decodeHtmlEntities(titleMatch[1]);
  }

  // 2. Open Graph & Twitter Meta
  const ogTitle = extractMeta(responseText, 'og:title') || extractMeta(responseText, 'twitter:title') || title;
  const ogDescription = 
    extractMeta(responseText, 'og:description') || 
    extractMeta(responseText, 'twitter:description') || 
    extractMeta(responseText, 'description');

  const rawOgImage = 
    extractMeta(responseText, 'og:image') || 
    extractMeta(responseText, 'og:image:url') || 
    extractMeta(responseText, 'og:image:secure_url') ||
    extractMeta(responseText, 'twitter:image') ||
    extractMeta(responseText, 'twitter:image:src');
  const ogImage = rawOgImage ? resolveUrl(rawOgImage, finalUrl) : undefined;

  const rawOgUrl = extractMeta(responseText, 'og:url') || extractLinkHref(responseText, /canonical/);
  const ogUrl = rawOgUrl ? (resolveUrl(rawOgUrl, finalUrl) || finalUrl) : finalUrl;

  let ogSiteName = extractMeta(responseText, 'og:site_name') || extractMeta(responseText, 'application-name');
  let hostname = '';
  try {
    const parsedUrl = new URL(finalUrl);
    hostname = parsedUrl.hostname;
    if (!ogSiteName) {
      ogSiteName = hostname.replace(/^www\./i, '');
    }
  } catch {
    ogSiteName = undefined;
  }

  // 3. Favicon Resolution with 4-Tier Priority
  // Priority 1: HTML declared icon
  const htmlFavicon =
    extractLinkHref(responseText, /(?:shortcut )?icon/i) ||
    extractLinkHref(responseText, /icon/i);

  // Priority 2: Apple Touch Icon
  const appleTouchIcon =
    extractLinkHref(responseText, /apple-touch-icon(?:-precomposed)?/i);

  let favicon: string | undefined;
  if (htmlFavicon) {
    favicon = resolveUrl(htmlFavicon, finalUrl);
  } else if (appleTouchIcon) {
    favicon = resolveUrl(appleTouchIcon, finalUrl);
  } else if (finalUrl) {
    // Priority 3: Standard target host /favicon.ico
    try {
      favicon = new URL('/favicon.ico', finalUrl).href;
    } catch {
      favicon = undefined;
    }
  }

  // Priority 4: Safe universal fallback icon (Google Favicon service)
  let fallbackFavicon: string | undefined;
  if (hostname) {
    fallbackFavicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=128`;
  }

  if (!favicon && fallbackFavicon) {
    favicon = fallbackFavicon;
  }

  return {
    url: inputUrl,
    finalUrl,
    title: ogTitle || title,
    description: ogDescription,
    ogTitle,
    ogDescription,
    ogImage,
    ogUrl,
    ogSiteName,
    favicon,
    fallbackFavicon,
  };
}

export default async function handler(
  req: IncomingMessage & { body?: any },
  res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any }
) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Kaedah HTTP tidak dibenarkan (Method Not Allowed).' }));
    return;
  }

  // Safe request body parsing (supporting Vercel pre-parsed body and raw stream)
  let body = req.body;
  if (!body && typeof req.on === 'function') {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      const rawText = Buffer.concat(chunks).toString('utf-8');
      if (rawText) {
        body = JSON.parse(rawText);
      }
    } catch (_err) {
      body = {};
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const { url } = body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Sila berikan URL yang sah.' }));
    return;
  }

  try {
    const metadata = await detectUrlMetadataInternal(url.trim());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: metadata }));
  } catch (err: any) {
    console.error('[MetadataDetect Error]:', err?.message || err);
    const statusCode = err?.statusCode || (err?.message?.includes('SSRF') || err?.message?.includes('tidak sah') ? 400 : 502);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: err?.message || 'Gagal mengesan maklumat laman web.',
      data: { url: url.trim() },
    }));
  }
}

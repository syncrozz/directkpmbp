/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-side Smart URL Metadata Detection Service
 * Implements strict SSRF protection, streaming byte caps, and timeout constraints.
 */

import dns from 'dns';
import { URL } from 'url';

export interface ExtractedPortalMetadata {
  url: string;
  finalUrl: string;
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  manifestUrl?: string;
  manifestName?: string;
  manifestIcons?: Array<{ src: string; sizes?: string; type?: string }>;
}

/**
 * Checks whether an IP address belongs to private, loopback, or reserved networks.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // Normalize IPv6 mapped IPv4 e.g. "::ffff:127.0.0.1"
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv4 Checks
  if (ip.includes('.')) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) {
      return true; // malformed treated as unsafe
    }

    const [a, b] = parts;

    // 0.0.0.0/8
    if (a === 0) return true;
    // 10.0.0.0/8
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link Local / Cloud Metadata)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // Multicast & Reserved (224.0.0.0/4 and 240.0.0.0/4)
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
export async function validateSafeUrl(urlString: string): Promise<{ safe: boolean; error?: string; url?: URL }> {
  try {
    const url = new URL(urlString.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { safe: false, error: 'Protokol URL tidak sah. Hanya http:// dan https:// dibenarkan.' };
    }

    const hostname = url.hostname.toLowerCase();

    // Blacklist specific internal identifiers
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

    // Resolve DNS and test each IP
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

/**
 * Extracts meta tag content by property or name attribute.
 */
function extractMeta(html: string, key: string): string | undefined {
  // Pattern 1: property="key" content="..."
  const p1 = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const m1 = html.match(p1);
  if (m1 && m1[1]) return decodeHtmlEntities(m1[1]);

  // Pattern 2: content="..." property="key"
  const p2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${key}["']`, 'i');
  const m2 = html.match(p2);
  if (m2 && m2[1]) return decodeHtmlEntities(m2[1]);

  return undefined;
}

/**
 * Extracts link tag href attribute.
 */
function extractLinkHref(html: string, relPattern: RegExp): string | undefined {
  const m = html.match(new RegExp(`<link[^>]+rel=["'](${relPattern.source})["'][^>]+href=["']([^"']+)["']`, 'i'));
  if (m && m[2]) return m[2].trim();

  // Reverse attribute order
  const m2 = html.match(new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](${relPattern.source})["']`, 'i'));
  if (m2 && m2[1]) return m2[1].trim();

  return undefined;
}

/**
 * Resolves a potentially relative URL to an absolute URL safely.
 */
function resolveUrl(relativeOrAbsolute: string, baseUrl: string): string | undefined {
  try {
    return new URL(relativeOrAbsolute, baseUrl).href;
  } catch {
    return undefined;
  }
}

/**
 * Performs safe, bounded fetching of target URL HTML and extracts rich metadata.
 */
export async function detectUrlMetadata(inputUrl: string): Promise<ExtractedPortalMetadata> {
  let currentUrl = inputUrl;
  let redirects = 0;
  const maxRedirects = 4;
  let responseText = '';
  let finalUrl = inputUrl;

  while (redirects <= maxRedirects) {
    const safetyCheck = await validateSafeUrl(currentUrl);
    if (!safetyCheck.safe || !safetyCheck.url) {
      throw new Error(safetyCheck.error || 'URL tidak melepasi semakan keselamatan.');
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
          throw new Error(`Pelayan membalas dengan status lencongan ${response.status} tanpa pengepala Lokasi.`);
        }
        currentUrl = resolveUrl(location, currentUrl) || location;
        redirects++;
        continue;
      }

      if (!response.ok && response.status !== 304) {
        throw new Error(`Pelayan sasaran membalas dengan status kod HTTP ${response.status}.`);
      }

      finalUrl = response.url || currentUrl;

      // Read max 512 KB of the response body
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
        throw new Error('Masa menunggu tamat (Timeout 6.5s) semasa menghubungi pelayan web sasaran.');
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

  // 2. Open Graph Meta
  const ogTitle = extractMeta(responseText, 'og:title');
  const ogDescription = extractMeta(responseText, 'og:description');
  const metaDescription = extractMeta(responseText, 'description');
  const rawOgImage = extractMeta(responseText, 'og:image') || extractMeta(responseText, 'og:image:url');
  const ogImage = rawOgImage ? resolveUrl(rawOgImage, finalUrl) : undefined;

  // 3. Favicon & Apple Touch Icon
  const rawIcon =
    extractLinkHref(responseText, /apple-touch-icon(?:-precomposed)?/) ||
    extractLinkHref(responseText, /(?:shortcut )?icon/);
  const favicon = rawIcon ? resolveUrl(rawIcon, finalUrl) : resolveUrl('/favicon.ico', finalUrl);

  // 4. PWA Manifest Detection
  const rawManifest = extractLinkHref(responseText, /manifest/);
  let manifestUrl: string | undefined;
  let manifestName: string | undefined;
  let manifestIcons: Array<{ src: string; sizes?: string; type?: string }> | undefined;

  if (rawManifest) {
    const fullManifestUrl = resolveUrl(rawManifest, finalUrl);
    if (fullManifestUrl) {
      const manifestCheck = await validateSafeUrl(fullManifestUrl);
      if (manifestCheck.safe && manifestCheck.url) {
        manifestUrl = fullManifestUrl;
        try {
          const mController = new AbortController();
          const mTimer = setTimeout(() => mController.abort(), 2500);
          const mRes = await fetch(fullManifestUrl, {
            signal: mController.signal,
            headers: { 'User-Agent': 'DirectoryKPMBP-Bot/1.0' },
          });
          clearTimeout(mTimer);
          if (mRes.ok) {
            const mJson = await mRes.json();
            manifestName = mJson.name || mJson.short_name;
            if (Array.isArray(mJson.icons) && mJson.icons.length > 0) {
              manifestIcons = mJson.icons.slice(0, 5).map((ic: any) => ({
                src: resolveUrl(ic.src, fullManifestUrl) || ic.src,
                sizes: ic.sizes,
                type: ic.type,
              }));
            }
          }
        } catch {
          // Graceful fallback: ignore manifest fetch error
        }
      }
    }
  }

  return {
    url: inputUrl,
    finalUrl,
    title: ogTitle || title,
    description: ogDescription || metaDescription,
    ogTitle,
    ogDescription,
    ogImage,
    favicon,
    manifestUrl,
    manifestName,
    manifestIcons,
  };
}

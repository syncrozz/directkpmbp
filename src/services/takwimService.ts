import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../config/firebase';

export const DEFAULT_TAKWIM_URL =
  'https://drive.google.com/drive/u/0/folders/1iVYhFd9lP60A3ITHTrIWB4GmmCwQvvbZ';

export interface TakwimConfig {
  url: string;
  title?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type TakwimLinkKind = 'drive-file' | 'drive-folder' | 'other';

export interface ParsedTakwimLink {
  kind: TakwimLinkKind;
  embedUrl: string;
  openUrl: string;
}

export function parseTakwimLink(raw: string): ParsedTakwimLink | null {
  const input = (raw || '').trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.toLowerCase();
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const folder = url.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folder) {
      const id = folder[1];
      return {
        kind: 'drive-folder',
        embedUrl: `https://drive.google.com/embeddedfolderview?id=${id}#list`,
        openUrl: `https://drive.google.com/drive/folders/${id}`,
      };
    }
    const file = url.pathname.match(/\/(?:file|document|presentation|spreadsheets)\/d\/([a-zA-Z0-9_-]+)/);
    const idParam = url.searchParams.get('id');
    const id = file?.[1] || (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam) ? idParam : null);
    if (id) {
      return {
        kind: 'drive-file',
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
        openUrl: `https://drive.google.com/file/d/${id}/view`,
      };
    }
    return null;
  }

  return { kind: 'other', embedUrl: input, openUrl: input };
}

const takwimRef = () => doc(db, 'platforms', 'directkpmbp', 'config', 'takwim');

export function subscribeToTakwimConfig(callback: (config: TakwimConfig) => void): () => void {
  return onSnapshot(
    takwimRef(),
    (snap) => {
      if (!snap.exists()) {
        callback({ url: DEFAULT_TAKWIM_URL });
        return;
      }
      const data = snap.data() as Partial<TakwimConfig>;
      callback({
        url: typeof data.url === 'string' ? data.url : DEFAULT_TAKWIM_URL,
        title: data.title,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy,
      });
    },
    (err) => {
      console.warn('[Takwim] Gagal membaca konfigurasi, guna pautan lalai:', err?.message);
      callback({ url: DEFAULT_TAKWIM_URL });
    }
  );
}

export async function saveTakwimConfig(url: string, title?: string): Promise<void> {
  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (e) {
      console.warn('Notice refreshing ID token:', e);
    }
  }
  await setDoc(
    takwimRef(),
    {
      url: url.trim(),
      title: (title || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: auth.currentUser?.email || 'admin',
    },
    { merge: true }
  );
}

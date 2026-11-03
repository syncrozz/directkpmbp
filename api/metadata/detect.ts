import type { IncomingMessage, ServerResponse } from 'http';
import { detectUrlMetadata } from '../../src/services/serverMetadata';

export default async function handler(req: IncomingMessage & { body?: any }, res: ServerResponse & { status?: (code: number) => any; json?: (data: any) => any }) {
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
    res.end(JSON.stringify({ success: false, error: 'Sila berikan parameter URL yang sah.' }));
    return;
  }

  try {
    const metadata = await detectUrlMetadata(url.trim());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, data: metadata }));
  } catch (err: any) {
    console.warn('[VercelAPI:MetadataDetect] Notice:', err?.message || err);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: false,
      error: err?.message || 'Gagal mengesan maklumat secara automatik.',
      data: { url: url.trim() },
    }));
  }
}

import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { detectUrlMetadata } from './src/services/serverMetadata.ts';

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // JSON body parser
  app.use(express.json());

  // CORS headers middleware
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Directory KPMBP' });
  });

  // On-demand automatic thumbnail generator and cache route
  app.get('/thumbnails/:filename', async (req, res, next) => {
    const filename = req.params.filename || '';
    const match = filename.match(/^([a-zA-Z0-9_-]{10,128})\.(png|webp|jpg|jpeg)$/);
    if (!match) return next();

    const fileId = match[1];
    const ext = match[2];
    const filePath = path.join(process.cwd(), 'public', 'thumbnails', `${fileId}.${ext}`);

    // If already generated and cached on disk, send directly
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }

    // Auto-generate on-demand from Google Drive preview
    try {
      const resourcekey = String(req.query.resourcekey || '').trim();
      const rKeyParam = resourcekey ? `&resourcekey=${encodeURIComponent(resourcekey)}` : '';
      const candidateUrls = [
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000${rKeyParam}`,
        `https://lh3.googleusercontent.com/d/${fileId}=w1000${rKeyParam}`,
        `https://lh3.googleusercontent.com/d/${fileId}${rKeyParam}`,
      ];

      for (const url of candidateUrls) {
        try {
          const resp = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'image/webp,image/jpeg,image/png,*/*',
            },
            redirect: 'follow',
          });

          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const isImageMagic =
              (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) ||
              (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||
              (buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46);

            if (isImageMagic) {
              const dir = path.join(process.cwd(), 'public', 'thumbnails');
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(filePath, buf);

              res.setHeader('Content-Type', ext === 'webp' ? 'image/webp' : 'image/png');
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
              return res.send(buf);
            }
          }
        } catch {
          // try next candidate
        }
      }
    } catch (genErr) {
      console.warn('[AutoThumbnail] Generation notice for', fileId, genErr);
    }

    return next();
  });

  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Local favicon fallback route to prevent 404s
  app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'favicon.svg'));
  });

  // Request status logger to monitor any 404s
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode === 404) {
        console.warn(`[HTTP 404 Trace] ${req.method} ${req.originalUrl}`);
      }
    });
    next();
  });

  // Smart URL metadata detection endpoint with SSRF guard
  app.post('/api/metadata/detect', async (req, res) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Sila berikan parameter URL yang sah.' });
    }

    try {
      const metadata = await detectUrlMetadata(url.trim());
      return res.status(200).json({ success: true, data: metadata });
    } catch (err: any) {
      console.warn('[MetadataDetect] Notice:', err?.message || err);
      const isValidationOrSsrf = err?.message?.includes('SSRF') || err?.message?.includes('tidak sah');
      const isTimeout = err?.message?.includes('tamat');
      const statusCode = isValidationOrSsrf ? 400 : isTimeout ? 504 : 502;
      return res.status(statusCode).json({
        success: false,
        error: err?.message || 'Gagal mengesan maklumat secara automatik.',
        data: { url: url.trim() },
      });
    }
  });

  // Google Drive PDF Proxy endpoint (Direct binary retrieval with PDF magic byte validation & resourcekey support)
  app.get('/api/pdf/proxy', async (req, res) => {
    const fileId = String(req.query.id || '').trim();
    const resourcekey = String(req.query.resourcekey || '').trim();

    if (!fileId || !/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) {
      return res.status(400).json({ success: false, error: 'ID fail Google Drive tidak sah.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const rKeyParam = resourcekey ? `&resourcekey=${encodeURIComponent(resourcekey)}` : '';
      const candidateUrls = [
        `https://drive.usercontent.google.com/download?id=${fileId}&export=download${rKeyParam}`,
        `https://drive.google.com/uc?export=download&id=${fileId}${rKeyParam}`,
        `https://drive.google.com/uc?id=${fileId}&export=download${rKeyParam}`,
      ];

      let pdfBuffer: Buffer | null = null;
      let lastHttpStatus = 502;
      let failureReason = '';

      for (const targetUrl of candidateUrls) {
        try {
          let response = await fetch(targetUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'application/pdf,application/octet-stream,*/*',
            },
            redirect: 'follow',
          });

          lastHttpStatus = response.status;
          if (!response.ok) {
            failureReason = `Pelayan Google Drive membalas dengan status HTTP ${response.status}.`;
            continue;
          }

          let arrayBuffer = await response.arrayBuffer();
          let buffer = Buffer.from(arrayBuffer);

          // Check if Google Drive returned an HTML page (e.g. large file virus scan warning or login page)
          const isPdfMagic =
            buffer.length > 4 &&
            buffer[0] === 0x25 && // %
            buffer[1] === 0x50 && // P
            buffer[2] === 0x44 && // D
            buffer[3] === 0x46;   // F

          if (!isPdfMagic) {
            const htmlText = buffer.toString('utf-8', 0, 8192);

            // Check for large file virus scan confirmation link e.g. /uc?export=download&confirm=...
            const confirmMatch = htmlText.match(/href="(\/uc\?export=download[^"]+confirm=[^"&]+[^"]*)"/i) ||
                                 htmlText.match(/href="([^"]+confirm=[a-zA-Z0-9_-]+[^"]*)"/i);
            if (confirmMatch && confirmMatch[1]) {
              const confirmUrl = confirmMatch[1].startsWith('http')
                ? confirmMatch[1]
                : `https://drive.google.com${confirmMatch[1].replace(/&amp;/g, '&')}`;

              const confirmResp = await fetch(confirmUrl, {
                signal: controller.signal,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                  Accept: 'application/pdf,application/octet-stream,*/*',
                },
                redirect: 'follow',
              });

              if (confirmResp.ok) {
                const confBuffer = Buffer.from(await confirmResp.arrayBuffer());
                if (
                  confBuffer.length > 4 &&
                  confBuffer[0] === 0x25 &&
                  confBuffer[1] === 0x50 &&
                  confBuffer[2] === 0x44 &&
                  confBuffer[3] === 0x46
                ) {
                  pdfBuffer = confBuffer;
                  break;
                }
              }
            }

            if (htmlText.includes('accounts.google.com') || htmlText.includes('ServiceLogin') || htmlText.includes('v3/signin')) {
              failureReason = 'Akses ke fail Google Drive ini memerlukan log masuk akaun (Private/Restricted). Sila pastikan perkongsian fail ditetapkan kepada "Sesiapa sahaja yang mempunyai pautan" (Anyone with the link can view).';
            } else {
              failureReason = 'Kandungan yang diterima bukan fail PDF yang sah.';
            }
            continue;
          }

          pdfBuffer = buffer;
          break;
        } catch (fetchErr: any) {
          failureReason = fetchErr?.message || 'Ralat sambungan rangkaian semasa mengambil fail dari Google Drive.';
        }
      }

      clearTimeout(timeout);

      if (!pdfBuffer) {
        return res.status(lastHttpStatus === 404 ? 404 : 422).json({
          success: false,
          error: failureReason || 'Gagal memuat turun data PDF yang sah daripada Google Drive.',
        });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(pdfBuffer);
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err?.name === 'AbortError';
      return res.status(isTimeout ? 504 : 502).json({
        success: false,
        error: isTimeout
          ? 'Masa menunggu tamat semasa mengambil fail dari Google Drive (Timeout 15s).'
          : err?.message || 'Ralat semasa mengambil fail dari Google Drive.',
      });
    }
  });

  // Google Drive Direct Thumbnail endpoint (Fast fallback/direct preview source with resourcekey support)
  app.get('/api/pdf/thumbnail-source', async (req, res) => {
    const fileId = String(req.query.id || '').trim();
    const resourcekey = String(req.query.resourcekey || '').trim();

    if (!fileId || !/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) {
      return res.status(400).json({ success: false, error: 'ID fail Google Drive tidak sah.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const rKeyParam = resourcekey ? `&resourcekey=${encodeURIComponent(resourcekey)}` : '';
      const urls = [
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000${rKeyParam}`,
        `https://lh3.googleusercontent.com/d/${fileId}=w1000${rKeyParam}`,
        `https://lh3.googleusercontent.com/d/${fileId}${rKeyParam}`,
      ];

      let imageBuffer: Buffer | null = null;
      let contentType = 'image/jpeg';

      for (const u of urls) {
        try {
          const resp = await fetch(u, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Accept: 'image/webp,image/jpeg,image/png,*/*',
            },
            redirect: 'follow',
          });

          if (resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            const ab = await resp.arrayBuffer();
            const buf = Buffer.from(ab);

            // Verify image magic bytes (PNG: 89 50 4E 47, JPEG: FF D8 FF, WebP: 52 49 46 46)
            const isImageMagic =
              (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) || // PNG
              (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ||                     // JPEG
              (buf.length > 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46);  // WEBP

            if (isImageMagic) {
              contentType = ct.includes('image/') ? ct : 'image/png';
              imageBuffer = buf;
              break;
            }
          }
        } catch {
          // try next url
        }
      }

      clearTimeout(timeout);

      if (!imageBuffer) {
        return res.status(404).json({
          success: false,
          error: 'Pratonton imej fail tidak dapat dijana daripada Google Drive.',
        });
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', imageBuffer.length);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(imageBuffer);
    } catch (err: any) {
      clearTimeout(timeout);
      return res.status(502).json({
        success: false,
        error: err?.message || 'Ralat semasa mengambil imej pratonton fail.',
      });
    }
  });

  // Persistent thumbnail storage endpoint
  app.post(
    '/api/pdf/thumbnail-store',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: '10mb' }),
    async (req, res) => {
      const fileId = String(req.query.id || '').trim();
      const ext = String(req.query.ext || 'webp').trim() === 'png' ? 'png' : 'webp';

      if (!fileId || !/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) {
        return res.status(400).json({ success: false, error: 'ID fail tidak sah.' });
      }

      if (!req.body || !(req.body instanceof Buffer) || req.body.length === 0) {
        return res.status(400).json({ success: false, error: 'Tiada data imej dimuat naik.' });
      }

      try {
        const thumbnailsDir = path.join(process.cwd(), 'public', 'thumbnails');
        if (!fs.existsSync(thumbnailsDir)) {
          fs.mkdirSync(thumbnailsDir, { recursive: true });
        }

        const filePath = path.join(thumbnailsDir, `${fileId}.${ext}`);
        fs.writeFileSync(filePath, req.body);

        const publicUrl = `/thumbnails/${fileId}.${ext}`;
        return res.status(200).json({ success: true, url: publicUrl });
      } catch (err: any) {
        return res.status(500).json({ success: false, error: err?.message || 'Gagal menyimpan fail.' });
      }
    }
  );

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

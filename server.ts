import express from 'express';
import path from 'path';
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

  // Google Drive PDF Proxy endpoint (CORS bypass for client PDF.js rendering)
  app.get('/api/pdf/proxy', async (req, res) => {
    const fileId = String(req.query.id || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) {
      return res.status(400).json({ success: false, error: 'ID fail Google Drive tidak sah.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const gdriveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const response = await fetch(gdriveUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/pdf,application/octet-stream,*/*',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Gagal memuat turun fail dari Google Drive (Status HTTP ${response.status}). Sila pastikan perkongsian fail ditetapkan kepada "Sesiapa sahaja yang mempunyai pautan".`,
        });
      }

      const contentType = response.headers.get('content-type') || 'application/pdf';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(buffer);
    } catch (err: any) {
      clearTimeout(timeout);
      const isTimeout = err?.name === 'AbortError';
      return res.status(isTimeout ? 504 : 502).json({
        success: false,
        error: isTimeout
          ? 'Masa menunggu tamat semasa mengambil fail dari Google Drive.'
          : err?.message || 'Ralat semasa mengambil fail dari Google Drive.',
      });
    }
  });

  // Google Drive Direct Thumbnail endpoint (Fast fallback/direct preview source)
  app.get('/api/pdf/thumbnail-source', async (req, res) => {
    const fileId = String(req.query.id || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]{10,128}$/.test(fileId)) {
      return res.status(400).json({ success: false, error: 'ID fail Google Drive tidak sah.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // Primary source: lh3.googleusercontent.com/d/{id}=w1000 or drive.google.com/thumbnail
      const urls = [
        `https://lh3.googleusercontent.com/d/${fileId}=w1000`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
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
          });
          if (resp.ok) {
            const ct = resp.headers.get('content-type') || '';
            if (ct.includes('image/')) {
              contentType = ct;
              const ab = await resp.arrayBuffer();
              imageBuffer = Buffer.from(ab);
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

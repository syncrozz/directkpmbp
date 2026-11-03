import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

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
      const { detectUrlMetadata } = await import('./src/services/serverMetadata');
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

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initDatabase } from './server/db.js';
import { apiRouter, getActiveUserId } from './server/routes.js';
import { attachPresence } from './server/presence.js';
import { store3dRouter, migrateStoreExperienceV2, bindSession, serveUploads, seedMusicLibrary, serveMusicLibrary, optimiseStoredVideos, prepareStoreShelves } from './server/store3dV2.js';
import { authMiddleware } from './server/auth.js';
import { bootstrapAdmin, ensureR2Cors, ensureStoreContact, removeDemoData } from './server/production.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  initDatabase();
  migrateStoreExperienceV2();
  removeDemoData();
  prepareStoreShelves();
  ensureStoreContact();
  seedMusicLibrary();
  bootstrapAdmin();
  await ensureR2Cors();
  bindSession(getActiveUserId);

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  app.set('trust proxy', 1);

  // The storefront runs on Vercel; allow only the configured origins (comma separated)
  // the store's own domains are always allowed; add others (e.g. Vercel preview URLs) in CORS_ORIGINS
  const origins = [
    ...(process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    'https://www.shopwalk360.com',
    'https://shopwalk360.com',
  ];
  const originAllowed = (origin?: string) =>
    !origin || !process.env.CORS_ORIGINS || origins.includes(origin) || origins.some((o) => o.startsWith('*.') && origin.endsWith(o.slice(1)));
  app.use(
    cors({
      origin: (origin, cb) => cb(null, originAllowed(origin)),
      allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
      exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
    }),
  );
  app.use(authMiddleware);
  app.use(express.json({ limit: '2mb' }));

  serveUploads(app);
  serveMusicLibrary(app);
  app.use('/api', store3dRouter);
  app.use('/api', apiRouter);
  app.get('/health', (_req, res) => res.json({ ok: true }));

  const distPath = path.resolve(__dirname, 'dist');
  if (process.env.NODE_ENV !== 'production') {
    // local development: one process serves API + Vite frontend
    const { createServer } = await import('vite');
    const hmrPort = Number(process.env.HMR_PORT) || 24678;
    const vite = await createServer({
      server: { middlewareMode: true, hmr: { port: hmrPort } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (process.env.SERVE_FRONTEND === 'true' && fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  } else {
    // Railway: API only
    app.get('/', (_req, res) => res.json({ service: 'ShopWalk 360 API', ok: true }));
  }

  const server = app.listen(PORT, '0.0.0.0', () => console.log(`ShopWalk 360 API listening on :${PORT}`));
  attachPresence(server, originAllowed);
  // in the background, once the server is up: make older screen videos start fast
  setTimeout(() => {
    optimiseStoredVideos().catch((e) => console.warn('Video optimisation stopped:', e?.message || e));
  }, 15000);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

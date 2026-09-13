'use strict';

const path = require('path');
const express = require('express');

const config = require('./config');
const auth = require('./auth');
const notes = require('./routes/notes');
const docs = require('./routes/docs');
const tools = require('./routes/tools');
const ocr = require('./ocr');

const app = express();
if (config.TRUST_PROXY) app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self' data:",
      "connect-src 'self'",
      "object-src 'self'",
      "frame-src 'self' blob:",
      "base-uri 'none'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

// API responses are live state: never let a browser or proxy hold on to them.
// Individual routes (file, thumb) set their own caching afterwards.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

auth.mount(app);

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, version: require('../package.json').version, ocr: await ocr.detect() });
});

app.use('/api/notes', auth.requireAuth, notes);
app.use('/api/docs', auth.requireAuth, docs.router);
app.use('/api/tools', auth.requireAuth, tools);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown endpoint' }));

const PUBLIC_DIR = path.join(config.ROOT, 'public');
app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: '1h',
    setHeaders: (res, file) => {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// Single-page app: every other GET returns the shell.
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[webtools]', err);
  res.status(status).json({ error: err.message || 'Server error' });
});

app.listen(config.PORT, config.HOST, async () => {
  const caps = await ocr.detect();
  console.log(`[webtools] listening on http://${config.HOST}:${config.PORT}`);
  console.log(`[webtools] data dir: ${config.DATA_DIR}`);
  console.log(
    `[webtools] lock screen: ${auth.enabled ? `on (${auth.mode})` : 'OFF — anyone who can reach this can use it'}`
  );
  console.log(
    `[webtools] ocr: tesseract=${caps.tesseract} poppler=${caps.pdftoppm} sharp=${caps.sharp}`
  );
  docs.resumePending();
});

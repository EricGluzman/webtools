'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, PASSWORD, TRUST_PROXY } = require('./config');

const COOKIE = 'wt_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const keyFile = path.join(DATA_DIR, 'session.key');
if (!fs.existsSync(keyFile)) {
  fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
const SECRET = fs.readFileSync(keyFile, 'utf8').trim();

const enabled = PASSWORD.length > 0;

function sign(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function issueToken() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + MAX_AGE_MS })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return false;
  }
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && exp > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function isAuthed(req) {
  if (!enabled) return true;
  return verifyToken(readCookie(req, COOKIE));
}

function setCookie(res, token, maxAgeMs) {
  const bits = [
    `${COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (TRUST_PROXY) bits.push('Secure');
  res.setHeader('Set-Cookie', bits.join('; '));
}

// Small in-memory throttle: five tries per minute per address.
const attempts = new Map();
function throttled(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { count: 0, until: now + 60_000 };
  if (now > entry.until) {
    entry.count = 0;
    entry.until = now + 60_000;
  }
  entry.count += 1;
  attempts.set(ip, entry);
  return entry.count > 5;
}

function constantTimeEquals(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Not signed in' });
}

function mount(app) {
  app.get('/api/auth/state', (req, res) => {
    res.json({ enabled, authed: isAuthed(req) });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!enabled) return res.json({ ok: true, authed: true });
    if (throttled(req.ip)) {
      return res.status(429).json({ error: 'Too many attempts. Wait a minute.' });
    }
    const password = (req.body && req.body.password) || '';
    if (!constantTimeEquals(password, PASSWORD)) {
      return res.status(401).json({ error: 'Wrong password' });
    }
    attempts.delete(req.ip);
    setCookie(res, issueToken(), MAX_AGE_MS);
    res.json({ ok: true, authed: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    setCookie(res, '', 0);
    res.json({ ok: true });
  });
}

module.exports = { mount, requireAuth, isAuthed, enabled };

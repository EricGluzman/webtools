'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR, PIN, PASSWORD, TRUST_PROXY } = require('./config');

const COOKIE = 'wt_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const keyFile = path.join(DATA_DIR, 'session.key');
if (!fs.existsSync(keyFile)) {
  fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
}
const SECRET = fs.readFileSync(keyFile, 'utf8').trim();

const CREDENTIAL = (PIN || PASSWORD).trim();
const enabled = CREDENTIAL.length > 0;

// A short numeric credential gets the keypad; anything else gets a text field.
const mode = /^\d{4,12}$/.test(CREDENTIAL) ? 'pin' : 'password';

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

/**
 * Escalating lockout, per address.
 *
 * A four-digit PIN is only 10,000 combinations, so the credential alone is not
 * what keeps people out — this is. Five wrong tries buys a minute of silence,
 * and every further run of five multiplies the wait, up to an hour. Guessing
 * the whole space that way would take years.
 */
const LOCKOUT_STEPS = [60, 300, 1800, 3600]; // seconds
const FREE_TRIES = 5;

const attempts = new Map();

function attemptState(ip) {
  const entry = attempts.get(ip) || { failures: 0, lockedUntil: 0, strikes: 0 };
  attempts.set(ip, entry);
  return entry;
}

/** Seconds left on a lockout, or 0 when the address may try again. */
function lockedFor(ip) {
  const entry = attemptState(ip);
  if (entry.lockedUntil <= Date.now()) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

function recordFailure(ip) {
  const entry = attemptState(ip);
  entry.failures += 1;
  if (entry.failures >= FREE_TRIES) {
    entry.failures = 0;
    const wait = LOCKOUT_STEPS[Math.min(entry.strikes, LOCKOUT_STEPS.length - 1)];
    entry.strikes += 1;
    entry.lockedUntil = Date.now() + wait * 1000;
    return wait;
  }
  return 0;
}

function clearFailures(ip) {
  attempts.delete(ip);
}

// Keep the map from growing without bound on a long-running server.
setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [ip, entry] of attempts) {
    if (entry.lockedUntil < cutoff && entry.failures === 0) attempts.delete(ip);
  }
}, 60 * 60 * 1000).unref();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    res.json({
      enabled,
      authed: isAuthed(req),
      mode,
      length: mode === 'pin' ? CREDENTIAL.length : 0,
      lockedFor: lockedFor(req.ip),
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    if (!enabled) return res.json({ ok: true, authed: true });

    const locked = lockedFor(req.ip);
    if (locked) {
      return res.status(429).json({
        error: `Too many attempts. Try again in ${formatWait(locked)}.`,
        lockedFor: locked,
      });
    }

    const body = req.body || {};
    const supplied = String(body.pin ?? body.password ?? '');

    if (!constantTimeEquals(supplied, CREDENTIAL)) {
      // A deliberate pause: it costs a real person nothing and makes an
      // automated run through the keyspace far slower.
      await wait(400);
      const lockedNow = recordFailure(req.ip);
      if (lockedNow) {
        return res.status(429).json({
          error: `Too many attempts. Try again in ${formatWait(lockedNow)}.`,
          lockedFor: lockedNow,
        });
      }
      return res.status(401).json({
        error: mode === 'pin' ? 'Wrong PIN' : 'Wrong password',
      });
    }

    clearFailures(req.ip);
    setCookie(res, issueToken(), MAX_AGE_MS);
    res.json({ ok: true, authed: true });
  });

  app.post('/api/auth/logout', (req, res) => {
    setCookie(res, '', 0);
    res.json({ ok: true });
  });
}

function formatWait(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? 'a minute' : `${minutes} minutes`;
}

module.exports = { mount, requireAuth, isAuthed, enabled, mode };

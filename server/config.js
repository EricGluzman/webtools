'use strict';

const fs = require('fs');
const path = require('path');

// Minimal .env loader so the app has no dotenv dependency.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const rawLine of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || './data');

// Created here so every module that writes into it (db, auth, uploads) is safe
// on a first run, whatever order they happen to load in.
fs.mkdirSync(path.join(DATA_DIR, 'files'), { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'thumbs'), { recursive: true });

module.exports = {
  ROOT,
  DATA_DIR,
  PORT: Number(process.env.PORT || 8712),
  HOST: process.env.HOST || '127.0.0.1',
  // Either setting unlocks the app; WEBTOOLS_PIN wins when both are present.
  PIN: process.env.WEBTOOLS_PIN || '',
  PASSWORD: process.env.WEBTOOLS_PASSWORD || '',
  MAX_UPLOAD_BYTES: Number(process.env.MAX_UPLOAD_MB || 40) * 1024 * 1024,
  TRUST_PROXY: process.env.TRUST_PROXY === '1',
  OCR_LANGS: process.env.OCR_LANGS || 'eng',
};

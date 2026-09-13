'use strict';

const express = require('express');
const router = express.Router();

let QRCode = null;
try {
  QRCode = require('qrcode');
} catch {
  // Endpoint reports 501 below if the dependency is missing.
}

/** Server-side QR rendering keeps the client free of a bundled encoder. */
router.get('/qr', async (req, res) => {
  if (!QRCode) return res.status(501).json({ error: 'qrcode package not installed' });
  const text = String(req.query.text || '');
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 2000) return res.status(400).json({ error: 'text is too long for a QR code' });

  const format = req.query.format === 'svg' ? 'svg' : 'png';
  const options = {
    errorCorrectionLevel: ['L', 'M', 'Q', 'H'].includes(req.query.ecl) ? req.query.ecl : 'M',
    margin: Math.min(Math.max(Number(req.query.margin) || 2, 0), 10),
    width: Math.min(Math.max(Number(req.query.size) || 512, 64), 2000),
    color: {
      dark: /^#[0-9a-f]{6}$/i.test(req.query.dark || '') ? req.query.dark : '#000000',
      light: /^#[0-9a-f]{8}$/i.test(req.query.light || '')
        ? req.query.light
        : /^#[0-9a-f]{6}$/i.test(req.query.light || '')
          ? req.query.light
          : '#ffffff',
    },
  };

  try {
    if (format === 'svg') {
      const svg = await QRCode.toString(text, { ...options, type: 'svg' });
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(svg);
    }
    const buffer = await QRCode.toBuffer(text, { ...options, type: 'png' });
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;

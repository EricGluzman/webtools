'use strict';

const express = require('express');
const crypto = require('crypto');
const { db } = require('../db');

const router = express.Router();
const now = () => new Date().toISOString();

const COLORS = ['amber', 'rose', 'violet', 'sky', 'lime', 'slate', 'teal', 'pink'];

const selectAll = db.prepare(
  `SELECT * FROM notes WHERE archived = ? ORDER BY pinned DESC, z ASC, updated_at DESC`
);
const selectOne = db.prepare(`SELECT * FROM notes WHERE id = ?`);
const maxZ = db.prepare(`SELECT COALESCE(MAX(z), 0) AS z FROM notes`);

router.get('/', (req, res) => {
  const archived = req.query.archived === '1' ? 1 : 0;
  res.json({ notes: selectAll.all(archived) });
});

router.post('/', (req, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  const stamp = now();
  const note = {
    id,
    title: String(body.title || '').slice(0, 200),
    body: String(body.body || '').slice(0, 100_000),
    color: COLORS.includes(body.color) ? body.color : 'amber',
    pinned: body.pinned ? 1 : 0,
    archived: 0,
    x: Number.isFinite(body.x) ? body.x : 40,
    y: Number.isFinite(body.y) ? body.y : 40,
    w: Number.isFinite(body.w) ? body.w : 280,
    h: Number.isFinite(body.h) ? body.h : 260,
    z: maxZ.get().z + 1,
    created_at: stamp,
    updated_at: stamp,
  };
  db.prepare(
    `INSERT INTO notes (id, title, body, color, pinned, archived, x, y, w, h, z, created_at, updated_at)
     VALUES (@id, @title, @body, @color, @pinned, @archived, @x, @y, @w, @h, @z, @created_at, @updated_at)`
  ).run(note);
  res.status(201).json({ note });
});

const FIELDS = ['title', 'body', 'color', 'pinned', 'archived', 'x', 'y', 'w', 'h', 'z'];

router.patch('/:id', (req, res) => {
  const existing = selectOne.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Note not found' });

  const patch = {};
  for (const field of FIELDS) {
    if (!(field in (req.body || {}))) continue;
    const value = req.body[field];
    if (field === 'color') patch.color = COLORS.includes(value) ? value : existing.color;
    else if (field === 'pinned' || field === 'archived') patch[field] = value ? 1 : 0;
    else if (['x', 'y', 'w', 'h', 'z'].includes(field)) {
      if (Number.isFinite(Number(value))) patch[field] = Number(value);
    } else patch[field] = String(value).slice(0, 100_000);
  }
  if (!Object.keys(patch).length) return res.json({ note: existing });

  const assignments = Object.keys(patch).map((key) => `${key} = @${key}`).join(', ');
  db.prepare(`UPDATE notes SET ${assignments}, updated_at = @updated_at WHERE id = @id`).run({
    ...patch,
    updated_at: now(),
    id: req.params.id,
  });
  res.json({ note: selectOne.get(req.params.id) });
});

/** Called after a drag so the dragged note ends up on top. */
router.post('/:id/raise', (req, res) => {
  const existing = selectOne.get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Note not found' });
  const z = maxZ.get().z + 1;
  db.prepare(`UPDATE notes SET z = ? WHERE id = ?`).run(z, req.params.id);
  res.json({ z });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM notes WHERE id = ?`).run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Note not found' });
  res.json({ ok: true });
});

module.exports = router;

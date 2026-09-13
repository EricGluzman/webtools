'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { db, reindex, unindex } = require('../db');
const { analyse } = require('../tagger');
const ocr = require('../ocr');
const { MAX_UPLOAD_BYTES } = require('../config');

const router = express.Router();
const now = () => new Date().toISOString();

const ALLOWED = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ocr.FILES_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').slice(0, 10).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 25 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

/* ---------------------------------------------------------------- queries */

const getDoc = db.prepare(`SELECT * FROM documents WHERE id = ?`);
const getTagsFor = db.prepare(
  `SELECT t.id, t.name, t.color, dt.source
     FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
    WHERE dt.document_id = ? ORDER BY t.name`
);
const insertTag = db.prepare(`INSERT OR IGNORE INTO tags (name, color) VALUES (?, ?)`);
const findTag = db.prepare(`SELECT * FROM tags WHERE name = ? COLLATE NOCASE`);
const linkTag = db.prepare(
  `INSERT OR REPLACE INTO document_tags (document_id, tag_id, source) VALUES (?, ?, ?)`
);

function tagId(name, color = 'slate') {
  const clean = String(name).trim().slice(0, 40);
  if (!clean) return null;
  insertTag.run(clean, color);
  const row = findTag.get(clean);
  return row ? row.id : null;
}

function withTags(doc) {
  if (!doc) return doc;
  return { ...doc, tags: getTagsFor.all(doc.id) };
}

/** Strip the text body from list payloads — it can be megabytes. */
function summarise(doc) {
  const { text, ...rest } = doc;
  return { ...rest, snippet: text.replace(/\s+/g, ' ').trim().slice(0, 220), tags: getTagsFor.all(doc.id) };
}

/* ------------------------------------------------------------ processing */

const queue = [];
let working = false;

function enqueue(id) {
  queue.push(id);
  if (!working) drain();
}

async function drain() {
  working = true;
  while (queue.length) {
    const id = queue.shift();
    try {
      await processDoc(id);
    } catch (err) {
      db.prepare(`UPDATE documents SET ocr_status = 'failed', ocr_error = ? WHERE id = ?`)
        .run(String(err.message || err).slice(0, 500), id);
    }
  }
  working = false;
}

async function processDoc(id) {
  const started = Date.now();
  const doc = getDoc.get(id);
  if (!doc) return;
  db.prepare(`UPDATE documents SET ocr_status = 'working' WHERE id = ?`).run(id);

  const [extracted, thumb] = await Promise.all([
    ocr.extractText(doc.stored_name, doc.mime),
    ocr.makeThumb(doc.stored_name, doc.mime),
  ]);

  const facts = analyse(extracted.text, doc.filename);
  const title =
    doc.title ||
    facts.vendor ||
    path.basename(doc.filename, path.extname(doc.filename)).replace(/[_-]+/g, ' ').trim();

  db.prepare(
    `UPDATE documents SET text = ?, ocr_status = ?, ocr_error = ?, pages = ?, kind = ?,
            vendor = ?, doc_date = ?, amount = ?, currency = ?, title = ?, thumb = ?, updated_at = ?
      WHERE id = ?`
  ).run(
    extracted.text,
    extracted.status,
    extracted.error,
    extracted.pages,
    facts.kind,
    facts.vendor,
    facts.doc_date,
    facts.amount,
    facts.currency,
    title,
    thumb,
    now(),
    id
  );

  // Auto tags replace previous auto tags; manual ones the user added stay put.
  db.prepare(`DELETE FROM document_tags WHERE document_id = ? AND source = 'auto'`).run(id);
  for (const tag of facts.tags) {
    const tid = tagId(tag.name, tag.color);
    if (tid) linkTag.run(id, tid, 'auto');
  }

  reindex(getDoc.get(id));
  console.log(`[webtools] read ${doc.filename} in ${Date.now() - started}ms (${extracted.status})`);
}

/* ---------------------------------------------------------------- routes */

router.post('/', (req, res) => {
  upload.array('files', 25)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files received' });

    const created = [];
    for (const file of files) {
      const id = crypto.randomUUID();
      const stamp = now();
      db.prepare(
        `INSERT INTO documents (id, title, filename, stored_name, mime, size, kind, ocr_status, created_at, updated_at)
         VALUES (?, '', ?, ?, ?, ?, 'document', 'pending', ?, ?)`
      ).run(id, file.originalname, file.filename, file.mimetype, file.size, stamp, stamp);
      created.push(withTags(getDoc.get(id)));
      enqueue(id);
    }
    res.status(201).json({ documents: created.map(summarise) });
  });
});

router.post('/bulk-delete', (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: 'No documents given' });
  if (ids.length > 500) return res.status(400).json({ error: 'Too many documents at once' });

  const found = ids.map((id) => getDoc.get(String(id))).filter(Boolean);
  for (const doc of found) removeDocument(doc);

  res.json({ deleted: found.length, missing: ids.length - found.length });
});

router.get('/stats', (_req, res) => {
  const totals = db
    .prepare(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(CASE WHEN kind IN ('receipt','invoice') THEN 1 ELSE 0 END), 0) AS receipts,
              COALESCE(SUM(size), 0) AS bytes,
              COALESCE(SUM(CASE WHEN ocr_status IN ('pending','working') THEN 1 ELSE 0 END), 0) AS processing
         FROM documents`
    )
    .get();

  const spendByMonth = db
    .prepare(
      `SELECT substr(COALESCE(NULLIF(doc_date,''), created_at), 1, 7) AS month,
              ROUND(SUM(amount), 2) AS total, COUNT(*) AS count
         FROM documents
        WHERE amount IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 12`
    )
    .all();

  const byTag = db
    .prepare(
      `SELECT t.name, t.color, COUNT(*) AS count,
              ROUND(COALESCE(SUM(d.amount), 0), 2) AS total
         FROM document_tags dt
         JOIN tags t ON t.id = dt.tag_id
         JOIN documents d ON d.id = dt.document_id
        GROUP BY t.id ORDER BY count DESC LIMIT 24`
    )
    .all();

  res.json({ totals, spendByMonth, byTag });
});

router.get('/tags', (_req, res) => {
  res.json({
    tags: db
      .prepare(
        `SELECT t.id, t.name, t.color, COUNT(dt.document_id) AS count
           FROM tags t LEFT JOIN document_tags dt ON dt.tag_id = t.id
          GROUP BY t.id ORDER BY count DESC, t.name`
      )
      .all(),
  });
});

router.get('/capabilities', async (_req, res) => {
  res.json({ ocr: await ocr.detect() });
});

/** Turn user input into a safe FTS5 prefix query. */
function ftsQuery(raw) {
  const tokens = String(raw)
    .toLowerCase()
    .replace(/["*()^:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return '';
  return tokens.map((token, i) => (i === tokens.length - 1 ? `"${token}"*` : `"${token}"`)).join(' AND ');
}

router.get('/', (req, res) => {
  const { q = '', tag = '', kind = '', from = '', to = '', starred = '' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const sort = ['newest', 'oldest', 'amount', 'title'].includes(req.query.sort) ? req.query.sort : 'newest';

  const where = [];
  const params = {};

  if (q.trim()) {
    const query = ftsQuery(q);
    let ids = [];
    if (query) {
      try {
        ids = db.prepare(`SELECT doc_id FROM documents_fts WHERE documents_fts MATCH ? LIMIT 400`).all(query)
          .map((row) => row.doc_id);
      } catch {
        ids = [];
      }
    }
    if (!ids.length) {
      // Fall back to a plain substring scan so short or odd queries still work.
      ids = db
        .prepare(
          `SELECT id FROM documents
            WHERE title LIKE @like OR vendor LIKE @like OR filename LIKE @like OR text LIKE @like
            LIMIT 400`
        )
        .all({ like: `%${q.trim()}%` })
        .map((row) => row.id);
    }
    if (!ids.length) return res.json({ documents: [], total: 0 });
    where.push(`d.id IN (${ids.map(() => '?').join(',')})`);
    params.__ids = ids;
  }

  if (tag) {
    where.push(
      `EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                WHERE dt.document_id = d.id AND t.name = @tag COLLATE NOCASE)`
    );
    params.tag = tag;
  }
  if (kind) {
    where.push(`d.kind = @kind`);
    params.kind = kind;
  }
  if (from) {
    where.push(`COALESCE(NULLIF(d.doc_date,''), d.created_at) >= @from`);
    params.from = from;
  }
  if (to) {
    where.push(`COALESCE(NULLIF(d.doc_date,''), d.created_at) <= @to`);
    params.to = `${to}~`;
  }
  if (starred === '1') where.push(`d.starred = 1`);

  const order = {
    newest: `COALESCE(NULLIF(d.doc_date,''), d.created_at) DESC`,
    oldest: `COALESCE(NULLIF(d.doc_date,''), d.created_at) ASC`,
    amount: `d.amount DESC NULLS LAST`,
    title: `d.title COLLATE NOCASE ASC`,
  }[sort];

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const ids = params.__ids || [];
  delete params.__ids;

  const rows = db
    .prepare(`SELECT d.* FROM documents d ${clause} ORDER BY ${order} LIMIT @limit OFFSET @offset`)
    .all(...ids, { ...params, limit, offset });
  // better-sqlite3 rejects a parameter object on a statement with no placeholders.
  const countArgs = Object.keys(params).length ? [...ids, params] : [...ids];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM documents d ${clause}`).get(...countArgs).n;

  res.json({ documents: rows.map(summarise), total });
});

router.get('/export.csv', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT d.title, d.vendor, d.kind, COALESCE(NULLIF(d.doc_date,''), substr(d.created_at,1,10)) AS date,
              d.amount, d.currency, d.filename,
              (SELECT GROUP_CONCAT(t.name, ' ') FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                WHERE dt.document_id = d.id) AS tags
         FROM documents d ORDER BY date DESC`
    )
    .all();

  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const header = ['date', 'title', 'vendor', 'kind', 'amount', 'currency', 'tags', 'filename'];
  const csv = [header.join(',')]
    .concat(rows.map((row) => header.map((key) => escape(row[key])).join(',')))
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="documents.csv"');
  res.send(csv);
});

router.get('/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json({ document: withTags(doc) });
});

router.get('/:id/file', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).end();
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.filename)}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(path.join(ocr.FILES_DIR, doc.stored_name)).pipe(res);
});

router.get('/:id/download', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).end();
  res.download(path.join(ocr.FILES_DIR, doc.stored_name), doc.filename);
});

router.get('/:id/thumb', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).end();
  const thumb = doc.thumb && path.join(ocr.THUMBS_DIR, doc.thumb);
  const file = thumb && fs.existsSync(thumb) ? thumb : null;
  if (!file && !doc.mime.startsWith('image/')) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.setHeader('Content-Type', file ? 'image/jpeg' : doc.mime);
  fs.createReadStream(file || path.join(ocr.FILES_DIR, doc.stored_name)).pipe(res);
});

const EDITABLE = ['title', 'vendor', 'doc_date', 'currency', 'note', 'kind'];

router.patch('/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const patch = {};
  for (const field of EDITABLE) {
    if (field in (req.body || {})) patch[field] = String(req.body[field] ?? '').slice(0, 500);
  }
  if ('amount' in (req.body || {})) {
    const value = req.body.amount;
    patch.amount = value === null || value === '' ? null : Number(value);
    if (Number.isNaN(patch.amount)) delete patch.amount;
  }
  if ('starred' in (req.body || {})) patch.starred = req.body.starred ? 1 : 0;

  if (Object.keys(patch).length) {
    const assignments = Object.keys(patch).map((key) => `${key} = @${key}`).join(', ');
    db.prepare(`UPDATE documents SET ${assignments}, updated_at = @updated_at WHERE id = @id`)
      .run({ ...patch, updated_at: now(), id: doc.id });
    reindex(getDoc.get(doc.id));
  }
  res.json({ document: withTags(getDoc.get(doc.id)) });
});

router.post('/:id/tags', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  const id = tagId(req.body && req.body.name, (req.body && req.body.color) || 'slate');
  if (!id) return res.status(400).json({ error: 'Tag name required' });
  linkTag.run(doc.id, id, 'manual');
  res.json({ tags: getTagsFor.all(doc.id) });
});

router.delete('/:id/tags/:tagId', (req, res) => {
  db.prepare(`DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?`)
    .run(req.params.id, Number(req.params.tagId));
  res.json({ tags: getTagsFor.all(req.params.id) });
});

router.post('/:id/reprocess', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  db.prepare(`UPDATE documents SET ocr_status = 'pending', ocr_error = '' WHERE id = ?`).run(doc.id);
  enqueue(doc.id);
  res.json({ ok: true });
});

/** Remove one document: its file, its thumbnail, its row and its index entry. */
function removeDocument(doc) {
  const files = [
    path.join(ocr.FILES_DIR, doc.stored_name),
    doc.thumb && path.join(ocr.THUMBS_DIR, doc.thumb),
  ];
  for (const file of files) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      fs.unlinkSync(file);
    } catch {
      /* the row goes either way; a stray file is not worth failing over */
    }
  }
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(doc.id);
  unindex(doc.id);
}

router.delete('/:id', (req, res) => {
  const doc = getDoc.get(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  removeDocument(doc);
  res.json({ ok: true });
});

/** Re-run anything that was interrupted by a restart. */
function resumePending() {
  const rows = db.prepare(`SELECT id FROM documents WHERE ocr_status IN ('pending','working')`).all();
  for (const row of rows) enqueue(row.id);
}

module.exports = { router, resumePending };

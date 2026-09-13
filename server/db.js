'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const { DATA_DIR } = require('./config');

const db = new Database(path.join(DATA_DIR, 'webtools.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  color       TEXT NOT NULL DEFAULT 'amber',
  pinned      INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0,
  x           REAL NOT NULL DEFAULT 40,
  y           REAL NOT NULL DEFAULT 40,
  w           REAL NOT NULL DEFAULT 260,
  h           REAL NOT NULL DEFAULT 240,
  z           INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL DEFAULT '',
  filename     TEXT NOT NULL,
  stored_name  TEXT NOT NULL,
  mime         TEXT NOT NULL DEFAULT '',
  size         INTEGER NOT NULL DEFAULT 0,
  kind         TEXT NOT NULL DEFAULT 'document',
  text         TEXT NOT NULL DEFAULT '',
  ocr_status   TEXT NOT NULL DEFAULT 'pending',
  ocr_error    TEXT NOT NULL DEFAULT '',
  pages        INTEGER NOT NULL DEFAULT 1,
  vendor       TEXT NOT NULL DEFAULT '',
  doc_date     TEXT NOT NULL DEFAULT '',
  amount       REAL,
  currency     TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  thumb        TEXT NOT NULL DEFAULT '',
  starred      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL UNIQUE,
  color  TEXT NOT NULL DEFAULT 'slate'
);

CREATE TABLE IF NOT EXISTS document_tags (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  tag_id      INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source      TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_tags_tag ON document_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  doc_id UNINDEXED, title, body, vendor, tokenize = 'unicode61 remove_diacritics 2'
);
`);

const fts = {
  remove: db.prepare(`DELETE FROM documents_fts WHERE doc_id = ?`),
  insert: db.prepare(
    `INSERT INTO documents_fts (doc_id, title, body, vendor) VALUES (?, ?, ?, ?)`
  ),
};

/** Keep the search index in step with a document row. */
function reindex(doc) {
  fts.remove.run(doc.id);
  fts.insert.run(doc.id, doc.title || '', doc.text || '', doc.vendor || '');
}

function unindex(id) {
  fts.remove.run(id);
}

module.exports = { db, reindex, unindex };

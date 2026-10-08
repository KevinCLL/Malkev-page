// Base de datos local: SQLite integrado en Node (node:sqlite), sin dependencias nativas.
// El esquema es SQL estándar para que pasar a PostgreSQL más adelante sea directo.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(here, '..', 'data')
export const UPLOADS_DIR = join(DATA_DIR, 'uploads')
mkdirSync(UPLOADS_DIR, { recursive: true })

export const db = new DatabaseSync(join(DATA_DIR, 'malkevnia.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

db.exec(`
CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  cover        TEXT,
  category     TEXT NOT NULL DEFAULT 'Varios',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Colección de hobbies: juegos de mesa, libros de rol, pelis, series, libros y manga en una sola tabla.
CREATE TABLE IF NOT EXISTS items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL CHECK (kind IN ('boardgame', 'rpg', 'film', 'series', 'book', 'manga')),
  title      TEXT NOT NULL,
  creator    TEXT NOT NULL DEFAULT '',
  year       INTEGER,
  cover_url  TEXT,
  color      TEXT,
  rating     INTEGER CHECK (rating BETWEEN 0 AND 10),
  status     TEXT NOT NULL DEFAULT 'owned',
  notes      TEXT NOT NULL DEFAULT '',
  shelf      INTEGER,
  position   INTEGER NOT NULL DEFAULT 0,
  featured   INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  meta       TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind, shelf, position);
-- Muebles de la sala de juegos: cada Kallax guarda cómo está colocado todo (layout en JSON,
-- con las cajas referenciadas por el id de items y la decoración descrita dentro).
CREATE TABLE IF NOT EXISTS furniture (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  key      TEXT NOT NULL UNIQUE,
  name     TEXT NOT NULL,
  rows     INTEGER NOT NULL,
  cols     INTEGER NOT NULL,
  layout   TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_posts_pub ON posts(status, published_at);
CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(title, excerpt, body, tokenize = 'unicode61 remove_diacritics 2');
`)

// Las bases de datos creadas antes de que existieran los libros de rol no admiten kind = 'rpg':
// se rehace la tabla con la restricción nueva conservando los datos.
const itemsSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get()?.sql || ''
if (!itemsSql.includes("'rpg'")) {
  db.exec('BEGIN; ALTER TABLE items RENAME TO items_old;')
  db.exec(itemsSql.replace("'boardgame', 'film'", "'boardgame', 'rpg', 'film'"))
  db.exec(`
    INSERT INTO items SELECT * FROM items_old;
    DROP TABLE items_old;
    CREATE INDEX IF NOT EXISTS idx_items_kind ON items(kind, shelf, position);
    COMMIT;
  `)
}

export function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'entrada'
}

export function uniqueSlug(base, ignoreId = null) {
  let slug = base
  let n = 2
  const stmt = db.prepare('SELECT id FROM posts WHERE slug = ?')
  for (;;) {
    const row = stmt.get(slug)
    if (!row || row.id === ignoreId) return slug
    slug = `${base}-${n++}`
  }
}

export function setPostTags(postId, tags) {
  db.prepare('DELETE FROM post_tags WHERE post_id = ?').run(postId)
  const insertTag = db.prepare('INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING')
  const getTag = db.prepare('SELECT id FROM tags WHERE name = ?')
  const link = db.prepare('INSERT OR IGNORE INTO post_tags (post_id, tag_id) VALUES (?, ?)')
  for (const raw of tags) {
    const name = String(raw).trim().toLowerCase()
    if (!name) continue
    insertTag.run(name)
    link.run(postId, getTag.get(name).id)
  }
  db.exec('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM post_tags)')
}

export function indexPost(post) {
  db.prepare('DELETE FROM posts_fts WHERE rowid = ?').run(post.id)
  db.prepare('INSERT INTO posts_fts (rowid, title, excerpt, body) VALUES (?, ?, ?, ?)')
    .run(post.id, post.title, post.excerpt, stripHtml(post.content_html))
}

export function transaction(fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

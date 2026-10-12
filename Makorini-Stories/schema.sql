-- Banco de dados SQLite: estruturas de obras, capitulos, usuarios e avaliacoes.
-- Nao remova colunas existentes; as migracoes estao no server.mjs.

PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS genres (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(trim(name)) BETWEEN 1 AND 60)
);
CREATE TABLE IF NOT EXISTS books (
 id INTEGER PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
 format TEXT NOT NULL DEFAULT 'Novel' CHECK(format IN ('Novel','Mangá','Manhwa','Webtoon','Livros')),
 synopsis TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '',
 release_year INTEGER CHECK(release_year IS NULL OR release_year BETWEEN 1800 AND 2100),
 status TEXT NOT NULL DEFAULT 'Em andamento' CHECK(status IN ('Em andamento','Concluída','Pausada')),
 visibility TEXT NOT NULL DEFAULT 'draft' CHECK(visibility IN ('draft','published')),
 cover TEXT, cover_fit TEXT NOT NULL DEFAULT 'cover' CHECK(cover_fit IN ('cover','contain')), cover_focus_x INTEGER NOT NULL DEFAULT 50 CHECK(cover_focus_x BETWEEN 0 AND 100), cover_focus_y INTEGER NOT NULL DEFAULT 50 CHECK(cover_focus_y BETWEEN 0 AND 100), featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)), featured_order INTEGER, favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS book_genres (
 book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
 PRIMARY KEY(book_id,genre_id)
);
CREATE TABLE IF NOT EXISTS chapters (
 id INTEGER PRIMARY KEY, book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 pdf_filename TEXT, pdf_original_name TEXT,
 visibility TEXT NOT NULL DEFAULT 'draft' CHECK(visibility IN ('draft','published')),
 published_at TEXT,
 import_status TEXT NOT NULL DEFAULT 'complete' CHECK(import_status IN ('complete','pending')),
 import_expected INTEGER NOT NULL DEFAULT 0, import_kind TEXT NOT NULL DEFAULT '',
 number REAL NOT NULL CHECK(number>=0), title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(book_id,number)
);
CREATE TABLE IF NOT EXISTS pages (
 id INTEGER PRIMARY KEY, chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
 position INTEGER NOT NULL CHECK(position>0), filename TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
 UNIQUE(chapter_id,position)
);
CREATE TABLE IF NOT EXISTS reading_progress (
 book_id INTEGER PRIMARY KEY REFERENCES books(id) ON DELETE CASCADE,
 chapter_id INTEGER NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id,number);
CREATE INDEX IF NOT EXISTS idx_pages_chapter ON pages(chapter_id,position);
CREATE INDEX IF NOT EXISTS idx_book_genres_genre ON book_genres(genre_id);
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS admin_account (
 id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT NOT NULL, password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 id TEXT PRIMARY KEY, expires INTEGER NOT NULL
);

-- Uma avaliação por obra e identificador de navegador.
CREATE TABLE IF NOT EXISTS ratings (
 book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
 voter_hash TEXT NOT NULL, score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(book_id,voter_hash)
);
PRAGMA user_version = 2;

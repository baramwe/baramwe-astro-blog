-- sort 컬럼을 NOT NULL → NULL 허용으로 재생성
CREATE TABLE bookmarks_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  url        TEXT NOT NULL,
  star       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  memo       TEXT,
  sort       INTEGER DEFAULT 1
);

INSERT INTO bookmarks_new (id, title, url, star, created_at, memo, sort)
SELECT id, title, url, star, created_at, memo, sort FROM bookmarks;

DROP TABLE bookmarks;
ALTER TABLE bookmarks_new RENAME TO bookmarks;

CREATE INDEX IF NOT EXISTS idx_bookmarks_title ON bookmarks(title);
CREATE INDEX IF NOT EXISTS idx_bookmarks_star  ON bookmarks(star);

-- 🔴 없는 sort=1 항목을 NULL로 변경
UPDATE bookmarks SET sort = NULL WHERE sort = 1 AND title NOT LIKE '%🔴%';

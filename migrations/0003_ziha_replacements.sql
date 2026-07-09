CREATE TABLE IF NOT EXISTS url_replacements (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  old_url   TEXT NOT NULL,
  new_url   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

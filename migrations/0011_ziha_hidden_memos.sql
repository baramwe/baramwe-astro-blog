-- /private/ziha 상단 메모 칩에서 숨긴 메모 목록.
-- 북마크의 memo 값은 그대로 두고, 상단 노출만 막는다. 행을 지우면 다시 노출된다.
CREATE TABLE IF NOT EXISTS ziha_hidden_memos (
  memo       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 상단 배우 칩(제목에서 추출한 TOP 40)에서 숨긴 배우. 숨기면 다음 순위 배우가 그 자리를 채운다.
CREATE TABLE IF NOT EXISTS ziha_hidden_actors (
  name       TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

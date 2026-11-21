-- 골프 스코어 관리 (/private/golf/score)
-- 1인 전용: GOLF_OWNER_EMAIL 계정만 접근 (middleware). 데이터는 owner_user_id 로도 범위 제한.

-- 골프장
CREATE TABLE IF NOT EXISTS golf_clubs (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  country_code TEXT NOT NULL,            -- ISO 3166-1 alpha-2 (KR, JP, TH ...)
  region       TEXT,
  created_by   TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name, country_code)
);
CREATE INDEX IF NOT EXISTS idx_golf_clubs_country ON golf_clubs(country_code);

-- 코스 (9홀 단위, 예: 동코스/서코스, OUT/IN)
CREATE TABLE IF NOT EXISTS golf_courses (
  id         TEXT PRIMARY KEY,
  club_id    TEXT NOT NULL,
  name       TEXT NOT NULL,
  pars_json  TEXT NOT NULL,              -- [4,4,3,5,4,4,3,4,5]
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (club_id, name),
  FOREIGN KEY (club_id) REFERENCES golf_clubs(id)
);

-- 플레이어 (본인 1행 is_self=1 + 동반자)
CREATE TABLE IF NOT EXISTS golf_players (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  is_self       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_user_id, display_name),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_golf_players_owner ON golf_players(owner_user_id);

CREATE TABLE IF NOT EXISTS golf_player_alias (
  player_id TEXT NOT NULL,
  alias     TEXT NOT NULL,
  PRIMARY KEY (player_id, alias),
  FOREIGN KEY (player_id) REFERENCES golf_players(id) ON DELETE CASCADE
);

-- 라운드
CREATE TABLE IF NOT EXISTS golf_rounds (
  id              TEXT PRIMARY KEY,
  owner_user_id   TEXT NOT NULL,
  played_on       TEXT NOT NULL,         -- YYYY-MM-DD
  club_id         TEXT NOT NULL,
  front_course_id TEXT NOT NULL,
  back_course_id  TEXT,                  -- 9홀 라운드면 NULL
  tee             TEXT,
  memo            TEXT,                  -- 한줄평 (100자)
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'image')),
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id)   REFERENCES users(id),
  FOREIGN KEY (club_id)         REFERENCES golf_clubs(id),
  FOREIGN KEY (front_course_id) REFERENCES golf_courses(id),
  FOREIGN KEY (back_course_id)  REFERENCES golf_courses(id)
);
CREATE INDEX IF NOT EXISTS idx_golf_rounds_owner_date ON golf_rounds(owner_user_id, played_on);

CREATE TABLE IF NOT EXISTS golf_round_players (
  round_id    TEXT NOT NULL,
  player_id   TEXT NOT NULL,
  total       INTEGER NOT NULL,
  front_total INTEGER,
  back_total  INTEGER,
  putts_total INTEGER,
  PRIMARY KEY (round_id, player_id),
  FOREIGN KEY (round_id)  REFERENCES golf_rounds(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES golf_players(id)
);
CREATE INDEX IF NOT EXISTS idx_golf_round_players_player ON golf_round_players(player_id);

CREATE TABLE IF NOT EXISTS golf_hole_scores (
  round_id  TEXT NOT NULL,
  player_id TEXT NOT NULL,
  hole_no   INTEGER NOT NULL CHECK (hole_no BETWEEN 1 AND 18),
  par       INTEGER NOT NULL,
  strokes   INTEGER NOT NULL,
  putts     INTEGER,
  PRIMARY KEY (round_id, player_id, hole_no),
  FOREIGN KEY (round_id, player_id) REFERENCES golf_round_players(round_id, player_id) ON DELETE CASCADE
);

-- 골프 스코어 집계 결과 캐시 (D1 무료 플랜 하루 읽기 500만 행 한도 대응).
-- 홈 요약·골친 전적·랭킹·라운드 목록 같은 집계를 매 요청마다 다시 계산하지 않고, 결과 JSON 을 저장해 두고 1행만 읽는다.
-- 라운드·동반자·골프장·코스가 바뀌면 repo.ts 가 같은 트랜잭션에서 이 테이블을 비운다 → 다음 조회 때 다시 계산해 채운다.
-- ⚠️ 운영 DB 를 SQL 로 직접 고친 뒤에는 `npm run db:golf:cache-clear:remote` 로 비워야 화면에 반영된다.
CREATE TABLE IF NOT EXISTS golf_stats_cache (
  owner_user_id TEXT NOT NULL,
  cache_key     TEXT NOT NULL,
  payload       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_user_id, cache_key)
);

-- /private/ziha 북마크 사이트 태그.
-- 제목에 붙던 "AV탑걸-AVTopGirl", "- 쏘걸", "- 123av" 같은 사이트명을 URL 도메인 기준 태그로 분리한다.
-- 값: topgirl | sogirl | 123av | missav | njav | NULL(그 외). 판정 규칙은 src/lib/ziha-site.ts detectSite() 와 같다.
-- 기존 제목의 사이트명 제거는 북마크 관리 패널 '주소변경' 탭의 [제목·태그 일괄 정리] 로 한다.
ALTER TABLE bookmarks ADD COLUMN site TEXT;

UPDATE bookmarks SET site = CASE
  WHEN LOWER(url) LIKE '%missav%'     THEN 'missav'
  WHEN LOWER(url) LIKE '%topgirl%'    THEN 'topgirl'
  WHEN LOWER(url) LIKE '%sogirl%'     THEN 'sogirl'
  WHEN LOWER(url) LIKE '%://123av.%' OR LOWER(url) LIKE '%.123av.%' THEN '123av'
  WHEN LOWER(url) LIKE '%njav%'       THEN 'njav'
  ELSE NULL
END;

CREATE INDEX IF NOT EXISTS idx_bookmarks_site ON bookmarks(site);

# 🗄️ Cloudflare D1 데이터베이스 관리 가이드

이 가이드는 BlueWine 호텔 예약 시스템의 D1 데이터베이스를 로컬에서 관리하는 방법을 설명합니다.

## 📋 목차
- [기본 명령어](#기본-명령어)
- [데이터 조회](#데이터-조회)
- [데이터 수정](#데이터-수정)
- [고급 관리](#고급-관리)
- [문제 해결](#문제-해결)

---

## 🚀 기본 명령어

### 데이터베이스 초기화 및 기본 관리

```bash
# 1. 데이터베이스 초기화 (테이블 생성 + 샘플 데이터)
npm run db:migrate

# 2. 모든 테이블 삭제 (주의!)
npm run db:reset

# 3. 테이블 목록 확인
npm run db:studio

# 4. 데이터베이스 정보 확인
npm run db:info

# 5. 데이터베이스 백업
npm run db:backup
```

---

## 🔍 데이터 조회

### 빠른 조회 명령어

```bash
# 호텔 정보 조회
npm run db:hotels

# 객실 타입 조회  
npm run db:rooms

# 가격 정보 조회
npm run db:prices

# 예약 현황 조회
npm run db:reservations

# 종합 상태 리포트
npm run db:status
```

### 커스텀 쿼리 실행

```bash
# 특정 날짜 예약 조회
npx wrangler d1 execute bl-house --local --command="
SELECT * FROM reservations 
WHERE check_in_date = '2024-12-25';
"

# 객실별 수익 분석
npx wrangler d1 execute bl-house --local --command="
SELECT 
    rt.name as room_type,
    COUNT(r.id) as reservation_count,
    SUM(r.total_amount) as total_revenue,
    AVG(r.total_amount) as avg_price
FROM reservations r 
JOIN room_types rt ON r.room_type_id = rt.id 
WHERE r.status = 1  -- 1: 확정
GROUP BY rt.id, rt.name;
"

# 월별 매출 통계
npx wrangler d1 execute bl-house --local --command="
SELECT 
    strftime('%Y-%m', created_at) as month,
    COUNT(*) as bookings,
    SUM(total_amount) as revenue
FROM reservations 
WHERE status = 1  -- 1: 확정
GROUP BY strftime('%Y-%m', created_at)
ORDER BY month DESC;
"
```

---

## ✏️ 데이터 수정

### 일반적인 수정 작업

```bash
# 호텔 정보 업데이트
npx wrangler d1 execute bl-house --local --command="
UPDATE hotels 
SET description = '새로운 호텔 설명' 
WHERE id = 1;
"

# 가격 업데이트 (10% 인상)
npx wrangler d1 execute bl-house --local --command="
UPDATE room_prices 
SET price = price * 1.1 
WHERE room_type_id = 1 AND price_date >= date('now');
"

# 예약 상태 변경
npx wrangler d1 execute bl-house --local --command="
UPDATE reservations 
SET status = 1  -- 1: 확정
WHERE reservation_code = 'BW20241225123456';
"
```

### 복잡한 수정 작업 (SQL 파일 사용)

```bash
# 데이터 관리 스크립트 실행 (주의: 데이터 변경됨)
npx wrangler d1 execute bl-house --local --file=./queries/data_management.sql

# 특정 부분만 실행하려면 SQL 파일을 편집한 후 실행
```

---

## 🛠️ 고급 관리

### 1. SQLite Shell 모드

```bash
# SQLite 대화형 셸 진입
npm run db:shell

# 셸에서 사용할 수 있는 명령어들:
.tables          # 테이블 목록
.schema hotels   # 테이블 스키마 보기
.mode column     # 컬럼 모드로 출력
.headers on      # 헤더 표시
.quit            # 종료
```

### 2. GUI 도구 사용

#### DB Browser for SQLite 사용법:
1. [DB Browser for SQLite](https://sqlitebrowser.org/) 다운로드
2. `.wrangler/state/v3/d1/` 폴더에서 `.sqlite` 파일 찾기
3. GUI 도구로 파일 열기
4. 시각적 인터페이스로 데이터 조회/수정

#### VS Code Extension:
1. "SQLite Viewer" 확장프로그램 설치
2. SQLite 파일을 VS Code로 열기
3. 에디터에서 직접 테이블 내용 확인

### 3. 데이터 백업 및 복원

```bash
# 백업 생성
npm run db:backup

# 백업에서 복원 (로컬)
npx wrangler d1 execute bl-house --local --file=./backup.sql

# 원격 데이터베이스에 배포
npx wrangler d1 execute bl-house --file=./backup.sql
```

### 4. 개발 vs 운영 환경 관리

```bash
# 로컬 환경 (개발)
npx wrangler d1 execute bl-house --local --command="SELECT COUNT(*) FROM reservations;"

# 원격 환경 (운영) - 주의해서 사용!
npx wrangler d1 execute bl-house --command="SELECT COUNT(*) FROM reservations;"

# 로컬에서 원격으로 데이터 동기화
npm run db:migrate:remote
```

---

## 🚨 문제 해결

### 일반적인 문제들

#### 1. "command not found: wrangler"
```bash
# 해결: npx 사용하거나 전역 설치
npx wrangler --version
# 또는
npm install -g wrangler
```

#### 2. "Database not found"
```bash
# wrangler.json 확인
cat wrangler.json

# D1 데이터베이스 목록 확인
npx wrangler d1 list
```

#### 3. "Permission denied" 또는 파일 접근 불가
```bash
# .wrangler 폴더 권한 확인
ls -la .wrangler/

# 캐시 클리어
rm -rf .wrangler/
npm run db:migrate
```

#### 4. 데이터 손실 시 복구
```bash
# 1. 백업에서 복구
npx wrangler d1 execute bl-house --local --file=./backup.sql

# 2. 마이그레이션 재실행
npm run db:reset
npm run db:migrate

# 3. 원격에서 로컬로 복사 (운영 → 개발)
npx wrangler d1 export bl-house --output=./remote-backup.sql
npx wrangler d1 execute bl-house --local --file=./remote-backup.sql
```

### 디버깅 도구

```bash
# Wrangler 로그 레벨 증가
WRANGLER_LOG=debug npx wrangler d1 execute bl-house --local --command="SELECT 1;"

# D1 상태 확인
npx wrangler d1 info bl-house

# SQLite 파일 직접 확인
find . -name "*.sqlite*" -ls
```

---

## 📊 유용한 쿼리 모음

### 비즈니스 인사이트

```sql
-- 가장 인기 있는 객실 타입
SELECT 
    rt.name,
    COUNT(r.id) as booking_count,
    AVG(r.total_amount) as avg_price
FROM reservations r
JOIN room_types rt ON r.room_type_id = rt.id
WHERE r.status = 1  -- 1: 확정
GROUP BY rt.id
ORDER BY booking_count DESC;

-- 월별 점유율
SELECT 
    strftime('%Y-%m', check_in_date) as month,
    COUNT(*) as bookings,
    COUNT(DISTINCT check_in_date) as booked_days
FROM reservations
WHERE status IN (1, 2, 3)  -- 1: 확정, 2: 체크인, 3: 체크아웃
GROUP BY strftime('%Y-%m', check_in_date);

-- 고객 분석 (재방문 고객)
SELECT 
    guest_email,
    COUNT(*) as visit_count,
    SUM(total_amount) as total_spent,
    MAX(created_at) as last_visit
FROM reservations
GROUP BY guest_email
HAVING COUNT(*) > 1
ORDER BY visit_count DESC;
```

### 운영 관리

```sql
-- 오늘 체크인 예정 고객
SELECT 
    reservation_code,
    guest_name,
    guest_phone,
    rt.name as room_type,
    (adults + children) as guests_count
FROM reservations r
JOIN room_types rt ON r.room_type_id = rt.id
WHERE check_in_date = date('now') AND status = 1;  -- 1: 확정

-- 취소된 예약 분석
SELECT 
    strftime('%Y-%m', created_at) as month,
    COUNT(CASE WHEN status = 0 THEN 1 END) as cancelled,  -- 0: 취소
    COUNT(*) as total,
    ROUND(COUNT(CASE WHEN status = 0 THEN 1 END) * 100.0 / COUNT(*), 2) as cancellation_rate
FROM reservations
GROUP BY strftime('%Y-%m', created_at)
ORDER BY month DESC;
```

---

## 🔒 보안 및 주의사항

### 중요한 규칙
1. **운영 데이터베이스는 절대 실수로 수정하지 마세요**
2. **백업을 정기적으로 생성하세요**
3. **민감한 정보(개인정보)는 로그에 출력하지 마세요**
4. **SQL Injection 방지를 위해 동적 쿼리 작성 시 주의하세요**

### 권장 워크플로우
```bash
# 1. 로컬에서 테스트
npm run db:migrate
# 쿼리 테스트...

# 2. 백업 생성
npm run db:backup

# 3. 운영 배포 (신중히!)
npm run db:migrate:remote
```

---

이 가이드를 북마크하고 D1 데이터베이스 관리에 활용하세요! 🚀

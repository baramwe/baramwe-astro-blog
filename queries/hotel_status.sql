-- 호텔 운영 현황 종합 보고서
-- 실행방법: npx wrangler d1 execute bl-house --local --file=./queries/hotel_status.sql

-- 1. 호텔 기본 정보
SELECT '=== 호텔 기본 정보 ===' as section;
SELECT 
    id,
    name,
    name_en,
    address,
    phone,
    email
FROM hotels;

-- 2. 객실 타입별 현황
SELECT '=== 객실 타입별 현황 ===' as section;
SELECT 
    rt.name as '객실 타입',
    rt.base_price as '기본 가격',
    rt.max_occupancy as '최대 수용 인원',
    COUNT(r.id) as '총 객실 수'
FROM room_types rt
LEFT JOIN rooms r ON rt.id = r.room_type_id
GROUP BY rt.id, rt.name;

-- 3. 이번 주 가격 현황
SELECT '=== 이번 주 가격 현황 ===' as section;
SELECT 
    rt.name as '객실 타입',
    rp.price_date as '날짜',
    rp.price as '가격',
    CASE WHEN rp.is_weekend = 1 THEN '주말' ELSE '평일' END as '구분'
FROM room_types rt
JOIN room_prices rp ON rt.id = rp.room_type_id
WHERE rp.price_date BETWEEN date('now') AND date('now', '+7 days')
ORDER BY rp.price_date, rt.name;

-- 4. 최근 예약 현황
SELECT '=== 최근 예약 현황 ===' as section;
SELECT 
    r.reservation_code as '예약번호',
    r.guest_name as '고객명',
    rt.name as '객실타입',
    r.check_in_date as '체크인',
    r.check_out_date as '체크아웃',
    (r.adults + r.children) as '인원',
    r.total_amount as '총액',
    CASE r.status 
        WHEN 1 THEN '확정'
        WHEN 2 THEN '체크인'  
        WHEN 3 THEN '체크아웃'
        WHEN 0 THEN '취소'
        ELSE '기타'
    END as '상태',
    r.created_at as '예약일시'
FROM reservations r
JOIN room_types rt ON r.room_type_id = rt.id
ORDER BY r.created_at DESC
LIMIT 10;

-- 5. 매출 통계 (확정된 예약 기준)
SELECT '=== 매출 통계 ===' as section;
SELECT 
    COUNT(*) as '총 예약 건수',
    SUM(total_amount) as '총 매출',
    AVG(total_amount) as '평균 예약금액',
    MIN(total_amount) as '최소 예약금액',
    MAX(total_amount) as '최대 예약금액'
FROM reservations 
WHERE status = 1;

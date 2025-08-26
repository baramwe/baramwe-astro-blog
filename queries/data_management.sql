-- 데이터 관리 및 수정 쿼리 모음
-- 주의: 이 파일의 쿼리들은 데이터를 변경하므로 주의해서 사용하세요!

-- ============================================
-- 호텔 정보 수정
-- ============================================

-- 호텔 설명 업데이트
UPDATE hotels 
SET description = '제주도의 아름다운 바다를 바라보며 럭셔리한 휴식을 즐기실 수 있는 프리미엄 골프 리조트입니다. 18홀 챔피언십 코스와 함께 최고급 스파 시설을 갖추고 있습니다.'
WHERE id = 1;

-- 호텔 연락처 정보 업데이트  
UPDATE hotels 
SET 
    phone = '064-123-4567',
    email = 'reservation@bluewine-resort.com',
    website = 'https://www.bluewine-resort.com'
WHERE id = 1;

-- ============================================
-- 객실 가격 관리
-- ============================================

-- 특정 날짜 가격 수정 (예: 성수기 가격 인상)
UPDATE room_prices 
SET price = price * 1.2 
WHERE price_date BETWEEN '2024-12-20' AND '2024-12-31' 
AND room_type_id = 1;

-- 주말 가격 일괄 수정
UPDATE room_prices 
SET price = base_price * 1.2
FROM (SELECT base_price FROM room_types WHERE id = room_prices.room_type_id)
WHERE is_weekend = 1;

-- 새로운 날짜 가격 추가 (향후 30일)
INSERT INTO room_prices (room_type_id, price_date, price, is_weekend)
SELECT 
    rt.id as room_type_id,
    date('now', '+' || numbers.n || ' days') as price_date,
    CASE 
        WHEN strftime('%w', date('now', '+' || numbers.n || ' days')) IN ('0', '6') 
        THEN rt.base_price * 1.2  -- 주말 20% 할증
        ELSE rt.base_price        -- 평일 기본 가격
    END as price,
    CASE 
        WHEN strftime('%w', date('now', '+' || numbers.n || ' days')) IN ('0', '6') 
        THEN 1 ELSE 0 
    END as is_weekend
FROM room_types rt
CROSS JOIN (
    WITH RECURSIVE numbers(n) AS (
        SELECT 8  -- 8일부터 시작 (기존 7일 데이터 이후)
        UNION ALL 
        SELECT n + 1 FROM numbers WHERE n < 37  -- 30일치 추가
    )
    SELECT n FROM numbers
) numbers;

-- ============================================
-- 예약 관리
-- ============================================

-- 예약 상태 변경
UPDATE reservations 
SET status = 1, updated_at = datetime('now')  -- 1: 확정
WHERE reservation_code = 'TEST001';

-- 예약 취소
UPDATE reservations 
SET 
    status = 0,  -- 0: 취소
    updated_at = datetime('now'),
    special_requests = '고객 요청으로 취소'
WHERE reservation_code = 'TEST001';

-- 체크인 처리
UPDATE reservations 
SET 
    status = 2,  -- 2: 체크인
    updated_at = datetime('now'),
    special_requests = '체크인 완료'
WHERE reservation_code = 'TEST001' AND check_in_date <= date('now');

-- 체크아웃 처리
UPDATE reservations 
SET 
    status = 3,  -- 3: 체크아웃
    updated_at = datetime('now'),
    special_requests = '체크아웃 완료'
WHERE reservation_code = 'TEST001' AND check_out_date <= date('now');

-- ============================================
-- 테스트 데이터 추가
-- ============================================

-- 테스트 예약 추가
INSERT INTO reservations (
    reservation_code, hotel_id, room_type_id, 
    guest_name, guest_phone, guest_email,
    check_in_date, check_out_date, adults, children, total_nights,
    total_amount, status, special_requests
) VALUES (
    'BW' || strftime('%Y%m%d%H%M%S', 'now'), -- 고유한 예약 코드 생성
    1, 1, 
    '김제주', '010-1234-5678', 'kim.jeju@example.com',
    date('now', '+3 days'), date('now', '+5 days'), 2, 0, 2,
    700000, 1, '테스트 예약'  -- status 1: 확정
);

-- ============================================
-- 데이터 정리
-- ============================================

-- 오래된 예약 데이터 정리 (1년 이전)
DELETE FROM reservations 
WHERE created_at < datetime('now', '-1 year') 
AND status IN (0, 3);  -- 0: 취소, 3: 체크아웃 완료

-- 오래된 가격 데이터 정리 (과거 데이터)
DELETE FROM room_prices 
WHERE price_date < date('now', '-30 days');

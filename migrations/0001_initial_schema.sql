-- 호텔 예약 시스템 초기 스키마
-- UTF-8 한글 지원

-- 호텔 기본 정보
CREATE TABLE hotels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  check_in_time TEXT DEFAULT '15:00',
  check_out_time TEXT DEFAULT '11:00',
  images TEXT, -- JSON 배열로 이미지 URL 저장
  amenities TEXT, -- JSON 배열로 편의시설 저장
  location_lat REAL,
  location_lng REAL,
  status INTEGER DEFAULT 1, -- 1: 활성, 0: 비활성
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 객실 타입
CREATE TABLE room_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  max_occupancy INTEGER NOT NULL DEFAULT 2,
  bed_type TEXT, -- '더블', '트윈', '퀸', '킹' 등
  room_size INTEGER, -- 평방미터
  amenities TEXT, -- JSON 배열
  images TEXT, -- JSON 배열
  base_price INTEGER NOT NULL, -- 기본 가격 (원)
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
);

-- 실제 객실 (인벤토리)
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hotel_id INTEGER NOT NULL,
  room_type_id INTEGER NOT NULL,
  room_number TEXT NOT NULL,
  floor INTEGER,
  status INTEGER DEFAULT 1, -- 1: 사용가능, 2: 정비중, 0: 사용불가
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE,
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
  UNIQUE(hotel_id, room_number)
);

-- 예약 정보
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reservation_code TEXT NOT NULL UNIQUE, -- 예약 코드
  hotel_id INTEGER NOT NULL,
  room_type_id INTEGER NOT NULL,
  room_id INTEGER, -- 체크인 시 배정
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  guest_email TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  adults INTEGER NOT NULL DEFAULT 1,
  children INTEGER DEFAULT 0,
  total_nights INTEGER NOT NULL,
  total_amount INTEGER NOT NULL, -- 총 결제 금액
  payment_status INTEGER DEFAULT 0, -- 0: 미결제, 1: 결제완료, 2: 취소
  special_requests TEXT,
  status INTEGER DEFAULT 1, -- 1: 확정, 2: 체크인, 3: 체크아웃, 0: 취소
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hotel_id) REFERENCES hotels(id),
  FOREIGN KEY (room_type_id) REFERENCES room_types(id),
  FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- 객실 가격 (날짜별/시즌별 가격 관리)
CREATE TABLE room_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_type_id INTEGER NOT NULL,
  price_date DATE NOT NULL,
  price INTEGER NOT NULL,
  is_weekend INTEGER DEFAULT 0, -- 0: 평일, 1: 주말
  is_holiday INTEGER DEFAULT 0, -- 0: 일반, 1: 공휴일
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE CASCADE,
  UNIQUE(room_type_id, price_date)
);

-- 인덱스 생성
CREATE INDEX idx_reservations_dates ON reservations(check_in_date, check_out_date);
CREATE INDEX idx_reservations_code ON reservations(reservation_code);
CREATE INDEX idx_room_prices_date ON room_prices(price_date);
CREATE INDEX idx_rooms_hotel_type ON rooms(hotel_id, room_type_id);

-- 샘플 데이터 삽입
INSERT INTO hotels (name, name_en, description, address, phone, email, images, amenities) VALUES 
('블루와인 리조트', 'BlueWine Resort', '제주도의 아름다운 바다를 바라보는 프리미엄 골프 리조트입니다.', '제주특별자치도 제주시 애월읍 해안로 123', '064-123-4567', 'info@bluewine-resort.com', '["hotel1.png"]', '["골프장", "스파", "수영장", "레스토랑", "비즈니스센터", "무료WiFi", "주차장"]');

INSERT INTO room_types (hotel_id, name, name_en, description, max_occupancy, bed_type, room_size, amenities, images, base_price) VALUES 
(1, '오션뷰 스위트', 'Ocean View Suite', '넓은 바다 전망을 감상할 수 있는 프리미엄 스위트룸입니다.', 4, '킹베드', 85, '["바다전망", "발코니", "미니바", "커피머신", "욕조", "무료WiFi"]', '["hotel1.png"]', 350000),
(1, '가든뷰 디럭스', 'Garden View Deluxe', '아름다운 정원이 보이는 편안한 객실입니다.', 2, '더블베드', 55, '["정원전망", "발코니", "미니바", "커피머신", "무료WiFi"]', '["hotel1.png"]', 250000),
(1, '스탠다드 룸', 'Standard Room', '합리적인 가격의 깔끔한 표준 객실입니다.', 2, '퀸베드', 35, '["미니바", "커피머신", "무료WiFi"]', '["hotel1.png"]', 180000);

INSERT INTO rooms (hotel_id, room_type_id, room_number, floor) VALUES 
(1, 1, '501', 5), (1, 1, '502', 5), (1, 1, '503', 5),
(1, 2, '301', 3), (1, 2, '302', 3), (1, 2, '303', 3), (1, 2, '304', 3),
(1, 3, '201', 2), (1, 3, '202', 2), (1, 3, '203', 2), (1, 3, '204', 2), (1, 3, '205', 2);

-- 기본 가격 설정 (오늘부터 7일간 샘플 데이터)
-- 오션뷰 스위트 (room_type_id = 1)
INSERT INTO room_prices (room_type_id, price_date, price, is_weekend) VALUES
(1, date('now'), 350000, 0),
(1, date('now', '+1 day'), 350000, 0),
(1, date('now', '+2 day'), 350000, 0),
(1, date('now', '+3 day'), 350000, 0),
(1, date('now', '+4 day'), 350000, 0),
(1, date('now', '+5 day'), 420000, 1), -- 주말
(1, date('now', '+6 day'), 420000, 1); -- 주말

-- 가든뷰 디럭스 (room_type_id = 2)
INSERT INTO room_prices (room_type_id, price_date, price, is_weekend) VALUES
(2, date('now'), 250000, 0),
(2, date('now', '+1 day'), 250000, 0),
(2, date('now', '+2 day'), 250000, 0),
(2, date('now', '+3 day'), 250000, 0),
(2, date('now', '+4 day'), 250000, 0),
(2, date('now', '+5 day'), 300000, 1), -- 주말
(2, date('now', '+6 day'), 300000, 1); -- 주말

-- 스탠다드 룸 (room_type_id = 3)
INSERT INTO room_prices (room_type_id, price_date, price, is_weekend) VALUES
(3, date('now'), 180000, 0),
(3, date('now', '+1 day'), 180000, 0),
(3, date('now', '+2 day'), 180000, 0),
(3, date('now', '+3 day'), 180000, 0),
(3, date('now', '+4 day'), 180000, 0),
(3, date('now', '+5 day'), 216000, 1), -- 주말
(3, date('now', '+6 day'), 216000, 1); -- 주말

# 🏨 호텔 예약 시스템 설정 가이드

블루와인 프로젝트에 추가된 호텔 예약 시스템을 로컬에서 테스트하기 위한 설정 가이드입니다.

## 📋 시스템 구성

- **백엔드**: Cloudflare D1 Database + Prisma ORM
- **API**: Astro API Routes (REST API)
- **프론트엔드**: Astro + Vanilla TypeScript
- **스타일링**: 커스텀 CSS (Tailwind와 병용)

## 🚀 로컬 개발 환경 설정

### 1. 패키지 설치

```bash
# 프로젝트 루트에서 실행
npm install
```

### 2. Prisma 클라이언트 생성

```bash
npm run db:generate
```

### 3. 로컬 D1 데이터베이스 마이그레이션

```bash
# 로컬 D1 데이터베이스에 스키마 및 샘플 데이터 생성
npm run db:migrate
```

### 4. 개발 서버 실행

```bash
# Astro 개발 서버 실행
npm run dev
```

## 🗄️ 데이터베이스 관리 명령어

```bash
# 로컬 DB 초기화 (테이블 삭제)
npm run db:reset

# 로컬 DB 마이그레이션 (테이블 생성 + 샘플 데이터)
npm run db:migrate

# 원격 DB 마이그레이션 (프로덕션용)
npm run db:migrate:remote

# Prisma 클라이언트 재생성
npm run db:generate

# 로컬 DB 테이블 확인
npm run db:studio
```

## 📱 사용 가능한 페이지

### 1. 호텔 목록 (`/hotel`)
- 등록된 호텔들을 확인
- 체크인/체크아웃 날짜 선택
- 투숙객 수 선택

### 2. 호텔 상세 (`/hotel/[id]`)
- 호텔 상세 정보
- 객실 타입별 가격 확인
- 실시간 예약 가능 여부 체크

### 3. 예약하기 (`/hotel/booking`)
- 투숙객 정보 입력
- 예약 확정

### 4. 예약 확인 (`/hotel/booking/confirmation`)
- 예약 완료 확인
- 예약 번호 발급

### 5. 예약 조회 (`/hotel/reservations`)
- 예약 번호로 예약 정보 조회
- 예약 상태 및 세부 정보 확인

## 🧪 로컬 테스트 방법

### 개발환경에서의 동작

로컬 개발 환경에서는 Cloudflare Workers 환경이 아니므로 API가 실제 데이터베이스에 연결되지 않습니다. 대신 **샘플 데이터**가 표시됩니다.

### 샘플 데이터

**샘플 호텔**: 블루와인 리조트
- 오션뷰 스위트: ₩350,000/박
- 가든뷰 디럭스: ₩250,000/박  
- 스탠다드 룸: ₩180,000/박

**샘플 예약 코드**: `SAMPLE123`
- 예약 조회 페이지에서 테스트 가능

### 테스트 시나리오

1. **호텔 검색**: `/hotel` 접속 → 샘플 호텔 확인
2. **호텔 예약**: 객실 선택 → 예약 정보 입력 → 샘플 예약 생성
3. **예약 조회**: `/hotel/reservations` 접속 → `SAMPLE123` 입력

## 🔧 API 엔드포인트

### Hotels API
- `GET /api/hotel` - 호텔 목록
- `GET /api/hotel/[id]` - 호텔 상세 정보

### Reservations API  
- `GET /api/reservations/availability` - 객실 가용성 확인
- `POST /api/reservations/create` - 예약 생성
- `GET /api/reservations/[code]` - 예약 조회

## 🚀 프로덕션 배포

### Cloudflare Pages 배포

```bash
# 빌드 및 배포
npm run build
npm run deploy
```

### 환경 변수 설정

Cloudflare Pages 대시보드에서 설정:
- `DATABASE_URL`: (Wrangler가 자동 관리)
- `NODE_ENV`: `production`

## 📊 데이터베이스 스키마

### 주요 테이블

1. **hotels**: 호텔 기본 정보
2. **room_types**: 객실 타입 (스위트, 디럭스 등)
3. **rooms**: 실제 객실 인벤토리
4. **reservations**: 예약 정보
5. **room_prices**: 날짜별 객실 가격

### 샘플 데이터

- 1개 호텔 (블루와인 리조트)
- 3개 객실 타입
- 12개 객실
- 30일간 가격 데이터

## 🐛 문제 해결

### 1. API 오류 시
```bash
# Prisma 클라이언트 재생성
npm run db:generate

# 개발 서버 재시작
npm run dev
```

### 2. 데이터베이스 오류 시
```bash
# 로컬 DB 초기화 후 재생성
npm run db:reset
npm run db:migrate
```

### 3. 패키지 오류 시
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

## 📝 추가 개발 시 주의사항

1. **한글 지원**: 모든 텍스트 필드는 UTF-8 인코딩 지원
2. **반응형 디자인**: 모바일 우선 설계
3. **에러 처리**: 개발환경과 프로덕션 환경 분리
4. **SEO 최적화**: 각 페이지별 메타태그 설정
5. **접근성**: ARIA 레이블 및 키보드 네비게이션 지원

## 🎯 향후 확장 계획

- [ ] 결제 시스템 연동 (PortOne, Toss Payments)
- [ ] 관리자 대시보드 (객실/예약 관리)
- [ ] 이메일/SMS 알림 시스템
- [ ] 다국어 지원 (한/영)
- [ ] 모바일 앱 (PWA)

---

문의사항이나 버그 발견 시 이슈로 등록해 주세요! 🚀

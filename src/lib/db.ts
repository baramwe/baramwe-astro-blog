// Prisma 클라이언트 및 D1 어댑터 설정
export interface Env {
  DB: D1Database
  GCP_SERVICE_ACCOUNT_KEY?: string
}

export async function getPrismaClient(db: D1Database) {
  // 브라우저 환경에서는 사용 금지
  if (typeof window !== 'undefined') {
    throw new Error('Prisma client should not be used in browser environment')
  }
  
  try {
    // ES 모듈 방식의 동적 import 사용
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaD1 } = await import('@prisma/adapter-d1')
    
    const adapter = new PrismaD1(db)
    return new PrismaClient({ adapter })
  } catch (error) {
    console.error('Failed to initialize Prisma client:', error)
    throw error
  }
}

// 로컬 SQLite는 프로덕션 빌드에서 제외 (better-sqlite3가 Cloudflare Workers와 호환되지 않음)
// 로컬 개발 시에는 wrangler dev를 사용하여 D1 에뮬레이션 활용

// 예약 코드 생성 함수
export function generateReservationCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 날짜 헬퍼 함수들
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function getDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const timeDiff = end.getTime() - start.getTime()
  return Math.ceil(timeDiff / (1000 * 3600 * 24))
}

// 가용성 확인 함수
export async function checkRoomAvailability(
  prisma: PrismaClient, 
  roomTypeId: number, 
  checkInDate: string, 
  checkOutDate: string
): Promise<boolean> {
  const conflicts = await prisma.reservation.findMany({
    where: {
      roomTypeId,
      status: { in: [1, 2] }, // 확정, 체크인 상태만
      AND: [
        {
          checkInDate: { lt: checkOutDate }
        },
        {
          checkOutDate: { gt: checkInDate }
        }
      ]
    }
  })

  // 해당 룸타입의 총 객실 수
  const totalRooms = await prisma.room.count({
    where: { 
      roomTypeId,
      status: 1 // 사용 가능한 방만
    }
  })

  return conflicts.length < totalRooms
}

// 가격 계산 함수
export async function calculateTotalPrice(
  prisma: PrismaClient,
  roomTypeId: number,
  checkInDate: string,
  checkOutDate: string
): Promise<number> {
  const nights = getDaysBetween(checkInDate, checkOutDate)
  let totalPrice = 0

  for (let i = 0; i < nights; i++) {
    const currentDate = formatDate(addDays(new Date(checkInDate), i))
    
    const price = await prisma.roomPrice.findUnique({
      where: {
        roomTypeId_priceDate: {
          roomTypeId,
          priceDate: currentDate
        }
      }
    })

    if (price) {
      totalPrice += price.price
    } else {
      // 가격이 없으면 기본 가격 사용
      const roomType = await prisma.roomType.findUnique({
        where: { id: roomTypeId }
      })
      totalPrice += roomType?.basePrice || 0
    }
  }

  return totalPrice
}

// PrismaClient 타입을 조건부로 export
export type PrismaClient = any

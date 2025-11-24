import path from 'path'
import fs from 'fs'

// Prisma 클라이언트 및 D1 어댑터 설정
export interface Env {
  DB: D1Database
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

// 로컬 SQLite 데이터베이스 연결 함수
export async function getLocalSqliteClient() {
  if (typeof window !== 'undefined') {
    throw new Error('SQLite client should not be used in browser environment')
  }

  try {
    // 동적 import로 better-sqlite3 불러오기 (ES 모듈 호환)
    const { default: Database } = await import('better-sqlite3')
    
    // D1 로컬 SQLite 파일 경로 찾기 (개선된 버전)
    const possiblePaths = [
      '.wrangler/state/v3/d1/miniflare-D1DatabaseObject',
      '.wrangler/state/d1/miniflare-D1DatabaseObject',
      '.wrangler/state/v3/d1',
      '.wrangler/state/d1'
    ]
    
    let dbPath = null
    
    // 1. 기존 방식으로 시도
    for (const basePath of possiblePaths) {
      if (fs.existsSync(basePath)) {
        console.log(`🔍 경로 확인 중: ${basePath}`)
        
        try {
          const files = fs.readdirSync(basePath)
          console.log(`📁 파일 목록:`, files)
          
          const sqliteFile = files.find(f => f.endsWith('.sqlite'))
          if (sqliteFile) {
            dbPath = path.join(basePath, sqliteFile)
            console.log(`✅ SQLite 파일 발견: ${dbPath}`)
            break
          }
        } catch (err) {
          console.log(`⚠️ 디렉토리 읽기 실패: ${basePath}`, err)
        }
      }
    }
    
    // 2. 재귀적으로 .wrangler 전체를 검색
    if (!dbPath && fs.existsSync('.wrangler')) {
      console.log('🔍 .wrangler 전체 검색 중...')
      
      function findSqliteFiles(dir) {
        try {
          const items = fs.readdirSync(dir)
          for (const item of items) {
            const fullPath = path.join(dir, item)
            const stat = fs.statSync(fullPath)
            
            if (stat.isDirectory()) {
              const result = findSqliteFiles(fullPath)
              if (result) return result
            } else if (item.endsWith('.sqlite')) {
              console.log(`✅ 재귀 검색으로 SQLite 파일 발견: ${fullPath}`)
              return fullPath
            }
          }
        } catch (err) {
          // 권한 에러 등은 무시
        }
        return null
      }
      
      dbPath = findSqliteFiles('.wrangler')
    }
    
    if (!dbPath) {
      throw new Error('로컬 D1 SQLite 파일을 찾을 수 없습니다. wrangler dev를 먼저 실행해주세요.')
    }
    
    console.log('🔗 로컬 SQLite 연결:', dbPath)
    return new Database(dbPath, { readonly: false })
    
  } catch (error) {
    console.error('로컬 SQLite 연결 실패:', error)
    throw error
  }
}

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

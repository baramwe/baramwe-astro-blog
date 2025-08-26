// 예약 생성 API
import type { APIRoute } from 'astro'
import { getPrismaClient, checkRoomAvailability, calculateTotalPrice, generateReservationCode, getDaysBetween, type Env } from '../../../lib/db'

interface CreateReservationRequest {
  roomTypeId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
  guestPhone: string
  guestEmail?: string
  adults: number
  children: number
  specialRequests?: string
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body: CreateReservationRequest = await request.json()
    
    const {
      roomTypeId,
      checkInDate,
      checkOutDate,
      guestName,
      guestPhone,
      guestEmail,
      adults = 1,
      children = 0,
      specialRequests
    } = body

    // 필수 필드 검증
    if (!roomTypeId || !checkInDate || !checkOutDate || !guestName || !guestPhone) {
      return new Response(JSON.stringify({ 
        error: '필수 정보가 누락되었습니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 날짜 유효성 검사
    const checkIn = new Date(checkInDate)
    const checkOut = new Date(checkOutDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (checkIn < today) {
      return new Response(JSON.stringify({ 
        error: '체크인 날짜는 오늘 이후여야 합니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (checkOut <= checkIn) {
      return new Response(JSON.stringify({ 
        error: '체크아웃 날짜는 체크인 날짜 이후여야 합니다.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const env = (globalThis as any).process?.env?.NODE_ENV === 'development' 
      ? null 
      : (request as any).cf?.env as Env

    if (!env?.DB) {
      // 로컬 환경에서는 200 상태로 에러 정보를 반환
      return new Response(JSON.stringify({
        error: 'Database not available. This API works only in Cloudflare Workers environment.',
        development: true,
        message: 'Local development mode - sample data will be shown'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const prisma = getPrismaClient(env.DB)

    // 객실 타입 존재 여부 확인
    const roomType = await prisma.roomType.findUnique({
      where: { id: roomTypeId, status: 1 },
      include: { hotel: true }
    })

    if (!roomType) {
      return new Response(JSON.stringify({ 
        error: '해당 객실 타입을 찾을 수 없습니다.' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 최대 수용인원 확인
    if (adults + children > roomType.maxOccupancy) {
      return new Response(JSON.stringify({ 
        error: `최대 수용인원(${roomType.maxOccupancy}명)을 초과했습니다.` 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 가용성 재확인
    const isAvailable = await checkRoomAvailability(prisma, roomTypeId, checkInDate, checkOutDate)
    
    if (!isAvailable) {
      return new Response(JSON.stringify({ 
        error: '선택한 날짜에 예약 가능한 객실이 없습니다.' 
      }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 총 금액 계산
    const totalNights = getDaysBetween(checkInDate, checkOutDate)
    const totalAmount = await calculateTotalPrice(prisma, roomTypeId, checkInDate, checkOutDate)
    
    // 예약 코드 생성 (중복 확인)
    let reservationCode: string
    let attempts = 0
    do {
      reservationCode = generateReservationCode()
      const existing = await prisma.reservation.findUnique({
        where: { reservationCode }
      })
      if (!existing) break
      attempts++
    } while (attempts < 10)

    if (attempts >= 10) {
      return new Response(JSON.stringify({ 
        error: '예약 코드 생성에 실패했습니다. 다시 시도해주세요.' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 예약 생성
    const reservation = await prisma.reservation.create({
      data: {
        reservationCode,
        hotelId: roomType.hotel.id,
        roomTypeId,
        guestName,
        guestPhone,
        guestEmail,
        checkInDate,
        checkOutDate,
        adults,
        children,
        totalNights,
        totalAmount,
        specialRequests,
        paymentStatus: 0, // 미결제
        status: 1 // 확정
      },
      include: {
        hotel: true,
        roomType: true
      }
    })

    return new Response(JSON.stringify({
      success: true,
      reservation: {
        id: reservation.id,
        reservationCode: reservation.reservationCode,
        hotelName: reservation.hotel.name,
        roomTypeName: reservation.roomType.name,
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        totalNights: reservation.totalNights,
        totalAmount: reservation.totalAmount,
        guestName: reservation.guestName,
        guestPhone: reservation.guestPhone,
        adults: reservation.adults,
        children: reservation.children,
        status: reservation.status,
        paymentStatus: reservation.paymentStatus
      }
    }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Create Reservation API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to create reservation',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

// OPTIONS 메서드 추가 (CORS preflight 대응)
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}

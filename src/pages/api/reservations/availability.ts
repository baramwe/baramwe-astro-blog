// 객실 가용성 확인 API
import type { APIRoute } from 'astro'
import { getPrismaClient, checkRoomAvailability, calculateTotalPrice, type Env } from '../../../lib/db'

export const GET: APIRoute = async ({ url, request }) => {
  try {
    const searchParams = new URL(url).searchParams
    const roomTypeId = parseInt(searchParams.get('roomTypeId') || '')
    const checkInDate = searchParams.get('checkInDate')
    const checkOutDate = searchParams.get('checkOutDate')

    if (!roomTypeId || !checkInDate || !checkOutDate) {
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: roomTypeId, checkInDate, checkOutDate' 
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

    // 객실 존재 여부 확인
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

    // 가용성 확인
    const isAvailable = await checkRoomAvailability(prisma, roomTypeId, checkInDate, checkOutDate)
    
    // 가격 계산
    const totalPrice = await calculateTotalPrice(prisma, roomTypeId, checkInDate, checkOutDate)
    
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24))

    return new Response(JSON.stringify({
      available: isAvailable,
      roomType: {
        id: roomType.id,
        name: roomType.name,
        hotelName: roomType.hotel.name
      },
      checkInDate,
      checkOutDate,
      nights,
      totalPrice,
      pricePerNight: Math.round(totalPrice / nights)
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Availability API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to check availability',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

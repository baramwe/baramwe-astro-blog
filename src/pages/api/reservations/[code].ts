// 예약 조회 API
import type { APIRoute } from 'astro'
import { getPrismaClient, type Env } from '../../../lib/db'

export const prerender = false

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const reservationCode = params.code as string
    
    if (!reservationCode) {
      return new Response(JSON.stringify({ error: 'Reservation code is required' }), {
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

    const reservation = await prisma.reservation.findUnique({
      where: { reservationCode },
      include: {
        hotel: true,
        roomType: true,
        room: true
      }
    })

    if (!reservation) {
      return new Response(JSON.stringify({ 
        error: '예약을 찾을 수 없습니다. 예약 번호를 확인해주세요.' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // 상태 텍스트 매핑
    const getStatusText = (status: number) => {
      switch (status) {
        case 0: return '취소됨'
        case 1: return '예약 확정'
        case 2: return '체크인 완료'
        case 3: return '체크아웃 완료'
        default: return '알 수 없음'
      }
    }

    const getPaymentStatusText = (status: number) => {
      switch (status) {
        case 0: return '미결제'
        case 1: return '결제 완료'
        case 2: return '취소/환불'
        default: return '알 수 없음'
      }
    }

    const result = {
      id: reservation.id,
      reservationCode: reservation.reservationCode,
      hotel: {
        id: reservation.hotel.id,
        name: reservation.hotel.name,
        address: reservation.hotel.address,
        phone: reservation.hotel.phone,
        checkInTime: reservation.hotel.checkInTime,
        checkOutTime: reservation.hotel.checkOutTime
      },
      roomType: {
        id: reservation.roomType.id,
        name: reservation.roomType.name,
        description: reservation.roomType.description,
        maxOccupancy: reservation.roomType.maxOccupancy,
        bedType: reservation.roomType.bedType
      },
      room: reservation.room ? {
        id: reservation.room.id,
        roomNumber: reservation.room.roomNumber,
        floor: reservation.room.floor
      } : null,
      guestInfo: {
        name: reservation.guestName,
        phone: reservation.guestPhone,
        email: reservation.guestEmail
      },
      dates: {
        checkInDate: reservation.checkInDate,
        checkOutDate: reservation.checkOutDate,
        totalNights: reservation.totalNights
      },
      occupancy: {
        adults: reservation.adults,
        children: reservation.children,
        total: reservation.adults + reservation.children
      },
      pricing: {
        totalAmount: reservation.totalAmount,
        pricePerNight: Math.round(reservation.totalAmount / reservation.totalNights)
      },
      status: {
        reservation: reservation.status,
        reservationText: getStatusText(reservation.status),
        payment: reservation.paymentStatus,
        paymentText: getPaymentStatusText(reservation.paymentStatus)
      },
      specialRequests: reservation.specialRequests,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Get Reservation API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch reservation',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

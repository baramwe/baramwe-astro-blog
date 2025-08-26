// 호텔 상세 정보 API
import type { APIRoute } from 'astro'
import { getPrismaClient, type Env } from '../../../lib/db'

export const prerender = false

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const hotelId = parseInt(params.id as string)
    
    if (!hotelId) {
      return new Response(JSON.stringify({ error: 'Invalid hotel ID' }), {
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

    const hotel = await prisma.hotel.findUnique({
      where: { id: hotelId, status: 1 },
      include: {
        roomTypes: {
          where: { status: 1 },
          include: {
            rooms: {
              where: { status: 1 }
            },
            roomPrices: {
              where: {
                priceDate: {
                  gte: new Date().toISOString().split('T')[0]
                }
              },
              take: 30, // 30일치 가격
              orderBy: { priceDate: 'asc' }
            }
          }
        }
      }
    })

    if (!hotel) {
      return new Response(JSON.stringify({ error: 'Hotel not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // JSON 문자열 파싱
    const parsedHotel = {
      ...hotel,
      images: hotel.images ? JSON.parse(hotel.images) : [],
      amenities: hotel.amenities ? JSON.parse(hotel.amenities) : [],
      roomTypes: hotel.roomTypes.map(roomType => ({
        ...roomType,
        images: roomType.images ? JSON.parse(roomType.images) : [],
        amenities: roomType.amenities ? JSON.parse(roomType.amenities) : [],
        availableRooms: roomType.rooms.length
      }))
    }

    return new Response(JSON.stringify(parsedHotel), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Hotel Detail API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch hotel details',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

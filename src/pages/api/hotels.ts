// 호텔 목록 API
import type { APIRoute } from 'astro'
import { getPrismaClient, type Env } from '../../lib/db'

export const GET: APIRoute = async ({ request }) => {
  try {
    // Cloudflare runtime에서만 작동
    const env = (globalThis as any).process?.env?.NODE_ENV === 'development' 
      ? null 
      : (request as any).cf?.env as Env

    if (!env?.DB) {
      // 로컬 환경에서는 200 상태로 에러 정보를 반환하여 프론트엔드에서 적절히 처리하도록 함
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

    const hotels = await prisma.hotel.findMany({
      where: { status: 1 },
      include: {
        roomTypes: {
          where: { status: 1 },
          select: {
            id: true,
            name: true,
            basePrice: true,
            maxOccupancy: true,
            images: true
          }
        }
      }
    })

    // JSON 문자열로 저장된 데이터 파싱
    const parsedHotels = hotels.map(hotel => ({
      ...hotel,
      images: hotel.images ? JSON.parse(hotel.images) : [],
      amenities: hotel.amenities ? JSON.parse(hotel.amenities) : [],
      roomTypes: hotel.roomTypes.map(room => ({
        ...room,
        images: room.images ? JSON.parse(room.images) : []
      }))
    }))

    return new Response(JSON.stringify(parsedHotels), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })

  } catch (error) {
    console.error('Hotels API Error:', error)
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch hotels',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

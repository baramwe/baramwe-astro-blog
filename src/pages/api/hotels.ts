// 호텔 목록 API
import type { APIRoute } from 'astro'
import { getPrismaClient, type Env } from '../../lib/db'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('🏨 Hotels API 호출됨')

    // Cloudflare Workers runtime에서 env 가져오기
    let env: Env | null = null

    if ((locals as any)?.runtime?.env?.DB) {
      env = (locals as any).runtime.env as Env
    } else if ((request as any)?.cf?.env?.DB) {
      env = (request as any).cf.env as Env
    }

    if (!env?.DB) {
      return new Response(JSON.stringify({
        error: 'Database not available',
        message: 'D1 데이터베이스에 연결할 수 없습니다. wrangler dev로 실행해주세요.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log('☁️ D1 데이터베이스 연결...')

    const prisma = await getPrismaClient(env.DB)

    const hotelsData = await prisma.hotel.findMany({
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
    const hotels = hotelsData.map(hotel => ({
      ...hotel,
      images: hotel.images ? JSON.parse(hotel.images) : [],
      amenities: hotel.amenities ? JSON.parse(hotel.amenities) : [],
      roomTypes: hotel.roomTypes.map(room => ({
        ...room,
        images: room.images ? JSON.parse(room.images) : []
      }))
    }))

    console.log(`✅ D1에서 ${hotels.length}개 호텔 데이터 조회 완료`)

    return new Response(JSON.stringify(hotels), {
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

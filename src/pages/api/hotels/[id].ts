// 개별 호텔 상세 정보 API
import type { APIRoute } from 'astro'
import { getPrismaClient, type Env } from '../../../lib/db'

export const prerender = false

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const hotelId = parseInt(params.id as string)

    if (!hotelId) {
      return new Response(JSON.stringify({ error: 'Invalid hotel ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    console.log(`🏨 호텔 ID ${hotelId} 조회 API 호출됨`)

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

    console.log(`☁️ 호텔 ID ${hotelId} D1 데이터베이스에서 조회...`)

    const prisma = await getPrismaClient(env.DB)

    const hotelData = await prisma.hotel.findUnique({
      where: { id: hotelId, status: 1 },
      include: {
        roomTypes: {
          where: { status: 1 },
          select: {
            id: true,
            name: true,
            basePrice: true,
            maxOccupancy: true,
            roomSize: true,
            bedType: true,
            images: true,
            amenities: true
          }
        }
      }
    })

    if (!hotelData) {
      return new Response(JSON.stringify({
        error: 'Hotel not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // JSON 문자열로 저장된 데이터 파싱
    const hotel = {
      ...hotelData,
      images: hotelData.images ? JSON.parse(hotelData.images) : [],
      amenities: hotelData.amenities ? JSON.parse(hotelData.amenities) : [],
      roomTypes: hotelData.roomTypes.map(room => ({
        ...room,
        size: room.roomSize,
        images: room.images ? JSON.parse(room.images) : [],
        amenities: room.amenities ? JSON.parse(room.amenities) : []
      }))
    }

    console.log(`✅ D1에서 호텔 ID ${hotelId} 데이터 조회 완료`)

    return new Response(JSON.stringify(hotel), {
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
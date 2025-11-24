// 호텔 목록 API
import type { APIRoute } from 'astro'
import { getPrismaClient, getLocalSqliteClient, type Env } from '../../lib/db'

export const prerender = false

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    console.log('🏨 Hotels API 호출됨')
    
    // 환경 확인 (개선된 버전)
    let env: Env | null = null
    let environmentType = 'unknown'

    // 1. Cloudflare Workers runtime에서 env 가져오기 시도
    if ((locals as any)?.runtime?.env?.DB) {
      env = (locals as any).runtime.env as Env
      environmentType = 'wrangler-dev-runtime'
    }
    // 2. request.cf.env에서 가져오기 시도
    else if ((request as any)?.cf?.env?.DB) {
      env = (request as any).cf.env as Env
      environmentType = 'cloudflare-workers'
    }

    console.log(`🌍 감지된 환경: ${environmentType}`)
    console.log(`💾 DB 사용 가능: ${!!env?.DB}`)

    let hotels
    
    if (env?.DB) {
      // Cloudflare 환경: Prisma + D1 사용
      console.log('☁️ D1 데이터베이스 연결...')
      
      try {
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
        hotels = hotelsData.map(hotel => ({
          ...hotel,
          images: hotel.images ? JSON.parse(hotel.images) : [],
          amenities: hotel.amenities ? JSON.parse(hotel.amenities) : [],
          roomTypes: hotel.roomTypes.map(room => ({
            ...room,
            images: room.images ? JSON.parse(room.images) : []
          }))
        }))

        console.log(`✅ D1에서 ${hotels.length}개 호텔 데이터 조회 완료`)
      } catch (prismaError) {
        console.error('❌ Prisma 연결 실패:', prismaError)
        throw prismaError
      }
    } else {
      // 로컬 환경: SQLite 파일 직접 읽기
      console.log('🏠 로컬 환경에서 SQLite 데이터베이스 연결 시도...')
      
      try {
        const db = await getLocalSqliteClient()
        
        // SQL 쿼리로 직접 호텔 데이터 조회
        const hotelsQuery = `
          SELECT 
            h.id,
            h.name,
            h.name_en as nameEn,
            h.description,
            h.address,
            h.phone,
            h.email,
            h.images,
            h.amenities,
            h.status
          FROM hotels h 
          WHERE h.status = 1
        `
        
        const roomTypesQuery = `
          SELECT 
            rt.id,
            rt.hotel_id as hotelId,
            rt.name,
            rt.name_en as nameEn,
            rt.description,
            rt.max_occupancy as maxOccupancy,
            rt.room_size as size,
            rt.bed_type as bedType,
            rt.base_price as basePrice,
            rt.images,
            rt.amenities,
            rt.status
          FROM room_types rt 
          WHERE rt.status = 1
        `
        
        const hotelsData = db.prepare(hotelsQuery).all()
        const roomTypesData = db.prepare(roomTypesQuery).all()
        
        // 호텔에 룸타입 연결
        hotels = hotelsData.map(hotel => ({
          ...hotel,
          images: hotel.images ? JSON.parse(hotel.images) : [],
          amenities: hotel.amenities ? JSON.parse(hotel.amenities) : [],
          roomTypes: roomTypesData
            .filter(rt => rt.hotelId === hotel.id)
            .map(room => ({
              ...room,
              images: room.images ? JSON.parse(room.images) : [],
              amenities: room.amenities ? JSON.parse(room.amenities) : []
            }))
        }))
        
        db.close()
        console.log(`✅ 로컬 SQLite에서 ${hotels.length}개 호텔 데이터 조회 완료`)
        
      } catch (sqliteError) {
        console.error('❌ 로컬 SQLite 연결 실패:', sqliteError)
        
        // SQLite 연결 실패 시 샘플 데이터 반환
        return new Response(JSON.stringify({
          error: 'Local SQLite connection failed',
          development: true,
          message: 'SQLite 파일 연결에 실패했습니다. 샘플 데이터가 표시됩니다.'
        }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
    }

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

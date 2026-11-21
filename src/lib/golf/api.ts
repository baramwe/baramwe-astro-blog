import type { APIContext } from 'astro'
import { getDB } from '../auth/db'
import { getOwnerEmail, isOwner, json, type GolfContext } from './member'
import { GolfError } from './repo'

type Handler = (args: { ctx: GolfContext; db: D1Database; body: any; context: APIContext }) => Promise<Response>

/** 골프 API 공통 래퍼: 소유자 확인(미들웨어 이중 방어), JSON 파싱, GolfError → 응답 변환 */
export function golfApi(handler: Handler) {
  return async (context: APIContext): Promise<Response> => {
    const ctx = context.locals.golf
    if (!ctx || !isOwner(ctx.user, getOwnerEmail(context.locals))) return json({ error: 'not found' }, 404)
    const db = getDB(context.locals, context.request)
    if (!db) return json({ error: 'DB unavailable' }, 500)

    let body: any = null
    if (context.request.method !== 'GET' && context.request.method !== 'DELETE') {
      try {
        body = await context.request.json()
      } catch {
        return json({ error: 'Invalid JSON' }, 400)
      }
    }
    try {
      return await handler({ ctx, db, body, context })
    } catch (e) {
      if (e instanceof GolfError) return json({ error: e.message }, e.status)
      console.error('golf api error', e)
      return json({ error: '서버 오류가 발생했습니다.' }, 500)
    }
  }
}

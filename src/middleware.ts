import { defineMiddleware } from 'astro:middleware'
import { getDB } from './lib/auth/db'
import { getCurrentUser } from './lib/auth/session'
import { getOwnerEmail, isOwner, json } from './lib/golf/member'

// 골프 스코어 영역만 가드한다. /private/ziha 등 다른 경로는 각자 인증 방식이 있으므로 건드리지 않는다.
// 1인 전용: GOLF_OWNER_EMAIL 계정 외에는 로그인했더라도 404 (존재 자체를 숨긴다).
const PAGE_BASE = '/private/golf'
const API_BASE = '/api/golf'

const under = (path: string, base: string) => path === base || path.startsWith(base + '/')
const notFound = (isApi: boolean) =>
  isApi ? json({ error: 'not found' }, 404) : new Response('Not found', { status: 404 })

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname.replace(/\/+$/, '') || '/'
  const isPage = under(path, PAGE_BASE)
  const isApi = under(path, API_BASE)
  if (!isPage && !isApi) return next()

  const ownerEmail = getOwnerEmail(context.locals)
  const db = getDB(context.locals, context.request)
  if (!db || !ownerEmail) return notFound(isApi) // 설정 누락 시 닫힌 상태로 둔다

  const user = await getCurrentUser(db, context.cookies)
  if (!user) {
    if (isApi) return json({ error: 'unauthorized' }, 401)
    const nextUrl = encodeURIComponent(context.url.pathname + context.url.search)
    return context.redirect(`/auth/login?next=${nextUrl}`)
  }
  if (!isOwner(user, ownerEmail)) return notFound(isApi)

  context.locals.golf = { user }
  return next()
})

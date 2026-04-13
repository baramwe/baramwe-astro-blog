// 페이지에서 사용:
//   ---
//   import { requireAuth } from '../lib/auth/guard'
//   const user = await requireAuth(Astro)
//   if (user instanceof Response) return user
//   ---
import type { AstroGlobal } from 'astro'
import { getDB } from './db'
import { getCurrentUser, type SessionUser } from './session'

export async function requireAuth(Astro: AstroGlobal): Promise<SessionUser | Response> {
  const db = getDB(Astro.locals, Astro.request)
  if (!db) return new Response('DB unavailable', { status: 500 })

  const user = await getCurrentUser(db, Astro.cookies)
  if (!user) {
    const next = encodeURIComponent(Astro.url.pathname + Astro.url.search)
    return Astro.redirect(`/auth/login?next=${next}`)
  }
  return user
}

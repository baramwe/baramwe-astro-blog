import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { destroySession } from '../../../lib/auth/session'

export const prerender = false

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return new Response(JSON.stringify({ error: 'DB unavailable' }), { status: 500 })
  await destroySession(env.DB, cookies)
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

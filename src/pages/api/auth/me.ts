import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { getCurrentUser } from '../../../lib/auth/session'

export const prerender = false

export const GET: APIRoute = async ({ request, locals, cookies }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return new Response(JSON.stringify({ error: 'DB unavailable' }), { status: 500 })
  const user = await getCurrentUser(env.DB, cookies)
  if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  return new Response(JSON.stringify({ user }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

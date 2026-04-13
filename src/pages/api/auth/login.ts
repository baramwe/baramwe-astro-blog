import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { verifyPassword } from '../../../lib/auth/password'
import { createSession } from '../../../lib/auth/session'

export const prerender = false

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return json({ error: 'DB unavailable' }, 500)

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const password = body.password || ''
  if (!email || !password) return json({ error: '이메일과 비밀번호를 입력해주세요.' }, 400)

  const user = await env.DB.prepare(
    `SELECT id, password_hash, password_salt, email_verified FROM users WHERE email = ?`
  ).bind(email).first<{ id: string; password_hash: string; password_salt: string; email_verified: number }>()

  if (!user) return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)
  if (user.email_verified !== 1) return json({ error: '이메일 인증이 필요합니다.' }, 403)

  const ok = await verifyPassword(password, user.password_hash, user.password_salt)
  if (!ok) return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401)

  await createSession(env.DB, user.id, cookies)
  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { consumeVerificationCode } from '../../../lib/auth/verification'
import { createSession } from '../../../lib/auth/session'

export const prerender = false

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return json({ error: 'DB unavailable' }, 500)

  let body: { email?: string; code?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const code = (body.code || '').trim()
  if (!email || !code) return json({ error: '이메일과 코드를 입력해주세요.' }, 400)

  const ok = await consumeVerificationCode(env.DB, email, code, 'signup')
  if (!ok) return json({ error: '코드가 유효하지 않거나 만료되었습니다.' }, 400)

  const user = await env.DB.prepare(
    `SELECT id FROM users WHERE email = ?`
  ).bind(email).first<{ id: string }>()
  if (!user) return json({ error: '사용자를 찾을 수 없습니다.' }, 404)

  await env.DB.prepare(
    `UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(user.id).run()

  await createSession(env.DB, user.id, cookies)
  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

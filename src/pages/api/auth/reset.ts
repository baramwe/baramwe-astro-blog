import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { consumeVerificationCode } from '../../../lib/auth/verification'
import { hashPassword } from '../../../lib/auth/password'

export const prerender = false

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return json({ error: 'DB unavailable' }, 500)

  let body: { email?: string; code?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  const code = (body.code || '').trim()
  const password = body.password || ''
  if (!email || !code) return json({ error: '이메일과 코드를 입력해주세요.' }, 400)
  if (password.length < 8) return json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400)

  const ok = await consumeVerificationCode(env.DB, email, code, 'reset')
  if (!ok) return json({ error: '코드가 유효하지 않거나 만료되었습니다.' }, 400)

  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>()
  if (!user) return json({ error: '사용자를 찾을 수 없습니다.' }, 404)

  const { hash, salt } = await hashPassword(password)
  await env.DB.prepare(
    `UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(hash, salt, user.id).run()

  // 기존 세션 전부 무효화 (보안)
  await env.DB.prepare(`DELETE FROM auth_sessions WHERE user_id = ?`).bind(user.id).run()

  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

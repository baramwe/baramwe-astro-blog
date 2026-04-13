import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { hashPassword } from '../../../lib/auth/password'
import { issueVerificationCode } from '../../../lib/auth/verification'
import { sendVerificationEmail } from '../../../lib/auth/email'

export const prerender = false

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const POST: APIRoute = async ({ request, locals }) => {
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
  if (!EMAIL_RE.test(email)) return json({ error: '유효한 이메일을 입력해주세요.' }, 400)
  if (password.length < 8) return json({ error: '비밀번호는 8자 이상이어야 합니다.' }, 400)

  const existing = await env.DB.prepare(
    `SELECT id, email_verified FROM users WHERE email = ?`
  ).bind(email).first<{ id: string; email_verified: number }>()

  if (existing && existing.email_verified === 1) {
    return json({ error: '이미 가입된 이메일입니다.' }, 409)
  }

  const { hash, salt } = await hashPassword(password)

  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET password_hash = ?, password_salt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(hash, salt, existing.id).run()
  } else {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, password_salt, email_verified) VALUES (?, ?, ?, ?, 0)`
    ).bind(crypto.randomUUID(), email, hash, salt).run()
  }

  const code = await issueVerificationCode(env.DB, email, 'signup')
  try {
    await sendVerificationEmail(env, email, code)
  } catch (e) {
    console.error('email send failed', e)
    return json({ error: '인증 메일 발송에 실패했습니다.' }, 502)
  }

  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

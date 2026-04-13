import type { APIRoute } from 'astro'
import { getEnv } from '../../../lib/auth/db'
import { issueVerificationCode } from '../../../lib/auth/verification'
import { sendPasswordResetEmail } from '../../../lib/auth/email'

export const prerender = false

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv(locals, request)
  if (!env?.DB) return json({ error: 'DB unavailable' }, 500)

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const email = (body.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return json({ error: '유효한 이메일을 입력해주세요.' }, 400)

  // 계정 존재 여부는 노출하지 않음 — 항상 ok 반환
  const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ?`).bind(email).first<{ id: string }>()
  if (user) {
    const code = await issueVerificationCode(env.DB, email, 'reset')
    try {
      await sendPasswordResetEmail(env, email, code)
    } catch (e) {
      console.error('reset email send failed', e)
    }
  }
  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

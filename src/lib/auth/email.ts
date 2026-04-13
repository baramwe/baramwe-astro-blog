import type { AuthEnv } from './db'

async function sendMail(env: AuthEnv, to: string, subject: string, html: string, codeForLog?: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[auth/email] RESEND_API_KEY not set — skipping send. Subject: ${subject}`, codeForLog ? `Code: ${codeForLog}` : '')
    return
  }
  const from = env.AUTH_MAIL_FROM || 'onboarding@resend.dev'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend API error ${res.status}: ${text}`)
  }
}

export async function sendVerificationEmail(env: AuthEnv, to: string, code: string): Promise<void> {
  await sendMail(
    env,
    to,
    '[bluewine] 이메일 인증 코드',
    `<p>인증 코드: <strong style="font-size:20px">${code}</strong></p><p>10분 내에 입력해주세요.</p>`,
    code,
  )
}

export async function sendPasswordResetEmail(env: AuthEnv, to: string, code: string): Promise<void> {
  await sendMail(
    env,
    to,
    '[bluewine] 비밀번호 재설정 코드',
    `<p>비밀번호 재설정 코드: <strong style="font-size:20px">${code}</strong></p><p>10분 내에 입력해주세요. 본인이 요청한 것이 아니라면 이 메일을 무시하세요.</p>`,
    code,
  )
}

// 6자리 이메일 인증 코드 발급/검증
const CODE_TTL_MS = 10 * 60 * 1000

function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return bufToHex(buf)
}

function randomCode(): string {
  const buf = crypto.getRandomValues(new Uint32Array(1))
  return (buf[0] % 1_000_000).toString().padStart(6, '0')
}

function uuid(): string {
  return crypto.randomUUID()
}

export async function issueVerificationCode(
  db: D1Database,
  email: string,
  purpose = 'signup'
): Promise<string> {
  const code = randomCode()
  const codeHash = await sha256Hex(code)
  const id = uuid()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

  await db.prepare(
    `UPDATE auth_verification_codes SET consumed_at = CURRENT_TIMESTAMP
     WHERE email = ? AND purpose = ? AND consumed_at IS NULL`
  ).bind(email, purpose).run()

  await db.prepare(
    `INSERT INTO auth_verification_codes (id, email, code_hash, purpose, expires_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, email, codeHash, purpose, expiresAt).run()

  return code
}

export async function consumeVerificationCode(
  db: D1Database,
  email: string,
  code: string,
  purpose = 'signup'
): Promise<boolean> {
  const codeHash = await sha256Hex(code)
  const row = await db.prepare(
    `SELECT id, expires_at FROM auth_verification_codes
     WHERE email = ? AND purpose = ? AND code_hash = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  ).bind(email, purpose, codeHash).first<{ id: string; expires_at: string }>()

  if (!row) return false
  if (new Date(row.expires_at).getTime() < Date.now()) return false

  await db.prepare(
    `UPDATE auth_verification_codes SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(row.id).run()

  return true
}

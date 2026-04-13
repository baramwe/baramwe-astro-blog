import type { AstroCookies } from 'astro'
import { sha256Hex } from './verification'

export const SESSION_COOKIE = 'bw_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function bufToB64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export interface SessionUser {
  id: string
  email: string
}

export async function createSession(
  db: D1Database,
  userId: string,
  cookies: AstroCookies
): Promise<void> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = bufToB64Url(tokenBytes.buffer)
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

  await db.prepare(
    `INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)`
  ).bind(tokenHash, userId, expiresAt).run()

  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
}

export async function getCurrentUser(
  db: D1Database,
  cookies: AstroCookies
): Promise<SessionUser | null> {
  const token = cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  const tokenHash = await sha256Hex(token)

  const row = await db.prepare(
    `SELECT u.id AS id, u.email AS email, s.expires_at AS expires_at
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  ).bind(tokenHash).first<{ id: string; email: string; expires_at: string }>()

  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).bind(tokenHash).run()
    return null
  }
  return { id: row.id, email: row.email }
}

export async function destroySession(
  db: D1Database,
  cookies: AstroCookies
): Promise<void> {
  const token = cookies.get(SESSION_COOKIE)?.value
  if (token) {
    const tokenHash = await sha256Hex(token)
    await db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).bind(tokenHash).run()
  }
  cookies.delete(SESSION_COOKIE, { path: '/' })
}

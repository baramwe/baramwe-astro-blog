import type { APIRoute } from 'astro'
import { getDB } from '../../lib/auth/db'

export const prerender = false

export const GET: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ rows: [] })
  const { results } = await db.prepare('SELECT id, old_url, new_url FROM url_replacements ORDER BY id DESC').all()
  return json({ rows: results })
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)
  const { old_url, new_url } = await request.json() as { old_url: string; new_url: string }
  if (!old_url?.trim() || !new_url?.trim()) return json({ error: 'old_url, new_url 필요' }, 400)
  const result = await db.prepare('INSERT INTO url_replacements (old_url, new_url) VALUES (?, ?)').bind(old_url.trim(), new_url.trim()).run()
  return json({ id: result.meta.last_row_id })
}

export const DELETE: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)
  const { id } = await request.json() as { id: number }
  await db.prepare('DELETE FROM url_replacements WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

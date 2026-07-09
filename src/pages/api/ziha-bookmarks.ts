import type { APIRoute } from 'astro'
import { getDB } from '../../lib/auth/db'

export const prerender = false

// GET ?q=검색어&star=2&star_op=gte   (star_op: gte=이상, eq=정확히, 기본 gte)
export const GET: APIRoute = async ({ locals, request, url }) => {
  const db = getDB(locals, request)
  if (!db) return json({ rows: [] })

  const q      = url.searchParams.get('q')?.trim() ?? ''
  const starRaw = url.searchParams.get('star')
  const starOp  = url.searchParams.get('star_op') === 'eq' ? '=' : '>='

  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (q) {
    conditions.push('title LIKE ?')
    bindings.push(`%${q}%`)
  }
  if (starRaw !== null && starRaw !== '') {
    const starVal = parseInt(starRaw, 10)
    if (!isNaN(starVal)) {
      conditions.push(`star ${starOp} ?`)
      bindings.push(starVal)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt  = `SELECT id, title, url, star FROM bookmarks ${where} ORDER BY star DESC, title ASC LIMIT 100`

  const { results } = await db.prepare(stmt).bind(...bindings).all()
  return json({ rows: results })
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { title, url, star = 0 } = await request.json() as { title: string; url: string; star?: number }
  if (!title?.trim() || !url?.trim()) return json({ error: 'title, url 필요' }, 400)

  const result = await db
    .prepare('INSERT INTO bookmarks (title, url, star) VALUES (?, ?, ?)')
    .bind(title.trim(), url.trim(), Math.min(3, Math.max(0, star)))
    .run()
  return json({ id: result.meta.last_row_id })
}

export const PATCH: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { id, title, url, star } = await request.json() as { id: number; title?: string; url?: string; star?: number }
  if (!id) return json({ error: 'id 필요' }, 400)

  const fields: string[] = []
  const bindings: (string | number)[] = []

  if (title !== undefined) { fields.push('title = ?'); bindings.push(title.trim()) }
  if (url   !== undefined) { fields.push('url = ?');   bindings.push(url.trim()) }
  if (star  !== undefined) { fields.push('star = ?');  bindings.push(Math.min(3, Math.max(0, star))) }

  if (!fields.length) return json({ error: '변경 항목 없음' }, 400)

  bindings.push(id)
  await db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`).bind(...bindings).run()
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { id } = await request.json() as { id: number }
  if (!id) return json({ error: 'id 필요' }, 400)

  await db.prepare('DELETE FROM bookmarks WHERE id = ?').bind(id).run()
  return json({ ok: true })
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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
    if (q.includes('&&')) {
      for (const term of q.split('&&').map(t => t.trim()).filter(Boolean)) {
        conditions.push('LOWER(title) LIKE ?')
        bindings.push(`%${term.toLowerCase()}%`)
      }
    } else {
      conditions.push('LOWER(title) LIKE ?')
      bindings.push(`%${q.toLowerCase()}%`)
    }
  }
  if (starRaw !== null && starRaw !== '') {
    const starVal = parseInt(starRaw, 10)
    if (!isNaN(starVal)) {
      conditions.push(`star ${starOp} ?`)
      bindings.push(starVal)
    }
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt  = `SELECT id, title, url, star, memo, sort FROM bookmarks ${where} ORDER BY CASE WHEN sort = 0 THEN 0 WHEN sort = 1 THEN 1 ELSE 2 END ASC, id DESC`

  const { results } = await db.prepare(stmt).bind(...bindings).all()
  return json({ rows: results })
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { title, url, star = 0, memo, sort = 1 } = await request.json() as { title: string; url: string; star?: number; memo?: string; sort?: number }
  if (!title?.trim() || !url?.trim()) return json({ error: 'title, url 필요' }, 400)

  const memoVal = memo?.trim().slice(0, 100) || null
  const result = await db
    .prepare('INSERT INTO bookmarks (title, url, star, memo, sort) VALUES (?, ?, ?, ?, ?)')
    .bind(title.trim(), url.trim(), Math.min(3, Math.max(0, star)), memoVal, sort)
    .run()
  return json({ id: result.meta.last_row_id })
}

export const PATCH: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { id, title, url, star, memo, sort } = await request.json() as { id: number; title?: string; url?: string; star?: number; memo?: string; sort?: number | null }
  if (!id) return json({ error: 'id 필요' }, 400)

  const fields: string[] = []
  const bindings: (string | number | null)[] = []

  if (title !== undefined) { fields.push('title = ?'); bindings.push(title.trim()) }
  if (url   !== undefined) { fields.push('url = ?');   bindings.push(url.trim()) }
  if (star  !== undefined) { fields.push('star = ?');  bindings.push(Math.min(3, Math.max(0, star))) }
  if (memo  !== undefined) { fields.push('memo = ?');  bindings.push(memo.trim().slice(0, 100) || null) }
  if (sort  !== undefined) { fields.push('sort = ?');  bindings.push(sort) }

  if (!fields.length) return json({ error: '변경 항목 없음' }, 400)

  bindings.push(id)
  await db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`).bind(...bindings).run()
  return json({ ok: true })
}

// PUT { from, to, preview }
// preview=true → 변경될 행 수만 반환, preview=false → 실제 REPLACE 실행
export const PUT: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { from, to, preview = false } = await request.json() as { from: string; to: string; preview?: boolean }
  if (!from?.trim()) return json({ error: 'from 필요' }, 400)
  if (to === undefined || to === null) return json({ error: 'to 필요' }, 400)

  const like = `%${from.trim()}%`

  if (preview) {
    const { results } = await db
      .prepare('SELECT COUNT(*) AS cnt FROM bookmarks WHERE url LIKE ?')
      .bind(like).all<{ cnt: number }>()
    return json({ count: results[0]?.cnt ?? 0 })
  }

  const { meta } = await db
    .prepare("UPDATE bookmarks SET url = REPLACE(url, ?, ?) WHERE url LIKE ?")
    .bind(from.trim(), to.trim(), like).run()
  return json({ updated: meta.changes ?? 0 })
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

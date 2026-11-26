import type { APIRoute } from 'astro'
import { getDB } from '../../lib/auth/db'
import { detectSite, isSite, normalizeMemo, stripSiteFromTitle } from '../../lib/ziha-site'

export const prerender = false

// GET ?q=검색어&star=2&star_op=gte&site=topgirl   (q 는 제목·메모에서 찾는다. star_op: gte=이상, eq=정확히, 기본 gte / site=none 이면 태그 없는 것)
export const GET: APIRoute = async ({ locals, request, url }) => {
  const db = getDB(locals, request)
  if (!db) return json({ rows: [] })

  const q      = url.searchParams.get('q')?.trim() ?? ''
  const starRaw = url.searchParams.get('star')
  const starOp  = url.searchParams.get('star_op') === 'eq' ? '=' : '>='
  const site    = url.searchParams.get('site') ?? ''

  const conditions: string[] = []
  const bindings: (string | number)[] = []

  if (q) {
    if (q.includes('&&')) {
      for (const term of q.split('&&').map(t => t.trim()).filter(Boolean)) {
        conditions.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(memo, '')) LIKE ?)")
        bindings.push(`%${term.toLowerCase()}%`, `%${term.toLowerCase()}%`)
      }
    } else {
      conditions.push("(LOWER(title) LIKE ? OR LOWER(COALESCE(memo, '')) LIKE ?)")
      bindings.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`)
    }
  }
  if (starRaw !== null && starRaw !== '') {
    const starVal = parseInt(starRaw, 10)
    if (!isNaN(starVal)) {
      conditions.push(`star ${starOp} ?`)
      bindings.push(starVal)
    }
  }

  if (site === 'none') {
    conditions.push('site IS NULL')
  } else if (isSite(site)) {
    conditions.push('site = ?')
    bindings.push(site)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt  = `SELECT id, title, url, star, memo, sort, site FROM bookmarks ${where} ORDER BY CASE WHEN sort = 0 THEN 0 WHEN sort = 1 THEN 1 ELSE 2 END ASC, id DESC`

  const { results } = await db.prepare(stmt).bind(...bindings).all()
  return json({ rows: results })
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { title, url, star = 0, memo, sort = 1 } = await request.json() as { title: string; url: string; star?: number; memo?: string; sort?: number }
  if (!title?.trim() || !url?.trim()) return json({ error: 'title, url 필요' }, 400)

  // 사이트는 URL 도메인으로 태그에 저장하고, 제목의 사이트명은 지운다.
  const urlVal   = url.trim()
  const titleVal = stripSiteFromTitle(title)
  const site     = detectSite(urlVal)
  const memoVal  = normalizeMemo(memo)
  const result = await db
    .prepare('INSERT INTO bookmarks (title, url, star, memo, sort, site) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(titleVal, urlVal, Math.min(3, Math.max(0, star)), memoVal, sort, site)
    .run()
  return json({ id: result.meta.last_row_id, title: titleVal, site })
}

export const PATCH: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const { id, title, url, star, memo, sort } = await request.json() as { id: number; title?: string; url?: string; star?: number; memo?: string; sort?: number | null }
  if (!id) return json({ error: 'id 필요' }, 400)

  const fields: string[] = []
  const bindings: (string | number | null)[] = []

  // 제목은 저장 규칙(사이트명 제거)을 거친 값을 돌려줘서 화면이 실제 저장값을 그대로 보여 주게 한다.
  const titleVal = title !== undefined ? stripSiteFromTitle(title) : undefined
  if (titleVal !== undefined) {
    if (!titleVal) return json({ error: '제목이 비어 있음' }, 400)
    fields.push('title = ?'); bindings.push(titleVal)
  }
  const urlVal = url !== undefined ? url.trim() : undefined
  const siteVal = urlVal !== undefined ? detectSite(urlVal) : undefined
  if (urlVal !== undefined) {
    if (!urlVal) return json({ error: '주소가 비어 있음' }, 400)
    fields.push('url = ?');  bindings.push(urlVal)
    fields.push('site = ?'); bindings.push(siteVal ?? null)
  }
  if (star  !== undefined) { fields.push('star = ?');  bindings.push(Math.min(3, Math.max(0, star))) }
  const memoVal = memo !== undefined ? normalizeMemo(memo) : undefined
  if (memoVal !== undefined) { fields.push('memo = ?'); bindings.push(memoVal) }
  if (sort  !== undefined) { fields.push('sort = ?');  bindings.push(sort) }

  if (!fields.length) return json({ error: '변경 항목 없음' }, 400)

  bindings.push(id)
  await db.prepare(`UPDATE bookmarks SET ${fields.join(', ')} WHERE id = ?`).bind(...bindings).run()
  return json({
    ok: true,
    ...(titleVal !== undefined ? { title: titleVal } : {}),
    ...(memoVal !== undefined ? { memo: memoVal } : {}),
    ...(urlVal !== undefined ? { url: urlVal, site: siteVal ?? null } : {}),
  })
}

// PUT { from, to, preview }
// preview=true → 변경될 행 수만 반환, preview=false → 실제 REPLACE 실행
// PUT { mode: 'normalize', preview } → 모든 북마크의 제목에서 사이트명을 지우고 site 태그를 URL 기준으로 다시 맞춘다.
export const PUT: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)

  const body = await request.json() as { mode?: string; from: string; to: string; preview?: boolean }
  if (body.mode === 'normalize') return normalizeAll(db, body.preview === true)

  const { from, to, preview = false } = body
  if (!from?.trim()) return json({ error: 'from 필요' }, 400)
  if (to === undefined || to === null) return json({ error: 'to 필요' }, 400)

  const like = `%${from.trim()}%`

  if (preview) {
    const { results } = await db
      .prepare('SELECT COUNT(*) AS cnt FROM bookmarks WHERE url LIKE ?')
      .bind(like).all<{ cnt: number }>()
    return json({ count: results[0]?.cnt ?? 0 })
  }

  const { results: targets } = await db
    .prepare('SELECT id, url FROM bookmarks WHERE url LIKE ?')
    .bind(like).all<{ id: number; url: string }>()
  const { meta } = await db
    .prepare("UPDATE bookmarks SET url = REPLACE(url, ?, ?) WHERE url LIKE ?")
    .bind(from.trim(), to.trim(), like).run()

  // 도메인이 바뀌었을 수 있으니 바뀐 행의 site 태그를 다시 판정한다.
  if (targets.length) {
    const stmt = db.prepare('UPDATE bookmarks SET site = ? WHERE id = ?')
    await db.batch(targets.map(r => stmt.bind(detectSite(r.url.split(from.trim()).join(to.trim())), r.id)))
  }
  return json({ updated: meta.changes ?? 0 })
}

async function normalizeAll(db: D1Database, preview: boolean) {
  const { results } = await db
    .prepare('SELECT id, title, url, site FROM bookmarks')
    .all<{ id: number; title: string; url: string; site: string | null }>()

  const changes = results
    .map(r => ({ id: r.id, before: r.title, title: stripSiteFromTitle(r.title), site: detectSite(r.url), oldSite: r.site }))
    .filter(c => c.title !== c.before || c.site !== c.oldSite)

  if (preview) {
    return json({
      count: changes.length,
      titleCount: changes.filter(c => c.title !== c.before).length,
      siteCount: changes.filter(c => c.site !== c.oldSite).length,
      samples: changes.filter(c => c.title !== c.before).slice(0, 5).map(c => ({ before: c.before, after: c.title })),
    })
  }

  const stmt = db.prepare('UPDATE bookmarks SET title = ?, site = ? WHERE id = ?')
  for (let i = 0; i < changes.length; i += 100) {
    await db.batch(changes.slice(i, i + 100).map(c => stmt.bind(c.title, c.site, c.id)))
  }
  return json({ updated: changes.length })
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

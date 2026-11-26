import type { APIRoute } from 'astro'
import { getDB } from '../../lib/auth/db'

export const prerender = false

// /private/ziha 상단 칩(메모·배우)의 노출 관리. 북마크 값은 바꾸지 않는다.
// GET ?kind=actor → { memos: string[] }   POST { kind?, memo } → 숨김   DELETE { kind?, memo } → 다시 노출
// kind 기본값은 'memo'. 'actor' 면 ziha_hidden_actors 를 쓴다.

type Kind = 'memo' | 'actor'
const TABLES: Record<Kind, { table: string; col: string }> = {
  memo: { table: 'ziha_hidden_memos', col: 'memo' },
  actor: { table: 'ziha_hidden_actors', col: 'name' },
}
const toKind = (v: unknown): Kind => (v === 'actor' ? 'actor' : 'memo')

export const GET: APIRoute = async ({ locals, request, url }) => {
  const db = getDB(locals, request)
  if (!db) return json({ memos: [] })
  const { table, col } = TABLES[toKind(url.searchParams.get('kind'))]
  const { results } = await db
    .prepare(`SELECT ${col} AS v FROM ${table} ORDER BY created_at, ${col}`)
    .all<{ v: string }>()
  return json({ memos: results.map(r => r.v) })
}

export const POST: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)
  const { kind, value } = await readBody(request)
  if (!value) return json({ error: 'memo 필요' }, 400)
  const { table, col } = TABLES[kind]
  await db.prepare(`INSERT OR IGNORE INTO ${table} (${col}) VALUES (?)`).bind(value).run()
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ locals, request }) => {
  const db = getDB(locals, request)
  if (!db) return json({ error: 'DB unavailable' }, 503)
  const { kind, value } = await readBody(request)
  if (!value) return json({ error: 'memo 필요' }, 400)
  const { table, col } = TABLES[kind]
  await db.prepare(`DELETE FROM ${table} WHERE ${col} = ?`).bind(value).run()
  return json({ ok: true })
}

// 북마크 memo 와 같은 규칙(trim, 최대 100자)으로 맞춰야 칩과 정확히 매칭된다.
async function readBody(request: Request): Promise<{ kind: Kind; value: string }> {
  try {
    const { kind, memo } = await request.json() as { kind?: unknown; memo?: unknown }
    return { kind: toKind(kind), value: typeof memo === 'string' ? memo.trim().slice(0, 100) : '' }
  } catch {
    return { kind: 'memo', value: '' }
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

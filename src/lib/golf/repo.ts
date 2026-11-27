// 골프 스코어 데이터 접근 레이어 (1인 전용, 접근 제어는 middleware).
// players/rounds/scores 는 이 파일의 함수로만 접근한다 — 모든 쿼리가 owner_user_id 로 범위가 제한된다.

export class GolfError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const uuid = () => crypto.randomUUID()

// ───────────────────────── 집계 캐시 ─────────────────────────
// 집계 조회(홈·골친·랭킹·라운드 목록 등)는 결과 JSON 을 golf_stats_cache 에 저장해 두고 다음부터 1행만 읽는다.
// 라운드·플레이어·골프장·코스를 바꾸는 모든 쓰기는 같은 트랜잭션(batch)에서 캐시를 통째로 비운다.
// 1인 전용 서비스라 owner 구분 없이 전부 비워도 비용이 작고, 골프장·코스처럼 owner 가 없는 공용 데이터 변경도 안전하게 덮는다.
// ⚠️ 운영 DB 를 SQL 로 직접 고치면 `npm run db:golf:cache-clear:remote` 로 비워야 한다.

const clearStatsCacheStmt = (db: D1Database) => db.prepare(`DELETE FROM golf_stats_cache`)

async function cached<T>(db: D1Database, ownerId: string, key: string, compute: () => Promise<T>): Promise<T> {
  try {
    const hit = await db.prepare(`SELECT payload FROM golf_stats_cache WHERE owner_user_id = ? AND cache_key = ?`)
      .bind(ownerId, key).first<{ payload: string }>()
    if (hit) return JSON.parse(hit.payload) as T
  } catch {
    return compute() // 캐시 테이블이 없거나 깨졌으면 그냥 계산한다
  }
  const value = await compute()
  try {
    await db.prepare(`INSERT OR REPLACE INTO golf_stats_cache (owner_user_id, cache_key, payload) VALUES (?, ?, ?)`)
      .bind(ownerId, key, JSON.stringify(value)).run()
  } catch { /* 저장 실패해도 응답은 정상 */ }
  return value
}

// ───────────────────────── 골프장 / 코스 ─────────────────────────

export interface Club { id: string; name: string; country_code: string; region: string | null }
export interface Course { id: string; club_id: string; name: string; pars: number[] }
export type ClubWithCourses = Club & { courses: Course[] }

export const COUNTRIES: Record<string, string> = {
  KR: '한국', JP: '일본', TH: '태국', VN: '베트남', PH: '필리핀', CN: '중국', TW: '대만', MN: '몽골',
  MY: '말레이시아', ID: '인도네시아', US: '미국', AU: '호주', NZ: '뉴질랜드', ES: '스페인', GB: '영국', XX: '미상',
}
export const countryName = (code: string) => COUNTRIES[code] ?? code

/** ISO alpha-2 → 국기 이모지. 한국·미지정(XX)·형식 외 코드는 빈 문자열 */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code) || code === 'KR' || code === 'XX') return ''
  return String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65))
}

export async function listClubsWithCourses(db: D1Database): Promise<ClubWithCourses[]> {
  const [clubs, courses] = await db.batch([
    db.prepare(`SELECT id, name, country_code, region FROM golf_clubs ORDER BY country_code, name`),
    db.prepare(`SELECT id, club_id, name, pars_json FROM golf_courses ORDER BY name`),
  ])
  const byClub = new Map<string, Course[]>()
  for (const c of courses.results as { id: string; club_id: string; name: string; pars_json: string }[]) {
    const list = byClub.get(c.club_id) ?? []
    list.push({ id: c.id, club_id: c.club_id, name: c.name, pars: JSON.parse(c.pars_json) })
    byClub.set(c.club_id, list)
  }
  return (clubs.results as unknown as Club[]).map((c) => ({ ...c, courses: byClub.get(c.id) ?? [] }))
}

function cleanText(v: unknown, max: number, label: string, required = true): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) {
    if (required) throw new GolfError(`${label}을(를) 입력해주세요.`)
    return null
  }
  if (s.length > max) throw new GolfError(`${label}은(는) ${max}자 이내로 입력해주세요.`)
  return s
}

function parsePars(v: unknown): number[] {
  if (!Array.isArray(v) || v.length !== 9) throw new GolfError('코스 파는 9개 홀 모두 입력해야 합니다.')
  return v.map((p) => {
    const n = Number(p)
    if (!Number.isInteger(n) || n < 3 || n > 6) throw new GolfError('파는 3~6 사이여야 합니다.')
    return n
  })
}

function parseClub(body: any) {
  const name = cleanText(body?.name, 60, '골프장 이름')!
  const country = String(body?.country_code ?? '').trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new GolfError('국가 코드가 올바르지 않습니다.')
  const region = cleanText(body?.region, 40, '지역', false)
  return { name, country, region }
}

/** (name, country_code) UNIQUE — exceptId 는 수정 중인 자기 자신 */
async function assertClubNameFree(db: D1Database, name: string, country: string, exceptId?: string) {
  const dup = await db.prepare(`SELECT id FROM golf_clubs WHERE name = ? AND country_code = ?`)
    .bind(name, country).first<{ id: string }>()
  if (dup && dup.id !== exceptId) throw new GolfError('이미 등록된 골프장입니다.', 409)
}

export async function createClub(db: D1Database, userId: string, body: any): Promise<string> {
  const { name, country, region } = parseClub(body)
  await assertClubNameFree(db, name, country)

  const id = uuid()
  await db.batch([
    db.prepare(`INSERT INTO golf_clubs (id, name, country_code, region, created_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, name, country, region, userId),
    clearStatsCacheStmt(db),
  ])
  return id
}

/** 골프장 이름·국가·지역 수정 */
export async function updateClub(db: D1Database, clubId: string, body: any): Promise<void> {
  const { name, country, region } = parseClub(body)
  await assertClubNameFree(db, name, country, clubId)
  const [res] = await db.batch([
    db.prepare(`UPDATE golf_clubs SET name = ?, country_code = ?, region = ? WHERE id = ?`).bind(name, country, region, clubId),
    clearStatsCacheStmt(db),
  ])
  if (!res.meta.changes) throw new GolfError('골프장을 찾을 수 없습니다.', 404)
}

export async function createCourse(db: D1Database, userId: string, clubId: string, body: any): Promise<string> {
  const club = await db.prepare(`SELECT id FROM golf_clubs WHERE id = ?`).bind(clubId).first()
  if (!club) throw new GolfError('골프장을 찾을 수 없습니다.', 404)
  const name = cleanText(body?.name, 30, '코스 이름')!
  const pars = parsePars(body?.pars)

  const dup = await db.prepare(`SELECT id FROM golf_courses WHERE club_id = ? AND name = ?`)
    .bind(clubId, name).first()
  if (dup) throw new GolfError('이미 등록된 코스입니다.', 409)

  const id = uuid()
  await db.batch([
    db.prepare(`INSERT INTO golf_courses (id, club_id, name, pars_json, created_by) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, clubId, name, JSON.stringify(pars), userId),
    clearStatsCacheStmt(db),
  ])
  return id
}

export async function updateCoursePars(db: D1Database, courseId: string, body: any): Promise<void> {
  const pars = parsePars(body?.pars)
  const [res] = await db.batch([
    db.prepare(`UPDATE golf_courses SET pars_json = ? WHERE id = ?`).bind(JSON.stringify(pars), courseId),
    clearStatsCacheStmt(db),
  ])
  if (!res.meta.changes) throw new GolfError('코스를 찾을 수 없습니다.', 404)
}

/** 라운드에서 사용 중이면 삭제 불가 */
export async function deleteCourse(db: D1Database, courseId: string): Promise<void> {
  const used = await db.prepare(
    `SELECT 1 FROM golf_rounds WHERE front_course_id = ? OR back_course_id = ? LIMIT 1`
  ).bind(courseId, courseId).first()
  if (used) throw new GolfError('라운드 기록에서 사용 중인 코스는 삭제할 수 없습니다.', 409)
  await db.batch([db.prepare(`DELETE FROM golf_courses WHERE id = ?`).bind(courseId), clearStatsCacheStmt(db)])
}

/** 코스가 남아 있거나 라운드에서 사용 중이면 삭제 불가 */
export async function deleteClub(db: D1Database, clubId: string): Promise<void> {
  const used = await db.prepare(
    `SELECT 1 FROM golf_courses WHERE club_id = ? UNION ALL SELECT 1 FROM golf_rounds WHERE club_id = ? LIMIT 1`
  ).bind(clubId, clubId).first()
  if (used) throw new GolfError('코스가 있거나 라운드에서 사용 중인 골프장은 삭제할 수 없습니다.', 409)
  await db.batch([db.prepare(`DELETE FROM golf_clubs WHERE id = ?`).bind(clubId), clearStatsCacheStmt(db)])
}

// ───────────────────────── 플레이어 ─────────────────────────

export interface Player { id: string; display_name: string; is_self: number }

/** 본인 플레이어 행을 보장한다 (없으면 생성) */
export async function ensureSelfPlayer(db: D1Database, ownerId: string): Promise<Player> {
  const self = await db.prepare(
    `SELECT id, display_name, is_self FROM golf_players WHERE owner_user_id = ? AND is_self = 1`
  ).bind(ownerId).first<Player>()
  if (self) return self

  // display_name UNIQUE 충돌(동반자 이름이 '나'인 경우) 회피
  let name = '나'
  for (let i = 2; await db.prepare(`SELECT 1 FROM golf_players WHERE owner_user_id = ? AND display_name = ?`)
    .bind(ownerId, name).first(); i++) name = `나(${i})`

  const id = uuid()
  await db.batch([
    db.prepare(`INSERT INTO golf_players (id, owner_user_id, display_name, is_self) VALUES (?, ?, ?, 1)`).bind(id, ownerId, name),
    clearStatsCacheStmt(db),
  ])
  return { id, display_name: name, is_self: 1 }
}

export async function listPlayers(db: D1Database, ownerId: string): Promise<Player[]> {
  const { results } = await db.prepare(
    `SELECT id, display_name, is_self FROM golf_players WHERE owner_user_id = ? ORDER BY is_self DESC, display_name`
  ).bind(ownerId).all<Player>()
  return results
}

// ───────────────────────── 라운드 ─────────────────────────

export interface RoundListItem {
  id: string; played_on: string; club_name: string; country_code: string; region: string | null
  front_course: string; back_course: string | null; memo: string | null
  my_total: number | null; companions: string | null
}

/** year: 'YYYY' 면 해당 연도만, 없으면 전체 */
export const ROUND_SORTS = ['new', 'old', 'best', 'worst'] as const
export type RoundSort = (typeof ROUND_SORTS)[number]

// 화이트리스트 ORDER BY. BEST/WORST 는 18홀 라운드를 먼저(9홀·미기록은 뒤로) 놓고 타수로 정렬
const ROUND_ORDER: Record<RoundSort, string> = {
  new: 'r.played_on DESC, r.created_at DESC',
  old: 'r.played_on ASC, r.created_at ASC',
  best: 'r.back_course_id IS NULL, my_total IS NULL, my_total ASC, r.played_on DESC',
  worst: 'r.back_course_id IS NULL, my_total IS NULL, my_total DESC, r.played_on DESC',
}

export function parseRoundSort(v: string | null | undefined): RoundSort {
  return (ROUND_SORTS as readonly string[]).includes(v ?? '') ? (v as RoundSort) : 'new'
}

/** clubId: 주면 그 골프장 라운드만 */
async function listRoundsRaw(db: D1Database, ownerId: string, limit = 200, year?: string, sort: RoundSort = 'new', clubId?: string): Promise<RoundListItem[]> {
  const { results } = await db.prepare(
    `SELECT r.id, r.played_on, c.name AS club_name, c.country_code, c.region,
            fc.name AS front_course, bc.name AS back_course, r.memo,
            (SELECT rp.total FROM golf_round_players rp JOIN golf_players p ON p.id = rp.player_id
              WHERE rp.round_id = r.id AND p.is_self = 1) AS my_total,
            (SELECT group_concat(p.display_name, ', ') FROM golf_round_players rp JOIN golf_players p ON p.id = rp.player_id
              WHERE rp.round_id = r.id AND p.is_self = 0) AS companions
       FROM golf_rounds r
       JOIN golf_clubs c ON c.id = r.club_id
       JOIN golf_courses fc ON fc.id = r.front_course_id
       LEFT JOIN golf_courses bc ON bc.id = r.back_course_id
      WHERE r.owner_user_id = ? AND (? IS NULL OR substr(r.played_on, 1, 4) = ?)
        AND (? IS NULL OR r.club_id = ?)
      ORDER BY ${ROUND_ORDER[sort]}
      LIMIT ?`
  ).bind(ownerId, year ?? null, year ?? null, clubId ?? null, clubId ?? null, limit).all<RoundListItem>()
  return results
}

/** 내가 그 골프장에서 친 라운드 수 */
async function countClubRoundsRaw(db: D1Database, ownerId: string, clubId: string): Promise<number> {
  const row = await db.prepare(
    `SELECT count(*) AS n FROM golf_rounds WHERE owner_user_id = ? AND club_id = ?`
  ).bind(ownerId, clubId).first<{ n: number }>()
  return row?.n ?? 0
}

export interface YearCount { year: string; rounds: number }

/** 라운드가 있는 연도 목록 (최신순) */
async function listRoundYearsRaw(db: D1Database, ownerId: string): Promise<YearCount[]> {
  const { results } = await db.prepare(
    `SELECT substr(played_on, 1, 4) AS year, count(*) AS rounds
       FROM golf_rounds WHERE owner_user_id = ?
      GROUP BY year ORDER BY year DESC`
  ).bind(ownerId).all<YearCount>()
  return results
}

export interface PeriodSummary { rounds: number; full_rounds: number; avg: number | null; best: number | null; best_on: string | null }

/** 기간 요약 — 평균·베스트는 18홀 라운드(본인) 기준. year 없으면 전체 */
async function periodSummaryRaw(db: D1Database, ownerId: string, year?: string): Promise<PeriodSummary> {
  const row = await db.prepare(
    `WITH mine AS (
       SELECT r.played_on, r.back_course_id IS NOT NULL AS full18, rp.total
         FROM golf_rounds r
         LEFT JOIN golf_round_players rp ON rp.round_id = r.id
          AND rp.player_id = (SELECT id FROM golf_players WHERE owner_user_id = r.owner_user_id AND is_self = 1)
        WHERE r.owner_user_id = ? AND (? IS NULL OR substr(r.played_on, 1, 4) = ?)
     )
     SELECT count(*) AS rounds,
            sum(full18) AS full_rounds,
            round(avg(CASE WHEN full18 THEN total END), 1) AS avg,
            min(CASE WHEN full18 THEN total END) AS best,
            (SELECT played_on FROM mine WHERE full18 AND total IS NOT NULL ORDER BY total, played_on DESC LIMIT 1) AS best_on
       FROM mine`
  ).bind(ownerId, year ?? null, year ?? null).first<PeriodSummary>()
  return row ?? { rounds: 0, full_rounds: 0, avg: null, best: null, best_on: null }
}

export interface RoundDetail {
  id: string; played_on: string; club_id: string; club_name: string; country_code: string
  front_course_id: string; front_course: string; back_course_id: string | null; back_course: string | null
  tee: string | null; memo: string | null; source: string
  pars: number[]
  players: {
    player_id: string; display_name: string; is_self: number
    total: number; front_total: number | null; back_total: number | null; putts_total: number | null
    strokes: (number | null)[]; putts: (number | null)[]
  }[]
}

/** 소유자가 아니면 null (호출부는 404로 응답 — 존재 여부를 숨긴다) */
export async function getRound(db: D1Database, ownerId: string, roundId: string): Promise<RoundDetail | null> {
  const r = await db.prepare(
    `SELECT r.id, r.played_on, r.club_id, c.name AS club_name, c.country_code,
            r.front_course_id, fc.name AS front_course, fc.pars_json AS front_pars,
            r.back_course_id, bc.name AS back_course, bc.pars_json AS back_pars,
            r.tee, r.memo, r.source
       FROM golf_rounds r
       JOIN golf_clubs c ON c.id = r.club_id
       JOIN golf_courses fc ON fc.id = r.front_course_id
       LEFT JOIN golf_courses bc ON bc.id = r.back_course_id
      WHERE r.id = ? AND r.owner_user_id = ?`
  ).bind(roundId, ownerId).first<any>()
  if (!r) return null

  const [players, holes] = await db.batch([
    db.prepare(
      `SELECT rp.player_id, p.display_name, p.is_self, rp.total, rp.front_total, rp.back_total, rp.putts_total
         FROM golf_round_players rp JOIN golf_players p ON p.id = rp.player_id
        WHERE rp.round_id = ? AND p.owner_user_id = ?
        ORDER BY p.is_self DESC, p.display_name`
    ).bind(roundId, ownerId),
    db.prepare(`SELECT player_id, hole_no, strokes, putts FROM golf_hole_scores WHERE round_id = ?`).bind(roundId),
  ])

  const pars: number[] = [...JSON.parse(r.front_pars), ...(r.back_pars ? JSON.parse(r.back_pars) : [])]
  const holeCount = pars.length
  const { front_pars, back_pars, ...rest } = r

  return {
    ...rest,
    pars,
    players: (players.results as any[]).map((p) => {
      const strokes: (number | null)[] = Array(holeCount).fill(null)
      const putts: (number | null)[] = Array(holeCount).fill(null)
      for (const h of holes.results as any[]) {
        if (h.player_id !== p.player_id || h.hole_no > holeCount) continue
        strokes[h.hole_no - 1] = h.strokes
        putts[h.hole_no - 1] = h.putts
      }
      return { ...p, strokes, putts }
    }),
  }
}

interface PlayerInput { player_id?: string; new_name?: string; strokes?: (number | null)[]; putts?: (number | null)[]; total?: number | null }

const isBlank = (v: unknown) => v === null || v === undefined || v === ''

function intIn(v: unknown, min: number, max: number, label: string): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new GolfError(`${label} 값이 올바르지 않습니다. (${min}~${max})`)
  return n
}

/** 라운드 생성/수정. roundId 가 있으면 수정(소유자 확인). 반환: round id */
export async function saveRound(db: D1Database, ownerId: string, body: any, roundId?: string): Promise<string> {
  // ── 기본 필드
  const playedOn = String(body?.played_on ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn) || Number.isNaN(Date.parse(playedOn))) {
    throw new GolfError('라운드 일자가 올바르지 않습니다.')
  }
  const tee = cleanText(body?.tee, 20, '티', false)
  const memo = cleanText(body?.memo, 300, '한줄평', false)

  // ── 골프장 / 코스 (코스는 반드시 해당 골프장 소속)
  const clubId = String(body?.club_id ?? '')
  const frontId = String(body?.front_course_id ?? '')
  const backId = isBlank(body?.back_course_id) ? null : String(body.back_course_id)
  const courseIds = backId ? [frontId, backId] : [frontId]
  const { results: courses } = await db.prepare(
    `SELECT id, pars_json FROM golf_courses WHERE club_id = ? AND id IN (${courseIds.map(() => '?').join(',')})`
  ).bind(clubId, ...courseIds).all<{ id: string; pars_json: string }>()
  const parsOf = (id: string) => {
    const c = courses.find((x) => x.id === id)
    if (!c) throw new GolfError('골프장/코스 선택이 올바르지 않습니다.')
    return JSON.parse(c.pars_json) as number[]
  }
  const pars = [...parsOf(frontId), ...(backId ? parsOf(backId) : [])]
  const holeCount = pars.length

  // ── 소유 확인 (수정)
  if (roundId) {
    const own = await db.prepare(`SELECT 1 FROM golf_rounds WHERE id = ? AND owner_user_id = ?`).bind(roundId, ownerId).first()
    if (!own) throw new GolfError('라운드를 찾을 수 없습니다.', 404)
  }

  // ── 플레이어
  const inputs: PlayerInput[] = Array.isArray(body?.players) ? body.players : []
  if (inputs.length < 1 || inputs.length > 8) throw new GolfError('플레이어는 1~8명이어야 합니다.')

  const self = await ensureSelfPlayer(db, ownerId)
  const owned = new Map((await listPlayers(db, ownerId)).map((p) => [p.id, p]))
  const byName = new Map([...owned.values()].map((p) => [p.display_name, p]))

  const stmts: D1PreparedStatement[] = []
  const rows: { playerId: string; total: number; front: number | null; back: number | null; putts: number | null; strokes: number[] | null; puttsArr: (number | null)[] | null }[] = []
  const seen = new Set<string>()

  for (const p of inputs) {
    // 플레이어 식별: 기존(내 소유) id 또는 새 이름
    let playerId: string
    let label: string
    if (p.player_id) {
      const found = owned.get(String(p.player_id))
      if (!found) throw new GolfError('플레이어 선택이 올바르지 않습니다.')
      playerId = found.id
      label = found.display_name
    } else {
      const name = cleanText(p.new_name, 30, '동반자 이름')!
      const existing = byName.get(name)
      if (existing) {
        playerId = existing.id
      } else {
        playerId = uuid()
        stmts.push(db.prepare(`INSERT INTO golf_players (id, owner_user_id, display_name, is_self) VALUES (?, ?, ?, 0)`)
          .bind(playerId, ownerId, name))
        byName.set(name, { id: playerId, display_name: name, is_self: 0 })
      }
      label = name
    }
    if (seen.has(playerId)) throw new GolfError(`플레이어가 중복되었습니다: ${label}`)
    seen.add(playerId)

    // 스코어: 홀별 전부 입력 or 총타만 입력
    const rawStrokes = Array.isArray(p.strokes) ? p.strokes.slice(0, holeCount) : []
    const filled = rawStrokes.filter((s) => !isBlank(s)).length
    let strokes: number[] | null = null
    let total: number
    let front: number | null = null
    let back: number | null = null
    if (filled > 0) {
      if (filled !== holeCount) throw new GolfError(`${label}: 홀별 스코어는 ${holeCount}개 홀 모두 입력하거나 비워두세요.`)
      strokes = rawStrokes.map((s, i) => intIn(s, 1, 20, `${label} ${i + 1}번홀 타수`))
      total = strokes.reduce((a, b) => a + b, 0)
      front = strokes.slice(0, 9).reduce((a, b) => a + b, 0)
      back = holeCount === 18 ? total - front : null
    } else {
      if (isBlank(p.total)) throw new GolfError(`${label}: 총타 또는 홀별 스코어를 입력해주세요.`)
      total = intIn(p.total, holeCount, holeCount * 15, `${label} 총타`)
    }

    let puttsArr: (number | null)[] | null = null
    let puttsTotal: number | null = null
    if (strokes && Array.isArray(p.putts) && p.putts.some((x) => !isBlank(x))) {
      puttsArr = p.putts.slice(0, holeCount).map((x, i) => (isBlank(x) ? null : intIn(x, 0, 10, `${label} ${i + 1}번홀 퍼팅`)))
      while (puttsArr.length < holeCount) puttsArr.push(null)
      puttsTotal = puttsArr.every((x) => x !== null) ? (puttsArr as number[]).reduce((a, b) => a + b, 0) : null
    }

    rows.push({ playerId, total, front, back, putts: puttsTotal, strokes, puttsArr })
  }
  if (!seen.has(self.id)) throw new GolfError('본인 스코어가 포함되어야 합니다.')

  // ── 저장 (D1 batch = 단일 트랜잭션)
  const id = roundId ?? uuid()
  if (roundId) {
    stmts.push(
      db.prepare(
        `UPDATE golf_rounds SET played_on = ?, club_id = ?, front_course_id = ?, back_course_id = ?, tee = ?, memo = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND owner_user_id = ?`
      ).bind(playedOn, clubId, frontId, backId, tee, memo, id, ownerId),
      db.prepare(`DELETE FROM golf_hole_scores WHERE round_id = ?`).bind(id),
      db.prepare(`DELETE FROM golf_round_players WHERE round_id = ?`).bind(id),
    )
  } else {
    stmts.push(
      db.prepare(
        `INSERT INTO golf_rounds (id, owner_user_id, played_on, club_id, front_course_id, back_course_id, tee, memo, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual')`
      ).bind(id, ownerId, playedOn, clubId, frontId, backId, tee, memo),
    )
  }

  for (const r of rows) {
    stmts.push(
      db.prepare(
        `INSERT INTO golf_round_players (round_id, player_id, total, front_total, back_total, putts_total) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(id, r.playerId, r.total, r.front, r.back, r.putts),
    )
    if (r.strokes) {
      r.strokes.forEach((s, i) => {
        stmts.push(
          db.prepare(`INSERT INTO golf_hole_scores (round_id, player_id, hole_no, par, strokes, putts) VALUES (?, ?, ?, ?, ?, ?)`)
            .bind(id, r.playerId, i + 1, pars[i], s, r.puttsArr?.[i] ?? null),
        )
      })
    }
  }

  stmts.push(clearStatsCacheStmt(db))
  await db.batch(stmts)
  return id
}

export async function deleteRound(db: D1Database, ownerId: string, roundId: string): Promise<void> {
  const own = await db.prepare(`SELECT 1 FROM golf_rounds WHERE id = ? AND owner_user_id = ?`).bind(roundId, ownerId).first()
  if (!own) throw new GolfError('라운드를 찾을 수 없습니다.', 404)
  await db.batch([
    db.prepare(`DELETE FROM golf_hole_scores WHERE round_id = ?`).bind(roundId),
    db.prepare(`DELETE FROM golf_round_players WHERE round_id = ?`).bind(roundId),
    db.prepare(`DELETE FROM golf_rounds WHERE id = ? AND owner_user_id = ?`).bind(roundId, ownerId),
    clearStatsCacheStmt(db),
  ])
}

// ───────────────────────── 홈 요약 ─────────────────────────

export interface HomeSummary { rounds: number; year_rounds: number; year_avg: number | null; best: number | null; best_on: string | null }

// D1 무료 플랜은 하루 읽기 500만 행 한도라, 집계용 CTE 를 여러 번 다시 훑지 않는다.
// 내 라운드(라운드당 1행)를 한 번만 읽고 집계는 JS 에서 한다 — 라운드 700여 개 기준 약 1.5천 행.
interface MyRoundRow { club_id: string; played_on: string; full18: number; total: number | null }

async function myRoundRows(db: D1Database, ownerId: string): Promise<MyRoundRow[]> {
  const { results } = await db.prepare(
    `SELECT r.club_id, r.played_on, r.back_course_id IS NOT NULL AS full18, rp.total
       FROM golf_rounds r
       LEFT JOIN golf_round_players rp ON rp.round_id = r.id
        AND rp.player_id = (SELECT id FROM golf_players WHERE owner_user_id = ?1 AND is_self = 1)
      WHERE r.owner_user_id = ?1`
  ).bind(ownerId).all<MyRoundRow>()
  return results
}

/** SQLite round(avg(x), 1) 과 같은 결과 */
const avg1 = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null

/** 18홀 + 본인 타수가 있는 라운드 (평균·베스트 기준) */
const isFull = <T extends { full18: number; total: number | null }>(r: T): r is T & { total: number } =>
  !!r.full18 && r.total != null

/** 18홀 라운드 기준 요약 */
async function homeSummaryRaw(db: D1Database, ownerId: string, year: string): Promise<HomeSummary> {
  const rows = await myRoundRows(db, ownerId)
  const full = rows.filter(isFull)
  const yearTotals = full.filter((r) => r.played_on.startsWith(year)).map((r) => r.total)
  // 베스트 동타면 최근 라운드
  const best = full.reduce<(typeof full)[number] | null>(
    (b, r) => (!b || r.total < b.total || (r.total === b.total && r.played_on > b.played_on) ? r : b),
    null,
  )
  return {
    rounds: rows.length,
    year_rounds: yearTotals.length,
    year_avg: avg1(yearTotals),
    best: best?.total ?? null,
    best_on: best?.played_on ?? null,
  }
}

// ───────────────────────── 골친(동반자 전적) ─────────────────────────

export interface Buddy {
  id: string; display_name: string
  rounds: number; wins: number; losses: number; draws: number
  /** 함께 친 전체 라운드 수 (recent 로 잘라도 전체 기준) */
  total_rounds: number
  last_on: string
  /** 18홀 라운드 평균 (함께한 라운드 기준) */
  my_avg: number | null; their_avg: number | null
}

/** 나와 한 동반자가 같이 친 라운드 1개 */
interface BuddyPair { played_on: string; created_at: string; full18: number; my: number; their: number }

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 최근 라운드 먼저 (played_on DESC, created_at DESC) */
function sortRecentFirst<T extends { played_on: string; created_at: string }>(list: T[]): T[] {
  return list.sort((a, b) => cmpStr(b.played_on, a.played_on) || cmpStr(b.created_at, a.created_at))
}

/** all: 최근순 정렬된 전체 라운드. recent 로 잘린 범위가 비면 null */
function buddyStats(id: string, display_name: string, all: BuddyPair[], recent: number | null): Buddy | null {
  const list = recent == null ? all : all.slice(0, Math.max(recent, 0))
  if (!list.length) return null
  const full = list.filter((p) => p.full18)
  return {
    id,
    display_name,
    rounds: list.length,
    total_rounds: all.length,
    wins: list.filter((p) => p.my < p.their).length,
    losses: list.filter((p) => p.my > p.their).length,
    draws: list.filter((p) => p.my === p.their).length,
    last_on: list[0].played_on,
    my_avg: avg1(full.map((p) => p.my)),
    their_avg: avg1(full.map((p) => p.their)),
  }
}

/**
 * 나와 함께 친 동반자 목록 (함께한 라운드 수 많은 순).
 * 승패는 같은 라운드에서 본인 타수와 비교 — 적게 친 쪽이 승.
 * minRounds: 이 횟수 이상 함께한 사람만 (조인 1회성 동반자 제외용, 전체 라운드 기준)
 * recent: 동반자별 최근 N라운드만 집계 (null 이면 전체). 정렬은 전체 라운드 수 기준 그대로
 */
async function listBuddiesRaw(db: D1Database, ownerId: string, minRounds = 1, recent: number | null = null): Promise<Buddy[]> {
  // 윈도 함수·GROUP BY 를 SQL 에서 돌리면 임시 B-tree 까지 읽기로 잡혀 호출당 1.8만 행이 나온다.
  // (나, 동반자) 쌍만 읽고(약 4.5천 행) 집계는 JS 에서 한다.
  const [pairsRes, namesRes] = await db.batch([
    db.prepare(
      `SELECT o.player_id AS opp, r.played_on, r.created_at, r.back_course_id IS NOT NULL AS full18,
              m.total AS my, o.total AS their
         FROM golf_round_players m
         JOIN golf_rounds r ON r.id = m.round_id
         JOIN golf_round_players o ON o.round_id = m.round_id AND o.player_id <> m.player_id
        WHERE m.player_id = (SELECT id FROM golf_players WHERE owner_user_id = ?1 AND is_self = 1)
          AND r.owner_user_id = ?1`
    ).bind(ownerId),
    db.prepare(`SELECT id, display_name FROM golf_players WHERE owner_user_id = ? AND is_self = 0`).bind(ownerId),
  ])
  const names = new Map((namesRes.results as { id: string; display_name: string }[]).map((p) => [p.id, p.display_name]))

  const byOpp = new Map<string, BuddyPair[]>()
  for (const p of pairsRes.results as (BuddyPair & { opp: string })[]) {
    if (!names.has(p.opp)) continue
    const list = byOpp.get(p.opp)
    if (list) list.push(p)
    else byOpp.set(p.opp, [p])
  }

  const buddies: Buddy[] = []
  for (const [opp, all] of byOpp) {
    if (all.length < minRounds) continue
    const b = buddyStats(opp, names.get(opp)!, sortRecentFirst(all), recent)
    if (b) buddies.push(b)
  }
  return buddies.sort((a, b) =>
    b.total_rounds - a.total_rounds || cmpStr(b.last_on, a.last_on) || cmpStr(a.display_name, b.display_name))
}

export interface BuddyRound {
  id: string; played_on: string; club_name: string; country_code: string; region: string | null
  front_course: string; back_course: string | null
  my: number; their: number
  /** 나·이 동반자 외 함께 친 사람 이름 (쉼표 구분, 없으면 null) */
  others: string | null
}

/** 특정 동반자와 함께 친 라운드 (최근순) + 동반자 정보. recent: 최근 N라운드만 (null 이면 전체) */
async function getBuddyRaw(db: D1Database, ownerId: string, buddyId: string, recent: number | null = null): Promise<{ buddy: Buddy; self_name: string; rounds: BuddyRound[] } | null> {
  // 전체 동반자 집계(listBuddies)를 돌리지 않고, 이 동반자와 친 라운드만 읽는다.
  // 동반자 인덱스(player_id)에서 시작해 함께 친 라운드 수만큼만 읽는다. 전적 집계·정렬·자르기는 JS 에서 한다.
  const [selfRes, buddyRes, roundsRes] = await db.batch([
    db.prepare(`SELECT display_name FROM golf_players WHERE owner_user_id = ? AND is_self = 1`).bind(ownerId),
    db.prepare(`SELECT display_name FROM golf_players WHERE id = ? AND owner_user_id = ? AND is_self = 0`).bind(buddyId, ownerId),
    db.prepare(
      `SELECT r.id, r.played_on, c.name AS club_name, c.country_code, c.region,
              fc.name AS front_course, bc.name AS back_course,
              m.total AS my, o.total AS their,
              (SELECT group_concat(xp.display_name, ', ')
                 FROM golf_round_players x JOIN golf_players xp ON xp.id = x.player_id
                WHERE x.round_id = r.id AND x.player_id NOT IN (m.player_id, o.player_id)) AS others,
              r.created_at, r.back_course_id IS NOT NULL AS full18
         FROM golf_round_players o
         JOIN golf_rounds r ON r.id = o.round_id
         JOIN golf_round_players m ON m.round_id = o.round_id
          AND m.player_id = (SELECT id FROM golf_players WHERE owner_user_id = ?1 AND is_self = 1)
         JOIN golf_clubs c ON c.id = r.club_id
         JOIN golf_courses fc ON fc.id = r.front_course_id
         LEFT JOIN golf_courses bc ON bc.id = r.back_course_id
        WHERE o.player_id = ?2 AND r.owner_user_id = ?1`
    ).bind(ownerId, buddyId),
  ])
  const name = (buddyRes.results[0] as { display_name: string } | undefined)?.display_name
  if (name == null) return null
  const all = sortRecentFirst(roundsRes.results as (BuddyRound & BuddyPair)[])
  const buddy = buddyStats(buddyId, name, all, recent)
  if (!buddy) return null
  const shown = recent == null ? all : all.slice(0, buddy.rounds)
  return {
    buddy,
    self_name: (selfRes.results[0] as { display_name: string } | undefined)?.display_name ?? '나',
    rounds: shown.map(({ created_at, full18, ...r }) => r),
  }
}

// ───────────────────────── 검색 ─────────────────────────

export interface SearchIndex {
  clubs: { id: string; name: string; rounds: number }[]
  players: { id: string; name: string; rounds: number }[]
}

/** 헤더 검색 자동완성용 — 내가 라운드한 골프장, 함께 친 동반자만 (라운드 수 많은 순) */
async function searchIndexRaw(db: D1Database, ownerId: string): Promise<SearchIndex> {
  const [clubs, players] = await db.batch([
    db.prepare(
      `SELECT c.id, c.name, count(*) AS rounds
         FROM golf_rounds r JOIN golf_clubs c ON c.id = r.club_id
        WHERE r.owner_user_id = ?
        GROUP BY c.id ORDER BY rounds DESC, c.name`
    ).bind(ownerId),
    db.prepare(
      `SELECT p.id, p.display_name AS name, count(*) AS rounds
         FROM golf_round_players rp
         JOIN golf_players p ON p.id = rp.player_id
         JOIN golf_rounds r ON r.id = rp.round_id
        WHERE p.owner_user_id = ? AND p.is_self = 0 AND r.owner_user_id = p.owner_user_id
        GROUP BY p.id ORDER BY rounds DESC, p.display_name`
    ).bind(ownerId),
  ])
  return { clubs: clubs.results as SearchIndex['clubs'], players: players.results as SearchIndex['players'] }
}

// ───────────────────────── 랭킹·통계 ─────────────────────────

export interface ClubStat { id: string; name: string; rounds: number; avg: number | null; /** 평균에 들어간 18홀(본인 타수 있음) 라운드 수 */ full_rounds: number }
export interface YearStat { year: string; rounds: number; avg: number | null }
export interface MonthStat { month: number; rounds: number }

/** 랭킹 페이지용 — 골프장별 방문 수, 연도별·월별 라운드 수. 평균은 18홀 본인 타수 기준 */
async function rankingStatsRaw(db: D1Database, ownerId: string): Promise<{ clubs: ClubStat[]; years: YearStat[]; months: MonthStat[] }> {
  // 같은 CTE 를 쿼리 3개가 각각 훑던 것을 1번 읽기 + JS 집계로 바꿈 (약 8천 → 1.7천 행)
  const [rows, clubRes] = await Promise.all([
    myRoundRows(db, ownerId),
    db.prepare(`SELECT id, name FROM golf_clubs`).all<{ id: string; name: string }>(),
  ])
  const clubNames = new Map(clubRes.results.map((c) => [c.id, c.name]))

  const clubMap = new Map<string, { last: string; totals: number[]; rounds: number }>()
  const yearMap = new Map<string, { totals: number[]; rounds: number }>()
  const monthMap = new Map<number, number>()
  for (const r of rows) {
    const total = isFull(r) ? r.total : null
    if (clubNames.has(r.club_id)) {
      const c = clubMap.get(r.club_id) ?? { last: '', totals: [], rounds: 0 }
      c.rounds++
      if (r.played_on > c.last) c.last = r.played_on
      if (total != null) c.totals.push(total)
      clubMap.set(r.club_id, c)
    }
    const yk = r.played_on.slice(0, 4)
    const y = yearMap.get(yk) ?? { totals: [], rounds: 0 }
    y.rounds++
    if (total != null) y.totals.push(total)
    yearMap.set(yk, y)
    const m = parseInt(r.played_on.slice(5, 7), 10)
    monthMap.set(m, (monthMap.get(m) ?? 0) + 1)
  }

  const clubs: (ClubStat & { last: string })[] = [...clubMap].map(([id, c]) => ({
    id, name: clubNames.get(id)!, rounds: c.rounds, avg: avg1(c.totals), full_rounds: c.totals.length, last: c.last,
  }))
  clubs.sort((a, b) => b.rounds - a.rounds || cmpStr(b.last, a.last) || cmpStr(a.name, b.name))
  return {
    clubs: clubs.map(({ last, ...c }) => c),
    years: [...yearMap].sort((a, b) => cmpStr(a[0], b[0])).map(([year, y]) => ({ year, rounds: y.rounds, avg: avg1(y.totals) })),
    months: [...monthMap].sort((a, b) => a[0] - b[0]).map(([month, rounds]) => ({ month, rounds })),
  }
}

// ───────────────────────── 캐시된 조회 (페이지·API 는 이 함수들만 쓴다) ─────────────────────────
// 키는 함수 이름 + 인자. 원본 계산은 위의 *Raw 함수에 있다.

/** clubId: 주면 그 골프장 라운드만 */
export function listRounds(db: D1Database, ownerId: string, limit = 200, year?: string, sort: RoundSort = 'new', clubId?: string) {
  return cached(db, ownerId, `rounds:${limit}:${year ?? ''}:${sort}:${clubId ?? ''}`, () => listRoundsRaw(db, ownerId, limit, year, sort, clubId))
}
/** 내가 그 골프장에서 친 라운드 수 */
export function countClubRounds(db: D1Database, ownerId: string, clubId: string) {
  return cached(db, ownerId, `club-count:${clubId}`, () => countClubRoundsRaw(db, ownerId, clubId))
}
/** 라운드가 있는 연도 목록 (최신순) */
export function listRoundYears(db: D1Database, ownerId: string) {
  return cached(db, ownerId, 'years', () => listRoundYearsRaw(db, ownerId))
}
/** 기간 요약 — 평균·베스트는 18홀 라운드(본인) 기준. year 없으면 전체 */
export function periodSummary(db: D1Database, ownerId: string, year?: string) {
  return cached(db, ownerId, `period:${year ?? 'all'}`, () => periodSummaryRaw(db, ownerId, year))
}
/** 18홀 라운드 기준 요약 */
export function homeSummary(db: D1Database, ownerId: string, year: string) {
  return cached(db, ownerId, `home:${year}`, () => homeSummaryRaw(db, ownerId, year))
}
/** 나와 함께 친 동반자 목록 (함께한 라운드 수 많은 순) — 자세한 규칙은 listBuddiesRaw */
export function listBuddies(db: D1Database, ownerId: string, minRounds = 1, recent: number | null = null) {
  return cached(db, ownerId, `buddies:${minRounds}:${recent ?? 'all'}`, () => listBuddiesRaw(db, ownerId, minRounds, recent))
}
/** 특정 동반자와 함께 친 라운드 (최근순) + 동반자 정보. recent: 최근 N라운드만 (null 이면 전체) */
export function getBuddy(db: D1Database, ownerId: string, buddyId: string, recent: number | null = null) {
  return cached(db, ownerId, `buddy:${buddyId}:${recent ?? 'all'}`, () => getBuddyRaw(db, ownerId, buddyId, recent))
}
/** 헤더 검색 자동완성용 — 내가 라운드한 골프장, 함께 친 동반자만 (라운드 수 많은 순) */
export function searchIndex(db: D1Database, ownerId: string) {
  return cached(db, ownerId, 'search', () => searchIndexRaw(db, ownerId))
}
/** 랭킹 페이지용 — 골프장별 방문 수, 연도별·월별 라운드 수. 평균은 18홀 본인 타수 기준 */
export function rankingStats(db: D1Database, ownerId: string) {
  return cached(db, ownerId, 'ranking', () => rankingStatsRaw(db, ownerId))
}

// 골프 스코어 데이터 접근 레이어 (1인 전용, 접근 제어는 middleware).
// players/rounds/scores 는 이 파일의 함수로만 접근한다 — 모든 쿼리가 owner_user_id 로 범위가 제한된다.

export class GolfError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}

const uuid = () => crypto.randomUUID()

// ───────────────────────── 골프장 / 코스 ─────────────────────────

export interface Club { id: string; name: string; country_code: string; region: string | null }
export interface Course { id: string; club_id: string; name: string; pars: number[] }
export type ClubWithCourses = Club & { courses: Course[] }

export const COUNTRIES: Record<string, string> = {
  KR: '한국', JP: '일본', TH: '태국', VN: '베트남', PH: '필리핀', CN: '중국', TW: '대만', MN: '몽골',
  MY: '말레이시아', ID: '인도네시아', US: '미국', AU: '호주', NZ: '뉴질랜드', ES: '스페인', GB: '영국', XX: '미상',
}
export const countryName = (code: string) => COUNTRIES[code] ?? code

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
  await db.prepare(`INSERT INTO golf_clubs (id, name, country_code, region, created_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, name, country, region, userId).run()
  return id
}

/** 골프장 이름·국가·지역 수정 */
export async function updateClub(db: D1Database, clubId: string, body: any): Promise<void> {
  const { name, country, region } = parseClub(body)
  await assertClubNameFree(db, name, country, clubId)
  const res = await db.prepare(`UPDATE golf_clubs SET name = ?, country_code = ?, region = ? WHERE id = ?`)
    .bind(name, country, region, clubId).run()
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
  await db.prepare(`INSERT INTO golf_courses (id, club_id, name, pars_json, created_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, clubId, name, JSON.stringify(pars), userId).run()
  return id
}

export async function updateCoursePars(db: D1Database, courseId: string, body: any): Promise<void> {
  const pars = parsePars(body?.pars)
  const res = await db.prepare(`UPDATE golf_courses SET pars_json = ? WHERE id = ?`)
    .bind(JSON.stringify(pars), courseId).run()
  if (!res.meta.changes) throw new GolfError('코스를 찾을 수 없습니다.', 404)
}

/** 라운드에서 사용 중이면 삭제 불가 */
export async function deleteCourse(db: D1Database, courseId: string): Promise<void> {
  const used = await db.prepare(
    `SELECT 1 FROM golf_rounds WHERE front_course_id = ? OR back_course_id = ? LIMIT 1`
  ).bind(courseId, courseId).first()
  if (used) throw new GolfError('라운드 기록에서 사용 중인 코스는 삭제할 수 없습니다.', 409)
  await db.prepare(`DELETE FROM golf_courses WHERE id = ?`).bind(courseId).run()
}

/** 코스가 남아 있거나 라운드에서 사용 중이면 삭제 불가 */
export async function deleteClub(db: D1Database, clubId: string): Promise<void> {
  const used = await db.prepare(
    `SELECT 1 FROM golf_courses WHERE club_id = ? UNION ALL SELECT 1 FROM golf_rounds WHERE club_id = ? LIMIT 1`
  ).bind(clubId, clubId).first()
  if (used) throw new GolfError('코스가 있거나 라운드에서 사용 중인 골프장은 삭제할 수 없습니다.', 409)
  await db.prepare(`DELETE FROM golf_clubs WHERE id = ?`).bind(clubId).run()
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
  await db.prepare(`INSERT INTO golf_players (id, owner_user_id, display_name, is_self) VALUES (?, ?, ?, 1)`)
    .bind(id, ownerId, name).run()
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

export async function listRounds(db: D1Database, ownerId: string, limit = 200, year?: string, sort: RoundSort = 'new'): Promise<RoundListItem[]> {
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
      ORDER BY ${ROUND_ORDER[sort]}
      LIMIT ?`
  ).bind(ownerId, year ?? null, year ?? null, limit).all<RoundListItem>()
  return results
}

export interface YearCount { year: string; rounds: number }

/** 라운드가 있는 연도 목록 (최신순) */
export async function listRoundYears(db: D1Database, ownerId: string): Promise<YearCount[]> {
  const { results } = await db.prepare(
    `SELECT substr(played_on, 1, 4) AS year, count(*) AS rounds
       FROM golf_rounds WHERE owner_user_id = ?
      GROUP BY year ORDER BY year DESC`
  ).bind(ownerId).all<YearCount>()
  return results
}

export interface PeriodSummary { rounds: number; full_rounds: number; avg: number | null; best: number | null; best_on: string | null }

/** 기간 요약 — 평균·베스트는 18홀 라운드(본인) 기준. year 없으면 전체 */
export async function periodSummary(db: D1Database, ownerId: string, year?: string): Promise<PeriodSummary> {
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
  ])
}

// ───────────────────────── 홈 요약 ─────────────────────────

export interface HomeSummary { rounds: number; year_rounds: number; year_avg: number | null; best: number | null; best_on: string | null }

/** 18홀 라운드 기준 요약 */
export async function homeSummary(db: D1Database, ownerId: string, year: string): Promise<HomeSummary> {
  const row = await db.prepare(
    `WITH mine AS (
       SELECT r.played_on, rp.total
         FROM golf_rounds r
         JOIN golf_round_players rp ON rp.round_id = r.id
         JOIN golf_players p ON p.id = rp.player_id AND p.is_self = 1
        WHERE r.owner_user_id = ? AND r.back_course_id IS NOT NULL
     )
     SELECT (SELECT count(*) FROM golf_rounds WHERE owner_user_id = ?) AS rounds,
            (SELECT count(*) FROM mine WHERE substr(played_on, 1, 4) = ?) AS year_rounds,
            (SELECT round(avg(total), 1) FROM mine WHERE substr(played_on, 1, 4) = ?) AS year_avg,
            (SELECT min(total) FROM mine) AS best,
            (SELECT played_on FROM mine ORDER BY total, played_on DESC LIMIT 1) AS best_on`
  ).bind(ownerId, ownerId, year, year).first<HomeSummary>()
  return row ?? { rounds: 0, year_rounds: 0, year_avg: null, best: null, best_on: null }
}

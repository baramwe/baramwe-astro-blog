// 라운드 검색 결과 (/private/golf/score/rounds?q=...) — DB 없이 라운드 목록만으로 계산하는 순수 함수.
// - 골프장 이름 · 나라('일본', '해외') · 지역('구마모토') 으로 라운드를 찾는다. 쉼표로 여러 검색어('이바라키,지바').
// - 지역으로 찾은 해외 라운드는 그 여행(같은 나라에서 3일 이내로 이어진 라운드)의 다른 라운드도 함께 보여 준다.

export interface AreaRound {
  played_on: string
  club_name: string
  country_code: string
  region: string | null
}

export interface TripGroup<R> {
  /** 'JP:2026-05-22' 같은 여행 키. 여행으로 묶이지 않은(국내) 결과는 null */
  trip: string | null
  title: string
  rounds: R[]
}

const TRIP_GAP_DAYS = 3

const COUNTRY_ALIASES: Record<string, string[]> = {
  KR: ['한국', '국내', '대한민국'],
  JP: ['일본'],
  CN: ['중국'],
  VN: ['베트남'],
  TH: ['태국'],
  PH: ['필리핀'],
  MY: ['말레이시아'],
  TW: ['대만'],
  MN: ['몽골'],
  US: ['미국'],
  ID: ['인도네시아'],
  KH: ['캄보디아'],
  LA: ['라오스'],
  AU: ['호주'],
  NZ: ['뉴질랜드'],
  ES: ['스페인'],
  GB: ['영국'],
  GU: ['괌'],
  MP: ['사이판'],
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

export const splitQuery = (q: string) => q.split(/[,，]/).map(norm).filter(Boolean)

function countryMatch(k: string, cc: string): boolean {
  if (k.length < 2) return false
  if ('해외'.startsWith(k)) return cc !== 'KR'
  return (COUNTRY_ALIASES[cc] ?? []).some((n) => n.startsWith(k))
}

const regionMatch = (k: string, region: string | null) => k.length >= 2 && !!region && norm(region).includes(k)

/** 검색어 중 하나라도 나라·지역 이름에 맞는 골프장이 있으면 true (자동완성에서 '검색 결과' 행을 맨 위로 올릴 때) */
export function isAreaQuery(q: string, clubs: { country_code?: string; region?: string | null }[]): boolean {
  const keys = splitQuery(q)
  return clubs.some((c) => keys.some((k) => countryMatch(k, c.country_code ?? '') || regionMatch(k, c.region ?? null)))
}

/** 해외 라운드를 여행 단위로 묶은 키 (같은 나라·직전 라운드와 3일 이내). 국내는 null */
function tripKeys<R extends AreaRound>(rounds: R[]): Map<R, string | null> {
  const out = new Map<R, string | null>()
  const abroad = rounds.filter((r) => r.country_code !== 'KR').sort((a, b) => (a.played_on < b.played_on ? -1 : a.played_on > b.played_on ? 1 : 0))
  let key = ''
  let prev: R | null = null
  for (const r of abroad) {
    const gap = prev ? (Date.parse(r.played_on) - Date.parse(prev.played_on)) / 86400000 : Infinity
    if (!prev || prev.country_code !== r.country_code || gap > TRIP_GAP_DAYS) key = `${r.country_code}:${r.played_on}`
    out.set(r, key)
    prev = r
  }
  for (const r of rounds) if (!out.has(r)) out.set(r, null)
  return out
}

const dot = (d: string) => d.replace(/-/g, '.')

/**
 * 검색 결과 라운드를 여행별로 묶어 최신 여행 먼저 돌려준다.
 * rounds 는 최신순 전체 라운드(listRounds 'new').
 */
export function searchRounds<R extends AreaRound>(
  rounds: R[],
  q: string,
  countryName: (cc: string) => string
): { groups: TripGroup<R>[]; total: number } {
  const keys = splitQuery(q)
  if (!keys.length) return { groups: [], total: 0 }
  const trips = tripKeys(rounds)

  const hit = new Set<R>()
  const regionTrips = new Set<string>()
  for (const r of rounds) {
    for (const k of keys) {
      if (norm(r.club_name).includes(k) || countryMatch(k, r.country_code)) hit.add(r)
      else if (regionMatch(k, r.region)) {
        hit.add(r)
        const t = trips.get(r)
        if (t) regionTrips.add(t)
      }
    }
  }
  for (const r of rounds) {
    const t = trips.get(r)
    if (t && regionTrips.has(t)) hit.add(r)
  }

  const byTrip = new Map<string, R[]>()
  const domestic: R[] = []
  for (const r of rounds) {
    if (!hit.has(r)) continue
    const t = trips.get(r)
    if (!t) domestic.push(r)
    else byTrip.set(t, [...(byTrip.get(t) ?? []), r])
  }

  // 여행 묶음 제목에는 그 여행의 전체 기간·지역을 쓴다 (검색에 걸린 라운드만이 아니라)
  const tripAll = new Map<string, R[]>()
  for (const r of rounds) {
    const t = trips.get(r)
    if (t && byTrip.has(t)) tripAll.set(t, [...(tripAll.get(t) ?? []), r])
  }

  const groups: TripGroup<R>[] = [...byTrip].map(([trip, rs]) => {
    const all = tripAll.get(trip) ?? rs
    const dates = all.map((r) => r.played_on).sort()
    const first = dates[0]
    const last = dates[dates.length - 1]
    const period = first === last ? dot(first) : `${dot(first)} ~ ${first.slice(0, 4) === last.slice(0, 4) ? dot(last.slice(5)) : dot(last)}`
    const regions = [...new Set(all.map((r) => r.region).filter((x): x is string => !!x))].join('·')
    return { trip, title: `${countryName(all[0].country_code)}${regions ? ` ${regions}` : ''} · ${period}`, rounds: rs }
  })
  groups.sort((a, b) => (a.rounds[0].played_on < b.rounds[0].played_on ? 1 : -1))
  if (domestic.length) groups.push({ trip: null, title: '국내', rounds: domestic })
  return { groups, total: hit.size }
}

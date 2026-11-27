import { useEffect, useMemo, useRef, useState } from 'react'
import { openDetail } from '../../lib/golf/app'

// 헤더 검색: 골프장(기본) → 그 골프장 라운드 목록, 동반자 → 상대전적(함께 친 라운드) 페이지.
// 이름 목록은 localStorage 에 캐시해 두고 바로 쓰며, 뒤에서 한 번 새로 받아 갱신한다.
// 나라('일본', '해외')·지역('구마모토') 으로도 골프장을 찾고, 지역으로 찾으면 같은 여행에 간 골프장도 함께 보여 준다.
// 쉼표로 여러 검색어를 넣으면 합쳐서 보여 준다 ('이바라키,지바').

interface Item { id: string; name: string; rounds: number }
interface ClubItem extends Item { country_code?: string; region?: string | null; trips?: string[] }
interface Index { clubs: ClubItem[]; players: Item[] }
type Hit = Item & { kind: 'club' | 'player'; sub?: string }

const BASE = '/private/golf/score'
const CACHE_KEY = 'golf-search-index-v2'
const MAX_PER_GROUP = 6
const MAX_AREA_CLUBS = 40

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const COUNTRY_NAMES: Record<string, string[]> = {
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
  GU: ['괌'],
  MP: ['사이판'],
}
const countryLabel = (cc?: string) => COUNTRY_NAMES[cc ?? '']?.[0] ?? cc ?? ''

/** 검색어가 나라 이름이면 그 나라 코드 ('해외' 는 KR 이 아닌 전부) */
function countryMatch(k: string, cc?: string): boolean {
  if (!cc || k.length < 2) return false
  if ('해외'.startsWith(k)) return cc !== 'KR'
  return (COUNTRY_NAMES[cc] ?? []).some((n) => n.startsWith(k)) || cc.toLowerCase() === k
}

/** 검색어가 골프장의 나라 이름이나 지역명에 맞는지 (2글자 이상) */
function areaMatch(k: string, c: ClubItem): boolean {
  if (k.length < 2) return false
  if (countryMatch(k, c.country_code)) return true
  return !!c.region && norm(c.region).includes(k)
}

function readCache(): Index | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Index) : null
  } catch {
    return null
  }
}

function writeCache(idx: Index) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(idx))
  } catch {
    /* 사생활 보호 모드 등 — 캐시 없이 동작 */
  }
}

const hrefOf = (h: Hit) => (h.kind === 'club' ? `${BASE}/rounds?club=${encodeURIComponent(h.id)}` : `${BASE}/friends/${encodeURIComponent(h.id)}`)

export default function GolfSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [index, setIndex] = useState<Index | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const fetched = useRef(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const load = () => {
    if (fetched.current) return
    fetched.current = true
    fetch('/api/golf/search-index')
      .then((r) => (r.ok ? (r.json() as Promise<Index>) : null))
      .then((d) => {
        if (d?.clubs && d?.players) {
          setIndex(d)
          writeCache(d)
        }
      })
      .catch(() => {})
  }

  useEffect(() => {
    setIndex(readCache())
    const close = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // 골프장 먼저(기본), 그다음 동반자. 앞부분이 맞는 이름을 위로.
  const hits = useMemo<Hit[]>(() => {
    const keys = q.split(/[,，]/).map(norm).filter(Boolean)
    if (!keys.length || !index) return []

    // 골프장: 이름 매칭 > 나라·지역 매칭 > 지역 매칭 골프장과 같은 여행 순
    const rank = new Map<string, number>()
    const put = (id: string, r: number) => rank.set(id, Math.min(rank.get(id) ?? 9, r))
    const regionTrips = new Set<string>()
    for (const k of keys) {
      for (const c of index.clubs) {
        const pos = norm(c.name).indexOf(k)
        if (pos >= 0) put(c.id, pos === 0 ? 0 : 1)
        else if (areaMatch(k, c)) {
          put(c.id, 2)
          if (!countryMatch(k, c.country_code)) c.trips?.forEach((t) => regionTrips.add(t))
        }
      }
    }
    if (regionTrips.size) for (const c of index.clubs) if (c.trips?.some((t) => regionTrips.has(t))) put(c.id, 3)
    const areaSearch = [...rank.values()].some((r) => r >= 2)
    const clubHits: Hit[] = index.clubs
      .filter((c) => rank.has(c.id))
      .sort((a, b) => rank.get(a.id)! - rank.get(b.id)! || b.rounds - a.rounds)
      .slice(0, areaSearch ? MAX_AREA_CLUBS : MAX_PER_GROUP)
      .map((c) => {
        const area = [c.country_code && c.country_code !== 'KR' ? countryLabel(c.country_code) : '', c.region ?? ''].filter(Boolean).join(' ')
        return { id: c.id, name: c.name, rounds: c.rounds, kind: 'club', sub: rank.get(c.id) === 3 ? `${area} · 같은 여행` : area || undefined }
      })

    const playerHits: Hit[] = index.players
      .map((it) => ({ it, pos: Math.min(...keys.map((k) => { const p = norm(it.name).indexOf(k); return p < 0 ? Infinity : p })) }))
      .filter((x) => x.pos !== Infinity)
      .sort((a, b) => (a.pos === 0 ? 0 : 1) - (b.pos === 0 ? 0 : 1) || b.it.rounds - a.it.rounds)
      .slice(0, MAX_PER_GROUP)
      .map((x) => ({ ...x.it, kind: 'player' as const }))
    return [...clubHits, ...playerHits]
  }, [q, index])

  useEffect(() => setActive(0), [q]) // 입력이 바뀌면 첫 결과(골프장 우선)가 자동 선택

  const go = (h: Hit | undefined) => {
    if (!h) return
    setOpen(false)
    openDetail(hrefOf(h)) // 앱이면 네이티브 상세 화면, 웹이면 일반 이동
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const firstPlayer = hits.findIndex((h) => h.kind === 'player')

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1">
      <input
        type="search"
        inputMode="search"
        enterKeyHint="go"
        autoComplete="off"
        autoFocus={autoFocus}
        value={q}
        placeholder="골프장 · 지역 · 동반자 검색"
        aria-label="골프장 또는 동반자 검색"
        role="combobox"
        aria-expanded={open && q.length > 0}
        aria-controls="golf-search-list"
        onFocus={() => {
          load()
          setOpen(true)
        }}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKey}
        className="w-full rounded border border-kb-border bg-kb-page py-1.5 pl-8 pr-3 text-[16px] text-kb-title placeholder:text-kb-muted transition-colors hover:border-kb-border-strong focus:border-kb-primary focus:outline-none focus:ring-1 focus:ring-kb-primary"
      />
      <span aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-kb-muted">⌕</span>

      {open && q.trim() && (
        <ul
          id="golf-search-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[60vh] overflow-y-auto rounded border border-kb-border bg-kb-panel py-1 text-kb-text shadow-[0_3px_10px_rgba(0,0,0,.52),0_6px_14px_rgba(0,0,0,.28)]"
        >
          {!index && <li className="px-3 py-2.5 text-sm text-kb-subdued">불러오는 중…</li>}
          {index && hits.length === 0 && <li className="px-3 py-2.5 text-sm text-kb-subdued">맞는 골프장·동반자가 없어요</li>}
          {hits.map((h, i) => (
            <li key={`${h.kind}:${h.id}`} role="option" aria-selected={i === active}>
              {(i === 0 || i === firstPlayer) && (
                <div className="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-kb-muted">{h.kind === 'club' ? '골프장' : '동반자'}</div>
              )}
              <a
                href={hrefOf(h)}
                onMouseEnter={() => setActive(i)}
                onClick={(e) => {
                  e.preventDefault()
                  go(h)
                }}
                className={`flex items-center gap-2 px-3 py-2 ${i === active ? 'bg-kb-primary-subtle text-kb-title' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {h.name}
                  {h.sub && <span className="ml-1.5 text-xs text-kb-muted">{h.sub}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-kb-muted">{h.rounds}회</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

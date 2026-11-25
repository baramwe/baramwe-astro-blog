import { useEffect, useMemo, useRef, useState } from 'react'
import { openDetail } from '../../lib/golf/app'

// 헤더 검색: 골프장(기본) → 그 골프장 라운드 목록, 동반자 → 상대전적(함께 친 라운드) 페이지.
// 이름 목록은 localStorage 에 캐시해 두고 바로 쓰며, 뒤에서 한 번 새로 받아 갱신한다.

interface Item { id: string; name: string; rounds: number }
interface Index { clubs: Item[]; players: Item[] }
type Hit = Item & { kind: 'club' | 'player' }

const BASE = '/private/golf/score'
const CACHE_KEY = 'golf-search-index-v1'
const MAX_PER_GROUP = 6

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

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
    const k = norm(q)
    if (!k || !index) return []
    const pick = (list: Item[], kind: Hit['kind']) =>
      list
        .map((it) => ({ it, pos: norm(it.name).indexOf(k) }))
        .filter((x) => x.pos >= 0)
        .sort((a, b) => (a.pos === 0 ? 0 : 1) - (b.pos === 0 ? 0 : 1) || b.it.rounds - a.it.rounds)
        .slice(0, MAX_PER_GROUP)
        .map((x) => ({ ...x.it, kind }))
    return [...pick(index.clubs, 'club'), ...pick(index.players, 'player')]
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
        placeholder="골프장 · 동반자 검색"
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
                <span className="min-w-0 flex-1 truncate">{h.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-kb-muted">{h.rounds}회</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

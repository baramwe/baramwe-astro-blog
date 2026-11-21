import { useMemo, useState } from 'react'
import type { ClubWithCourses, Player, RoundDetail } from '../../lib/golf/repo'

interface Props {
  clubs: ClubWithCourses[]
  players: Player[]
  selfId: string
  countries: Record<string, string>
  initial?: RoundDetail | null
}

interface Row {
  key: string
  player_id?: string
  name: string
  is_self: boolean
  total: string
  strokes: (number | null)[]
  putts: (number | null)[]
}

const BASE = '/private/golf/score'
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
let keySeq = 0
const nextKey = () => `r${++keySeq}`
const fit = <T,>(arr: T[], n: number, fill: T): T[] => (arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)])
const sum = (arr: (number | null)[]) => arr.reduce<number>((a, b) => a + (b ?? 0), 0)

export default function RoundForm({ clubs, players, selfId, countries, initial }: Props) {
  const self = players.find((p) => p.id === selfId)!
  const companionsDir = players.filter((p) => !p.is_self)

  const [playedOn, setPlayedOn] = useState(initial?.played_on ?? today())
  const [clubId, setClubId] = useState(initial?.club_id ?? '')
  const [frontId, setFrontId] = useState(initial?.front_course_id ?? '')
  const [backId, setBackId] = useState(initial?.back_course_id ?? '')
  const [tee, setTee] = useState(initial?.tee ?? '')
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [rows, setRows] = useState<Row[]>(() => {
    if (initial) {
      return initial.players.map((p) => ({
        key: nextKey(), player_id: p.player_id, name: p.display_name, is_self: !!p.is_self,
        total: String(p.total), strokes: p.strokes, putts: p.putts,
      }))
    }
    return [{ key: nextKey(), player_id: self.id, name: self.display_name, is_self: true, total: '', strokes: [], putts: [] }]
  })
  const [mode, setMode] = useState<'total' | 'holes'>(
    initial?.players.some((p) => p.strokes.some((s) => s !== null)) ? 'holes' : 'total'
  )
  const [withPutts, setWithPutts] = useState(!!initial?.players.some((p) => p.putts.some((x) => x !== null)))
  const [hole, setHole] = useState(0)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const club = clubs.find((c) => c.id === clubId)
  const pars = useMemo(() => {
    const f = club?.courses.find((c) => c.id === frontId)?.pars ?? []
    const b = backId ? club?.courses.find((c) => c.id === backId)?.pars ?? [] : []
    return f.length ? [...f, ...b] : []
  }, [club, frontId, backId])
  const holeCount = pars.length
  const curHole = Math.min(hole, Math.max(holeCount - 1, 0))

  const byCountry = useMemo(() => {
    const m = new Map<string, ClubWithCourses[]>()
    for (const c of clubs) m.set(c.country_code, [...(m.get(c.country_code) ?? []), c])
    return [...m.entries()]
  }, [clubs])

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const onClub = (id: string) => {
    setClubId(id)
    const c = clubs.find((x) => x.id === id)
    setFrontId(c?.courses[0]?.id ?? '')
    setBackId(c?.courses[1]?.id ?? '')
    setHole(0)
  }

  const addCompanion = () => {
    const name = newName.trim()
    if (!name) return
    if (rows.length >= 8) return setError('플레이어는 최대 8명이에요.')
    if (rows.some((r) => r.name === name)) return setError(`이미 추가된 플레이어예요: ${name}`)
    const existing = companionsDir.find((p) => p.display_name === name)
    setRows((rs) => [...rs, { key: nextKey(), player_id: existing?.id, name, is_self: false, total: '', strokes: [], putts: [] }])
    setNewName('')
    setError('')
  }

  const step = (r: Row, field: 'strokes' | 'putts', delta: number) => {
    const arr = fit(r[field], holeCount, null)
    const base = field === 'strokes' ? pars[curHole] : 2
    const cur = arr[curHole]
    const next = cur === null ? base : cur + delta
    const [min, max] = field === 'strokes' ? [1, 20] : [0, 10]
    arr[curHole] = Math.min(max, Math.max(min, next))
    update(r.key, { [field]: arr })
  }
  const clearHole = (r: Row, field: 'strokes' | 'putts') => {
    const arr = fit(r[field], holeCount, null)
    arr[curHole] = null
    update(r.key, { [field]: arr })
  }

  const holeFilled = (i: number) => rows.every((r) => r.strokes[i] != null)

  const submit = async () => {
    setError('')
    if (!clubId || !frontId) return setError('골프장과 코스를 선택해주세요.')
    const body = {
      played_on: playedOn,
      club_id: clubId,
      front_course_id: frontId,
      back_course_id: backId || null,
      tee: tee || null,
      memo: memo || null,
      players: rows.map((r) => ({
        ...(r.player_id ? { player_id: r.player_id } : { new_name: r.name }),
        ...(mode === 'holes'
          ? { strokes: fit(r.strokes, holeCount, null), putts: withPutts ? fit(r.putts, holeCount, null) : [] }
          : { total: r.total === '' ? null : Number(r.total) }),
      })),
    }
    setSaving(true)
    try {
      const res = await fetch(initial ? `/api/golf/rounds/${initial.id}` : '/api/golf/rounds', {
        method: initial ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장에 실패했습니다.')
      location.href = `${BASE}/rounds/${data.id}`
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  if (clubs.length === 0) {
    return (
      <div className="g-card text-center text-sm space-y-3">
        <p>등록된 골프장이 없어요. 먼저 골프장과 코스를 등록해주세요.</p>
        <a href={`${BASE}/clubs`} className="g-btn inline-block">골프장 등록하러 가기</a>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <section className="g-card space-y-3">
        <label className="block">
          <span className="text-xs text-gray-500">일자</span>
          <input type="date" className="g-input" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">골프장</span>
          <select className="g-input" value={clubId} onChange={(e) => onClub(e.target.value)}>
            <option value="">선택</option>
            {byCountry.map(([cc, list]) => (
              <optgroup key={cc} label={countries[cc] ?? cc}>
                {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.region ? ` (${c.region})` : ''}</option>)}
              </optgroup>
            ))}
          </select>
          <a href={`${BASE}/clubs`} className="text-xs text-emerald-700">골프장이 없나요? 등록하기 →</a>
        </label>
        {club && (
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-gray-500">전반 코스</span>
              <select className="g-input" value={frontId} onChange={(e) => setFrontId(e.target.value)}>
                {club.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">후반 코스</span>
              <select className="g-input" value={backId} onChange={(e) => setBackId(e.target.value)}>
                <option value="">없음 (9홀)</option>
                {club.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {club.courses.length === 0 && <p className="col-span-2 text-xs text-red-700">이 골프장에 코스가 없어요. 골프장 메뉴에서 코스를 추가해주세요.</p>}
          </div>
        )}
        <label className="block">
          <span className="text-xs text-gray-500">티 (선택)</span>
          <input className="g-input" value={tee} maxLength={20} placeholder="화이트, 블루…" onChange={(e) => setTee(e.target.value)} />
        </label>
      </section>

      {/* 플레이어 */}
      <section className="g-card space-y-2">
        <h2 className="font-semibold text-sm">플레이어</h2>
        <ul className="flex flex-wrap gap-2">
          {rows.map((r) => (
            <li key={r.key} className={`px-3 py-1 rounded-full text-sm ${r.is_self ? 'bg-emerald-700 text-white' : 'bg-gray-100'}`}>
              {r.name}{!r.player_id && <span className="text-[10px] ml-1 opacity-70">신규</span>}
              {!r.is_self && (
                <button className="ml-2 text-gray-500" aria-label={`${r.name} 제거`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>×</button>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className="g-input"
            list="golf-companions"
            placeholder="동반자 이름"
            value={newName}
            maxLength={30}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCompanion() } }}
          />
          <datalist id="golf-companions">
            {companionsDir.filter((p) => !rows.some((r) => r.player_id === p.id)).map((p) => <option key={p.id} value={p.display_name} />)}
          </datalist>
          <button className="g-btn-ghost whitespace-nowrap" onClick={addCompanion}>추가</button>
        </div>
      </section>

      {/* 스코어 */}
      <section className="g-card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">스코어</h2>
          <div className="flex text-xs rounded-lg overflow-hidden border border-gray-300">
            {(['total', 'holes'] as const).map((m) => (
              <button key={m} className={`px-3 py-1.5 ${mode === m ? 'bg-emerald-700 text-white' : 'bg-white'}`} onClick={() => setMode(m)}>
                {m === 'total' ? '총타만' : '홀별'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'total' && (
          <div className="space-y-2">
            {rows.map((r) => (
              <label key={r.key} className="flex items-center gap-3">
                <span className="w-24 truncate text-sm">{r.name}</span>
                <input
                  className="g-input"
                  type="number"
                  inputMode="numeric"
                  placeholder={holeCount ? `${holeCount}홀 총타` : '총타'}
                  value={r.total}
                  onChange={(e) => update(r.key, { total: e.target.value })}
                />
              </label>
            ))}
          </div>
        )}

        {mode === 'holes' && !holeCount && <p className="text-sm text-gray-500">골프장과 코스를 먼저 선택해주세요.</p>}

        {mode === 'holes' && holeCount > 0 && (
          <div className="space-y-3">
            {/* 홀 선택 칩 */}
            <div className="grid grid-cols-9 gap-1">
              {pars.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setHole(i)}
                  className={`h-8 rounded text-xs tabular-nums ${i === curHole ? 'bg-emerald-700 text-white font-bold' : holeFilled(i) ? 'bg-emerald-100 text-emerald-900' : 'bg-gray-100'}`}
                >{i + 1}</button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button className="g-btn-ghost" disabled={curHole === 0} onClick={() => setHole(curHole - 1)}>◀</button>
              <div className="text-center">
                <div className="text-lg font-bold">{curHole + 1}번 홀</div>
                <div className="text-xs text-gray-500">PAR {pars[curHole]}</div>
              </div>
              <button className="g-btn-ghost" disabled={curHole === holeCount - 1} onClick={() => setHole(curHole + 1)}>▶</button>
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={withPutts} onChange={(e) => setWithPutts(e.target.checked)} /> 퍼팅도 기록
            </label>

            <ul className="space-y-2">
              {rows.map((r) => {
                const s = r.strokes[curHole] ?? null
                const p = r.putts[curHole] ?? null
                const diff = s === null ? null : s - pars[curHole]
                return (
                  <li key={r.key} className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {r.name}
                      <span className="ml-1 text-[11px] text-gray-400 tabular-nums">계 {sum(fit(r.strokes, holeCount, null))}</span>
                    </span>
                    <button className="g-btn-ghost w-10" onClick={() => step(r, 'strokes', -1)}>−</button>
                    <button className="w-12 text-center" onClick={() => clearHole(r, 'strokes')} title="탭해서 지우기">
                      <span className="text-xl font-bold tabular-nums">{s ?? '·'}</span>
                      {diff !== null && <span className={`block text-[10px] ${diff < 0 ? 'text-blue-600' : diff > 0 ? 'text-red-600' : 'text-gray-500'}`}>{diff === 0 ? 'E' : diff > 0 ? `+${diff}` : diff}</span>}
                    </button>
                    <button className="g-btn-ghost w-10" onClick={() => step(r, 'strokes', 1)}>+</button>
                    {withPutts && (
                      <span className="flex items-center gap-1 ml-1 text-xs text-gray-600">
                        P
                        <button className="g-btn-ghost !px-2" onClick={() => step(r, 'putts', -1)}>−</button>
                        <span className="w-4 text-center tabular-nums">{p ?? '·'}</span>
                        <button className="g-btn-ghost !px-2" onClick={() => step(r, 'putts', 1)}>+</button>
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
            <p className="text-[11px] text-gray-400">처음 +/− 를 누르면 파로 채워져요. 숫자를 누르면 지워져요. 홀별로 입력할 때는 모든 홀을 채워야 저장돼요.</p>
          </div>
        )}
      </section>

      <section className="g-card">
        <label className="block">
          <span className="text-xs text-gray-500">한줄평 (선택, 100자)</span>
          <input className="g-input" value={memo} maxLength={100} placeholder="오늘의 라운드 한마디" onChange={(e) => setMemo(e.target.value)} />
        </label>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button className="g-btn flex-1" disabled={saving} onClick={submit}>{saving ? '저장 중…' : initial ? '수정 저장' : '저장'}</button>
        <a className="g-btn-ghost" href={initial ? `${BASE}/manage` : BASE}>취소</a>
      </div>
    </div>
  )
}

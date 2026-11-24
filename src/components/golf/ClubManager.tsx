import { useMemo, useState } from 'react'
import type { ClubWithCourses } from '../../lib/golf/repo'

interface Props {
  clubs: ClubWithCourses[]
  countries: Record<string, string>
}

const DEFAULT_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5]
const cyclePar = (p: number) => (p >= 6 ? 3 : p + 1)

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.')
  return data
}

function ParEditor({ pars, onChange }: { pars: number[]; onChange: (p: number[]) => void }) {
  return (
    <div>
      <div className="grid grid-cols-9 gap-1">
        {pars.map((p, i) => (
          <button
            key={i}
            type="button"
            className="g-btn-ghost !px-0 text-center tabular-nums"
            onClick={() => onChange(pars.map((x, j) => (j === i ? cyclePar(x) : x)))}
          >
            <span className="block text-[10px] text-kb-muted">{i + 1}</span>
            <span className="font-semibold">{p}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-kb-muted mt-1">홀을 누르면 파가 3→4→5→6 순서로 바뀌어요 · 합계 {pars.reduce((a, b) => a + b, 0)}</p>
    </div>
  )
}

function CourseAdder({ clubId, onDone }: { clubId: string; onDone: () => void }) {
  const [name, setName] = useState('')
  const [pars, setPars] = useState(DEFAULT_PARS)
  const [err, setErr] = useState('')
  const save = async () => {
    try {
      await call(`/api/golf/clubs/${clubId}/courses`, 'POST', { name, pars })
      onDone()
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <div className="mt-3 p-3 bg-kb-sunken rounded-lg space-y-2">
      <input className="g-input" placeholder="코스 이름 (예: 동코스, OUT)" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      <ParEditor pars={pars} onChange={setPars} />
      {err && <p className="text-xs text-kb-danger">{err}</p>}
      <button className="g-btn text-sm" onClick={save}>코스 저장</button>
    </div>
  )
}

function ClubEditor({ club, countries, onClose }: { club: ClubWithCourses; countries: Record<string, string>; onClose: () => void }) {
  const [name, setName] = useState(club.name)
  const [country, setCountry] = useState(club.country_code)
  const [region, setRegion] = useState(club.region ?? '')
  const [err, setErr] = useState('')
  const save = async () => {
    try {
      await call(`/api/golf/clubs/${club.id}`, 'PATCH', { name, country_code: country, region })
      location.reload()
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <div className="mt-3 p-3 bg-kb-sunken rounded-lg space-y-2">
      <input className="g-input" placeholder="골프장 이름" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select className="g-input" value={country} onChange={(e) => setCountry(e.target.value)}>
          {/* 목록에 없는 기존 국가 코드도 선택 상태를 유지 */}
          {!(country in countries) && <option value={country}>{country}</option>}
          {Object.entries(countries).map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
        </select>
        <input className="g-input" placeholder="지역 (예: 구마모토현)" maxLength={40} value={region} onChange={(e) => setRegion(e.target.value)} />
      </div>
      {err && <p className="text-xs text-kb-danger">{err}</p>}
      <div className="flex gap-2">
        <button className="g-btn text-sm" onClick={save}>저장</button>
        <button className="g-btn-ghost text-sm" onClick={onClose}>취소</button>
      </div>
    </div>
  )
}

function CourseRow({ course }: { course: ClubWithCourses['courses'][number] }) {
  const [editing, setEditing] = useState(false)
  const [pars, setPars] = useState(course.pars)
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      location.reload()
    } catch (e: any) {
      alert(e.message)
    }
  }
  return (
    <li className="py-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">{course.name}</span>
        <span className="text-xs text-kb-subdued tabular-nums flex-1 truncate">PAR {course.pars.reduce((a, b) => a + b, 0)} · {course.pars.join(' ')}</span>
        <button className="text-xs text-kb-primary" onClick={() => setEditing(!editing)}>{editing ? '닫기' : '파 수정'}</button>
        <button className="text-xs text-kb-danger" onClick={() => confirm(`${course.name} 코스를 삭제할까요?`) && run(() => call(`/api/golf/courses/${course.id}`, 'DELETE'))}>삭제</button>
      </div>
      {editing && (
        <div className="mt-2 space-y-2">
          <ParEditor pars={pars} onChange={setPars} />
          <button className="g-btn text-sm" onClick={() => run(() => call(`/api/golf/courses/${course.id}`, 'PATCH', { pars }))}>파 저장</button>
        </div>
      )}
    </li>
  )
}

export default function ClubManager({ clubs, countries }: Props) {
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(clubs.length === 0)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('KR')
  const [region, setRegion] = useState('')
  const [err, setErr] = useState('')
  const [addingCourseFor, setAddingCourseFor] = useState<string | null>(null)
  const [editingClub, setEditingClub] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? clubs.filter((c) => c.name.toLowerCase().includes(s) || (c.region ?? '').toLowerCase().includes(s)) : clubs
  }, [clubs, q])

  const addClub = async () => {
    try {
      const { id } = await call('/api/golf/clubs', 'POST', { name, country_code: country, region })
      sessionStorage.setItem('golf-new-club', id)
      location.reload()
    } catch (e: any) {
      setErr(e.message)
    }
  }

  // 방금 추가한 골프장은 바로 코스 추가 폼을 연다
  const [justAdded] = useState(() => {
    try {
      const id = sessionStorage.getItem('golf-new-club')
      sessionStorage.removeItem('golf-new-club')
      return id
    } catch {
      return null
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="g-input" placeholder="골프장 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="g-btn whitespace-nowrap text-sm" onClick={() => setShowAdd(!showAdd)}>{showAdd ? '닫기' : '+ 골프장'}</button>
      </div>

      {showAdd && (
        <div className="g-card space-y-2">
          <h2 className="font-semibold text-sm">골프장 추가</h2>
          <input className="g-input" placeholder="골프장 이름" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="g-input" value={country} onChange={(e) => setCountry(e.target.value)}>
              {Object.entries(countries).map(([code, label]) => <option key={code} value={code}>{label} ({code})</option>)}
            </select>
            <input className="g-input" placeholder="지역 (선택)" maxLength={40} value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          {err && <p className="text-xs text-kb-danger">{err}</p>}
          <button className="g-btn text-sm" onClick={addClub}>저장</button>
        </div>
      )}

      <ul className="space-y-2">
        {filtered.map((c) => {
          const open = addingCourseFor === c.id || (justAdded === c.id && addingCourseFor === null)
          return (
            <li key={c.id} className="g-card !p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-kb-subdued">{countries[c.country_code] ?? c.country_code}{c.region ? ` · ${c.region}` : ''}</div>
                </div>
                <button className="text-xs text-kb-primary" onClick={() => setEditingClub(editingClub === c.id ? null : c.id)}>{editingClub === c.id ? '닫기' : '수정'}</button>
                <button className="text-xs text-kb-primary" onClick={() => setAddingCourseFor(open ? '' : c.id)}>{open ? '닫기' : '+ 코스'}</button>
                {c.courses.length === 0 && (
                  <button className="text-xs text-kb-danger" onClick={async () => {
                    if (!confirm(`${c.name} 골프장을 삭제할까요?`)) return
                    try { await call(`/api/golf/clubs/${c.id}`, 'DELETE'); location.reload() } catch (e: any) { alert(e.message) }
                  }}>삭제</button>
                )}
              </div>
              {editingClub === c.id && <ClubEditor club={c} countries={countries} onClose={() => setEditingClub(null)} />}
              {c.courses.length > 0 && (
                <ul className="mt-2 divide-y divide-kb-border border-t border-kb-border">
                  {c.courses.map((co) => <CourseRow key={co.id} course={co} />)}
                </ul>
              )}
              {c.courses.length === 0 && !open && <p className="text-xs text-kb-warning mt-1">코스가 없어요. 코스를 추가해야 라운드에 쓸 수 있어요.</p>}
              {open && <CourseAdder clubId={c.id} onDone={() => location.reload()} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

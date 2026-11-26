// /private/ziha 북마크의 사이트 태그 판정과 제목 정리.
// 사이트는 URL 호스트로 판정해 bookmarks.site 에 저장하고, 제목에 붙은 사이트명은 지운다.

export const SITES = ['topgirl', 'sogirl', '123av', 'missav', 'njav'] as const
export type Site = (typeof SITES)[number]

export const SITE_LABELS: Record<Site, string> = {
  topgirl: '탑걸',
  sogirl: '쏘걸',
  '123av': '123av',
  missav: 'MissAV',
  njav: 'nJAV',
}

export function isSite(v: unknown): v is Site {
  return typeof v === 'string' && (SITES as readonly string[]).includes(v)
}

// missav123.com 이 '123' 을 포함하므로 missav 를 123av 보다 먼저 본다.
export function detectSite(url: string): Site | null {
  let host = ''
  try {
    host = new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase()
  } catch {
    return null
  }
  if (host.includes('missav')) return 'missav'
  if (host.includes('topgirl')) return 'topgirl'
  if (host.includes('sogirl')) return 'sogirl'
  if (/(^|\.)123av\./.test(host)) return '123av'
  if (host.includes('njav')) return 'njav'
  return null
}

// 긴 표기부터 먼저 매칭되도록 순서를 둔다.
const SITE_WORDS = [
  'AV탑걸-AVTopGirl', 'AV쏘걸-AVSogirl', '탑걸-AVSogirl', '쏘걸-AVTopGirl',
  'missav(?:123)?(?:\\.[a-z]*)?', 'njav(?:tv)?(?:\\.[a-z]*)?', 'AV탑걸', 'AV쏘걸', 'AVTopGirl', 'AVSogirl', 'TopGirl', 'Sogirl',
  '123av', '탑걸', '쏘걸',
]
const SEP = '[\\s\\-|=.–]'
const SITE_RE = new RegExp(`${SEP}*(?:${SITE_WORDS.join('|')})${SEP}*`, 'gi')
const PROMO_RE = /\s*\|\s*무료(?:\s[^|]*)?$/ // "| 무료 HD AV 온라인 시청" ("| 무료 H" 처럼 잘린 꼬리 포함)

// 🔳 로 감싼 구분선 제목(예: "🔳🔳🔳 MissAV 🔳🔳🔳")은 사이트명이 곧 제목이라 건드리지 않는다.
export function stripSiteFromTitle(title: string): string {
  const src = String(title ?? '')
  if (src.includes('🔳')) return src.trim()

  let t = src.replace(PROMO_RE, '')
  t = t.replace(SITE_RE, (m, offset: number, whole: string) => {
    const atEnd = offset + m.length >= whole.length
    const before = whole.slice(0, offset)
    // 앞이 비었거나 이모지·기호로 끝나면 공백 없이 붙이고, 문장 중간이면 공백 하나로 잇는다.
    if (atEnd || !before.trim() || !/[\p{L}\p{N})\]]$/u.test(before)) return ''
    return ' '
  })
  t = t.replace(/\s{2,}/g, ' ').trim()
  return t || src.trim()
}

// 메모는 '|' 로 여러 키워드를 담는다 (예: "학생|학교|선생").
// 앞뒤 공백·빈 키워드·중복을 정리하고, 100자를 넘기면 넘치는 키워드는 통째로 버린다(키워드를 중간에서 자르지 않는다).
export const MEMO_SEP = '|'
export function splitMemo(memo: string | null | undefined): string[] {
  const out: string[] = []
  for (const t of String(memo ?? '').split(MEMO_SEP)) {
    const k = t.trim()
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}
export function normalizeMemo(memo: string | null | undefined, max = 100): string | null {
  let joined = ''
  for (const k of splitMemo(memo)) {
    const next = joined ? joined + MEMO_SEP + k : k
    if (next.length > max) break
    joined = next
  }
  return joined || null
}

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HTML_PATH = '/Users/dylan/Documents/Projects/BankWallet/ziha.html'
const OUT_PATH  = resolve(__dirname, '../migrations/0007_ziha_import.sql')

const html = readFileSync(HTML_PATH, 'utf8')

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

function escSql(s) {
  return s.replace(/'/g, "''")
}

// href="..." 와 텍스트 추출 (대소문자 무관)
const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
const seen = new Set()
const rows = []

let m
while ((m = linkRe.exec(html)) !== null) {
  const url   = decodeEntities(m[1].trim())
  const raw   = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const title = decodeEntities(raw)

  if (!url || !title) continue
  // javascript:, mailto: 등 제외
  if (!url.startsWith('http')) continue
  // URL 기준 중복 제거
  if (seen.has(url)) continue
  seen.add(url)

  const sort = title.includes('🔳') ? 0 : 1
  rows.push({ title, url, sort })
}

const lines = rows.map(r =>
  `INSERT OR IGNORE INTO bookmarks (title, url, star, sort) VALUES ('${escSql(r.title)}', '${escSql(r.url)}', 0, ${r.sort});`
)

const sql = `-- ziha.html import (${rows.length} rows)\n` + lines.join('\n') + '\n'
writeFileSync(OUT_PATH, sql, 'utf8')

const hidden = rows.filter(r => r.sort === 0).length
console.log(`총 ${rows.length}개 링크 → 0007_ziha_import.sql 생성 (sort=0: ${hidden}개, sort=1: ${rows.length - hidden}개)`)
